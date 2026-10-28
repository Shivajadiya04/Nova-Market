const mongoose = require('mongoose');
const { connectInMemory } = require('../../../mock-data/memory-driver');
const orderModel = require('../models/order.model');
const { orders } = require('../../../mock-data');

// Development-only database: a pure-JavaScript in-memory store (mock-data/memory-driver.js)
// seeded from /mock-data. The service keeps using its normal Mongoose models; all data is lost on restart.
async function connectMockDB() {
    await connectInMemory(mongoose, 'order-mock');

    await orderModel.insertMany(orders);

    console.log(`[mock-db] In-memory database ready with ${orders.length} sample orders. Data resets when the service restarts.`);
}

module.exports = connectMockDB;
