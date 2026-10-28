// Rejects tokens revoked by logout before requests reach any backend. The auth service owns
// the revocation list; answers are cached briefly to avoid a lookup on every request.
const crypto = require('crypto');
const cookie = require('cookie');

const CACHE_MS = 5000;
const MAX_CACHE_ENTRIES = 10000;
const cache = new Map(); // sha256(token) -> { revoked, expiresAt }

function extractToken(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice(7);
    const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
    return cookies.token || null;
}

const keyFor = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Called when a logout through this gateway succeeds, so the cache never serves a stale
// "not revoked" answer for that token. (Logouts are otherwise picked up within CACHE_MS.)
function markRevoked(token) {
    cache.set(keyFor(token), { revoked: true, expiresAt: Infinity });
}

function createRevocationChecker(authServiceUrl, internalToken) {
    return async function isRevoked(token) {
        const key = keyFor(token);
        const cached = cache.get(key);
        if (cached && (cached.revoked || cached.expiresAt > Date.now())) return cached.revoked;

        const response = await fetch(`${authServiceUrl}/internal/tokens/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-token': internalToken },
            body: JSON.stringify({ token }),
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`auth service answered ${response.status}`);
        const { revoked } = await response.json();

        if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
        cache.set(key, { revoked, expiresAt: Date.now() + CACHE_MS });
        return revoked;
    };
}

module.exports = { extractToken, createRevocationChecker, markRevoked };
