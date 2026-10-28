require('dotenv').config();
const { validateEnv } = require('./src/config/env');

validateEnv({
    required: [ 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN', 'CART_SERVICE_URL', 'PRODUCT_SERVICE_URL' ],
    requiredUnlessMock: [ 'MONGO_URI', 'RABBIT_URL' ],
});

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


const port = Number(process.env.PORT) || 3003;
const server = app.listen(port, () => {
    console.log(`Order service is running on port ${port}`);
})

installGracefulShutdown(server, [ () => broker.close(), () => mongoose.connection.close() ]);
