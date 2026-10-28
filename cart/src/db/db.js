const mongoose = require("mongoose");
const { isMockMode } = require("../config/env");



async function connectDB() {

    if (isMockMode()) {
        return require("./mock")();
    }

    try {

        await mongoose.connect(process.env.MONGO_URI);

        console.log("Connected to the database");

    } catch (err) {

        console.error("Error connecting to the database", err);
        throw err;

    }

}

module.exports = connectDB;
