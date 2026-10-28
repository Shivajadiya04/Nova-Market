const mongoose = require('mongoose');
const { connectInMemory } = require('../../../mock-data/memory-driver');
const productModel = require('../models/product.model');
const { products } = require('../../../mock-data');

// Development-only database: a pure-JavaScript in-memory store (mock-data/memory-driver.js)
// seeded from /mock-data. The service keeps using its normal Mongoose models; all data is lost on restart.
async function connectMockDB() {
    await connectInMemory(mongoose, 'product-mock');

    await productModel.insertMany(products);

    console.log(`[mock-db] In-memory database ready with ${products.length} sample products. Data resets when the service restarts.`);
}

module.exports = connectMockDB;
