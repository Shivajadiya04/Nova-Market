require('dotenv').config()
const { validateEnv } = require("./src/config/env")

validateEnv({
    required: [ "JWT_SECRET" ],
    requiredUnlessMock: [ "MONGO_URI" ],
})

const mongoose = require("mongoose")
const app = require("./src/app")
const connectDB = require("./src/db/db")
const { installGracefulShutdown } = require("./src/config/http")


connectDB().catch((err) => {
    console.error("Database startup failed:", err.message);
    process.exit(1);
});


const port = Number(process.env.PORT) || 3002;
const server = app.listen(port, () => {
    console.log(`Cart service is running on port ${port}`);
})

installGracefulShutdown(server, [ () => mongoose.connection.close() ]);
