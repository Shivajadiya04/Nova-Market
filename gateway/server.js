// Public entry point (plays the role of a load balancer):
//  - proxies /api/* to the private backend services, including the AI Buddy websocket
//  - rejects tokens revoked by logout before they reach any service
//  - serves the built React app (frontend/dist) with client-side routing fallback
// Browser traffic stays on one origin, so the httpOnly auth cookie works without CORS.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const routes = require('./src/routes');
const { extractToken, createRevocationChecker, markRevoked } = require('./src/revocation');

function serviceUrl(name) {
    const value = (process.env[ name ] || '').replace(/\/+$/, '');
    if (!value) return null;
    return /^https?:\/\//.test(value) ? value : `http://${value}`;
}

// ---------- configuration ----------
const missing = [ 'INTERNAL_SERVICE_TOKEN', ...routes.filter(r => !r.optional).map(r => r.env) ].filter(name => !process.env[ name ]);
if (missing.length) {
    console.error(`[config] Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
    process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';
const distDir = path.resolve(process.env.FRONTEND_DIST || path.join(__dirname, '..', 'frontend', 'dist'));
const hasFrontend = fs.existsSync(path.join(distDir, 'index.html'));
if (isProduction && !hasFrontend) {
    console.error(`[config] Frontend build not found at ${distDir}. Run "npm run build" in frontend/ during the build step.`);
    process.exit(1);
}

const isRevoked = createRevocationChecker(serviceUrl('AUTH_SERVICE_URL'), process.env.INTERNAL_SERVICE_TOKEN);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ---------- security headers ----------
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// ---------- health ----------
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Reports each backend's own /health (useful after a deploy)
app.get('/health/services', async (req, res) => {
    const results = await Promise.all(routes.map(async (route) => {
        const base = serviceUrl(route.env);
        if (!base) return [ route.env, 'not configured' ];
        try {
            const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
            return [ route.env, response.ok ? 'ok' : `unhealthy (${response.status})` ];
        } catch (err) {
            return [ route.env, `unreachable (${err.cause?.code || err.message})` ];
        }
    }));
    const services = Object.fromEntries(results);
    const allOk = Object.values(services).every(status => status === 'ok' || status === 'not configured');
    res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', services });
});

// ---------- API ----------
// Never forward an internal token supplied by a client
app.use('/api', (req, res, next) => {
    delete req.headers[ 'x-internal-token' ];
    next();
});

// A browser still holding a revoked cookie must be able to log in again
const REVOCATION_EXEMPT = [ '/auth/login', '/auth/register', '/auth/logout' ];

async function rejectRevokedToken(req, res, next) {
    const token = extractToken(req);
    if (token && req.path === '/auth/logout') {
        res.on('finish', () => { if (res.statusCode === 200) markRevoked(token); });
    }
    if (!token || REVOCATION_EXEMPT.includes(req.path)) return next();
    try {
        if (await isRevoked(token)) {
            return res.status(401).json({ message: 'Session has ended, please log in again' });
        }
        next();
    } catch (err) {
        // Fail closed: without the auth service we cannot tell whether the token was revoked
        console.error('Revocation check failed:', err.message);
        res.status(503).json({ message: 'Authentication service unavailable' });
    }
}
app.use('/api', rejectRevokedToken);

const wsProxies = [];
for (const route of routes) {
    const target = serviceUrl(route.env);
    if (!target) {
        console.warn(`[config] ${route.env} not set: ${route.prefix} is disabled`);
        app.use(route.prefix, (req, res) => res.status(503).json({ message: 'This feature is not configured' }));
        continue;
    }

    const proxy = createProxyMiddleware({
        target,
        pathFilter: route.prefix, // keeps the full /api/... path, which the services expect
        changeOrigin: true,
        xfwd: true,
        // Upgrades are routed only by the server 'upgrade' handler below (after the revocation
        // check); ws:true would make the library subscribe to upgrades on its own.
        ws: false,
        proxyTimeout: 30000,
        timeout: 30000,
        on: {
            error: (err, req, res) => {
                console.error(`Proxy error for ${req.method} ${req.url}:`, err.code || err.message);
                if (res && typeof res.writeHead === 'function' && !res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Service temporarily unavailable' }));
                } else if (res && typeof res.destroy === 'function') {
                    res.destroy();
                }
            },
        },
    });
    app.use(proxy);
    if (route.ws) wsProxies.push({ prefix: route.prefix, proxy });
}

app.use('/api', (req, res) => res.status(404).json({ message: `Not found: ${req.method} ${req.path}` }));

// ---------- frontend ----------
if (hasFrontend) {
    // Hashed asset files can be cached forever; index.html must always be revalidated
    app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(distDir, 'index.html'));
    });
} else {
    app.get('/', (req, res) => res.status(200).json({ message: 'Gateway is running (no frontend build found; use the Vite dev server)' }));
}

app.use((req, res) => res.status(404).json({ message: 'Not found' }));

// ---------- server ----------
const server = http.createServer(app);

// Websocket upgrades (AI Buddy chat) bypass Express middleware, so check revocation here too
server.on('upgrade', async (req, socket, head) => {
    const match = wsProxies.find(({ prefix }) => req.url.startsWith(prefix));
    if (!match) return socket.destroy();
    delete req.headers[ 'x-internal-token' ];
    try {
        const token = extractToken(req);
        if (token && await isRevoked(token)) return socket.destroy();
    } catch (err) {
        console.error('Revocation check failed for websocket:', err.message);
        return socket.destroy();
    }
    match.proxy.upgrade(req, socket, head);
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, () => {
    console.log(`Gateway listening on port ${port}${hasFrontend ? ` (serving ${distDir})` : ' (API only)'}`);
});

function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    setTimeout(() => process.exit(1), 10000).unref();
    server.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
