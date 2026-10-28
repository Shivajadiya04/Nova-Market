const mongoose = require('mongoose');
const { isMockMode } = require('../config/env');


async function connectDB() {
    if (isMockMode()) {
        return require('./mock')();
    }

    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log('MongoDB connected');
    }
    catch (err) {
        console.log('MongoDB connection error:', err);
        throw err;
    }
}

module.exports = connectDB;
