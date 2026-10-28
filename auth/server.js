require('dotenv').config();
const { validateEnv, isMockMode } = require('./src/config/env');

validateEnv({
    required: [ 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN' ],
    requiredUnlessMock: [ 'MONGO_URI', 'RABBIT_URL' ],
});

if (!isMockMode() && process.env.NODE_ENV !== 'test' && !process.env.REDIS_URL && !process.env.REDIS_HOST) {
    console.error('[config] Missing required environment variables: REDIS_URL (or REDIS_HOST). Redis stores revoked tokens for server-side logout.');
    process.exit(1);
}

const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/db/db');
const broker = require('./src/broker/borker');
const redis = require('./src/db/redis');
const { installGracefulShutdown } = require('./src/config/http');


connectDB().catch((err) => {
    console.error('Database startup failed:', err.message);
    process.exit(1);
});
broker.connect();

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})

installGracefulShutdown(server, [ () => broker.close(), () => redis.quit(), () => mongoose.connection.close() ]);
