const mongoose = require('mongoose');
const { isMockMode } = require('../config/env');




async function connectDB() {
    if (isMockMode()) {
        return require('./mock')();
    }

    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);
    }
}


module.exports = connectDB;
