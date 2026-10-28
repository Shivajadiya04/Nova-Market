const mongoose = require('mongoose');
const { connectInMemory } = require('../../../mock-data/memory-driver');
const userModel = require('../models/user.model');
const productModel = require('../models/product.model');
const orderModel = require('../models/order.model');
const paymentModel = require('../models/payment.model');
const { users, products, orders, payments } = require('../../../mock-data');

// Development-only database: a pure-JavaScript in-memory store (mock-data/memory-driver.js) seeded from /mock-data.
// In real mode this service builds its copy of users/products/orders/payments from
// RabbitMQ events; in mock mode there is no broker, so the copy is seeded directly.
async function connectMockDB() {
    await connectInMemory(mongoose, 'seller-dashboard-mock');

    await Promise.all([
        userModel.insertMany(users.map(({ password, ...user }) => user)),
        productModel.insertMany(products),
        orderModel.insertMany(orders),
        paymentModel.insertMany(payments),
    ]);

    console.log('[mock-db] In-memory database ready with sample users, products, orders and payments. Data resets when the service restarts.');
}

module.exports = connectMockDB;
