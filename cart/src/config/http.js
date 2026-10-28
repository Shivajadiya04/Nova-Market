// Production HTTP plumbing shared by the services: health check, JSON 404/error responses
// (no stack traces or HTML leak to clients) and graceful shutdown.
const mongoose = require('mongoose');

// GET /health: 200 when the service and its database are usable, 503 otherwise.
function healthHandler(req, res) {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'unavailable', database: connected ? 'connected' : 'disconnected' });
}

function notFound(req, res) {
    res.status(404).json({ message: `Not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large' });
    if (err.name === 'CastError') return res.status(400).json({ message: `Invalid value for ${err.path}` });
    if (err.name === 'MulterError') return res.status(400).json({ message: err.message });
    if (err.code === 11000) return res.status(409).json({ message: 'A record with this value already exists' });
    console.error(`${req.method} ${req.originalUrl} failed:`, err);
    res.status(err.status && err.status < 500 ? err.status : 500).json({ message: err.status && err.status < 500 ? err.message : 'Internal server error' });
}

// Stops accepting connections, runs cleanup (DB, broker) and exits; forced after 10s.
function installGracefulShutdown(server, cleanups = []) {
    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`${signal} received, shutting down`);
        setTimeout(() => process.exit(1), 10000).unref();
        server.close();
        for (const cleanup of cleanups) {
            await Promise.resolve().then(cleanup).catch(err => console.error('Shutdown step failed:', err.message));
        }
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { healthHandler, notFound, errorHandler, installGracefulShutdown };
