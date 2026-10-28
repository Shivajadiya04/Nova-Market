require('dotenv').config();
const { validateEnv, isMockMode } = require('./src/config/env');

validateEnv({
    required: [ 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN', 'ORDER_SERVICE_URL' ],
    requiredUnlessMock: [ 'MONGO_URI', 'RABBIT_URL', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET' ],
});

if (!isMockMode() && !process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.warn('[config] RAZORPAY_WEBHOOK_SECRET not set: orders are only confirmed when the browser completes /verify. Configure the webhook for production.');
}

const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/db/db');
const broker = require('./src/broker/borker');
const { installGracefulShutdown } = require('./src/config/http');

connectDB().catch((err) => {
    console.error('Database startup failed:', err.message);
    process.exit(1);
});
broker.connect();

const port = Number(process.env.PORT) || 3004;
const server = app.listen(port, () => {
    console.log(`Payment service is running on port ${port}`);
})

installGracefulShutdown(server, [ () => broker.close(), () => mongoose.connection.close() ]);
