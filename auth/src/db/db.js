const mongoose = require('mongoose');
const { isMockMode } = require('../config/env');


async function connectDB() {
    if (isMockMode()) {
        return require('./mock')();
    }

    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log("Database connected successfully");
    } catch (err) {
        console.error("Database connection failed", err);
        throw err;
    }
}

module.exports = connectDB;
