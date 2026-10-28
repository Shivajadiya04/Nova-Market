const mongoose = require('mongoose');
const { connectInMemory } = require('../../../mock-data/memory-driver');
const paymentModel = require('../models/payment.model');
const { payments } = require('../../../mock-data');

// Development-only database: a pure-JavaScript in-memory store (mock-data/memory-driver.js)
// seeded from /mock-data. The service keeps using its normal Mongoose models; all data is lost on restart.
async function connectMockDB() {
    await connectInMemory(mongoose, 'payment-mock');

    await paymentModel.insertMany(payments);

    console.log(`[mock-db] In-memory database ready with ${payments.length} sample payments. Data resets when the service restarts.`);
}

module.exports = connectMockDB;
