require('dotenv').config();
const { validateEnv, isMockMode } = require('./src/config/env');

validateEnv({
    required: [ 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN' ],
    // ImageKit is only optional in mock mode, where uploaded images are stored inline
    requiredUnlessMock: [ 'MONGO_URI', 'RABBIT_URL', 'IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_PRIVATE_KEY', 'IMAGEKIT_URL_ENDPOINT' ],
});

if (isMockMode() && !process.env.IMAGEKIT_PRIVATE_KEY) {
    console.warn('[config] IMAGEKIT_* keys not set: uploaded product images will be stored inline (mock mode only)');
}

const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/db/db');
const broker = require("./src/broker/borker")
const { installGracefulShutdown } = require('./src/config/http');

connectDB().catch((err) => {
    console.error('Database startup failed:', err.message);
    process.exit(1);
});

broker.connect();

const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, () => {
    console.log(`Product service listening on port ${port}`);
})

installGracefulShutdown(server, [ () => broker.close(), () => mongoose.connection.close() ]);
