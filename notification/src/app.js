const express = require("express");
const { connect } = require("./borker/borker");
const setListeners = require("./borker/listners");
const app = express();
app.disable('x-powered-by');

// Consumers are registered once; the broker attaches them on connect and after reconnects
setListeners();
connect();

app.get("/", (req, res) => {
    res.status(200).json({
        message: "Notification service is running"
    });
})

app.get("/health", (req, res) => {
    res.status(200).json({ status: 'ok' });
})



module.exports = app;
