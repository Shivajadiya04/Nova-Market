const { isMockMode } = require('../config/env');

// Use an in-memory fake Redis when running tests to avoid connecting to production,
// and in mock development mode when no Redis is configured
if (process.env.NODE_ENV === 'test' || (isMockMode() && !process.env.REDIS_URL && !process.env.REDIS_HOST)) {
    class FakeRedis {
        constructor() {
            this.store = new Map();
            this.expires = new Map();
        }
        async set(key, value, ...args) {
            // Support optional EX ttl
            if (args && args.length >= 2) {
                const exIndex = args.findIndex(a => String(a).toUpperCase() === 'EX');
                if (exIndex !== -1 && args[ exIndex + 1 ] != null) {
                    const seconds = Number(args[ exIndex + 1 ]);
                    const expireAt = Date.now() + seconds * 1000;
                    this.expires.set(key, expireAt);
                } else {
                    this.expires.delete(key);
                }
            } else {
                this.expires.delete(key);
            }
            this.store.set(key, value);
            return 'OK';
        }
        async get(key) {
            const exp = this.expires.get(key);
            if (exp && Date.now() > exp) {
                this.store.delete(key);
                this.expires.delete(key);
                return null;
            }
            return this.store.has(key) ? this.store.get(key) : null;
        }
        async del(key) {
            const existed = this.store.has(key) ? 1 : 0;
            this.store.delete(key);
            this.expires.delete(key);
            return existed;
        }
        on() { /* no-op in tests */ }
        quit() { return Promise.resolve(); }
    }
    module.exports = new FakeRedis();
} else {
    const { Redis } = require('ioredis');
    // REDIS_URL (redis:// or rediss:// for TLS, e.g. Render Key Value or Upstash) takes
    // precedence over the individual host/port/password settings.
    const redis = process.env.REDIS_URL
        ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 })
        : new Redis({
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD,
            maxRetriesPerRequest: 2,
        });

    redis.on('connect', () => {
        console.log('Connected to Redis');
    });

    redis.on('error', (err) => {
        console.error('Redis error:', err.message);
    });

    module.exports = redis;
}
