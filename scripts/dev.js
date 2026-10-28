// Starts the backend services, the gateway and the Vite frontend as separate local processes
// (no Docker). Each service reads its own .env, so mock vs real mode is decided there (USE_MOCK_DB).
// Request path, as in production: browser -> Vite :5173 -> gateway :8080 -> services.
//   npm run dev       core services + gateway + frontend
//   npm run dev:all   also ai-buddy and notification (need real Gemini / Gmail / RabbitMQ credentials)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { root, coreServices, optionalServices, gateway } = require('./services');

const withOptional = process.argv.includes('--all');
const services = withOptional ? [ ...coreServices, ...optionalServices ] : coreServices;
const children = [];

const missingEnv = [ ...services.map(s => s.name), gateway.name, 'frontend' ].filter(dir => !fs.existsSync(path.join(root, dir, '.env')));
if (missingEnv.length) {
    console.error(`Missing .env in: ${missingEnv.join(', ')}. Run "npm run setup" first.`);
    process.exit(1);
}

function start(name, args, cwd, extraEnv = {}) {
    const child = spawn(process.execPath, args, {
        cwd,
        env: { ...process.env, ...extraEnv },
    });
    const prefix = `[${name}]`.padEnd(19);
    const pipe = (stream, out) => {
        let buffered = '';
        stream.on('data', chunk => {
            buffered += chunk;
            const lines = buffered.split(/\r?\n/);
            buffered = lines.pop();
            lines.forEach(line => out.write(`${prefix} ${line}\n`));
        });
    };
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);
    child.on('exit', code => console.log(`${prefix} exited with code ${code}`));
    children.push(child);
}

for (const service of services) {
    start(service.name, [ 'server.js' ], path.join(root, service.name));
}

// With --all, route the assistant's websocket to the local ai-buddy service
start(gateway.name, [ 'server.js' ], path.join(root, gateway.name),
    withOptional && !process.env.AI_BUDDY_SERVICE_URL ? { AI_BUDDY_SERVICE_URL: 'http://localhost:3005' } : {});

start('frontend', [ path.join('node_modules', 'vite', 'bin', 'vite.js') ], path.join(root, 'frontend'));

function shutdown() {
    children.forEach(child => child.kill());
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
