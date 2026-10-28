const mongoose = require('mongoose');
const { connectInMemory } = require('../../../mock-data/memory-driver');
const bcrypt = require('bcryptjs');
const userModel = require('../models/user.model');
const { users } = require('../../../mock-data');

// Development-only database: a pure-JavaScript in-memory store (mock-data/memory-driver.js)
// seeded from /mock-data. The service keeps using its normal Mongoose models; all data is lost on restart.
async function connectMockDB() {
    await connectInMemory(mongoose, 'auth-mock');

    const seededUsers = await Promise.all(users.map(async user => ({
        ...user,
        password: await bcrypt.hash(user.password, 10),
    })));
    await userModel.insertMany(seededUsers);

    console.log(`[mock-db] In-memory database ready with ${seededUsers.length} sample users. Data resets when the service restarts.`);
}

module.exports = connectMockDB;
