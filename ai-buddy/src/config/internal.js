// Service-to-service helpers. Internal endpoints live under /internal (never /api), so the
// gateway does not route them, and they additionally require the shared INTERNAL_SERVICE_TOKEN.
const crypto = require('crypto');

const HEADER = 'x-internal-token';

// *_SERVICE_URL may be a full URL or a bare host:port (as Render's private network provides).
function serviceUrl(name) {
    const value = (process.env[ name ] || '').replace(/\/+$/, '');
    if (!value) throw new Error(`${name} is not configured`);
    return /^https?:\/\//.test(value) ? value : `http://${value}`;
}

function internalHeaders() {
    return { [ HEADER ]: process.env.INTERNAL_SERVICE_TOKEN };
}

function requireInternalToken(req, res, next) {
    const expected = Buffer.from(process.env.INTERNAL_SERVICE_TOKEN || '');
    const received = Buffer.from(String(req.headers[ HEADER ] || ''));
    if (!expected.length || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
        return res.status(401).json({ message: 'Unauthorized internal request' });
    }
    next();
}

module.exports = { serviceUrl, internalHeaders, requireInternalToken };
