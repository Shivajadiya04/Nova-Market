require('dotenv').config();
const { validateEnv } = require('./src/config/env');

validateEnv({
    required: [ 'JWT_SECRET' ],
    requiredUnlessMock: [ 'MONGO_URI', 'RABBIT_URL' ],
});

const mongoose = require('mongoose');
const app = require('./src/app');

const connectDB = require('./src/db/db');
const listener = require('./src/broker/listener');
const broker = require('./src/broker/broker');
const { installGracefulShutdown } = require('./src/config/http');


connectDB().catch((err) => {
    console.error('Database startup failed:', err.message);
    process.exit(1);
});

// Consumers are registered once; the broker re-attaches them after reconnects
listener();


const port = Number(process.env.PORT) || 3007;
const server = app.listen(port, () => {
    console.log(`Seller server is running on port ${port}`);
})

installGracefulShutdown(server, [ () => broker.close(), () => mongoose.connection.close() ]);
