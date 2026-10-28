// Server-side logout: revoked tokens are stored in Redis (as a SHA-256 hash, never the raw
// token) until the moment they would have expired anyway.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const redis = require('../db/redis');

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

const keyFor = (token) => `blacklist:${crypto.createHash('sha256').update(token).digest('hex')}`;

async function revokeToken(token) {
    const decoded = jwt.decode(token);
    const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : DEFAULT_TTL_SECONDS;
    if (ttl > 0) {
        await redis.set(keyFor(token), '1', 'EX', ttl);
    }
}

async function isTokenRevoked(token) {
    return (await redis.get(keyFor(token))) !== null;
}

module.exports = { revokeToken, isTokenRevoked };
