const express = require('express');


const app = express();
app.disable('x-powered-by');


app.get('/', (req, res) => {
    res.status(200).json({
        message: "AI service is running"
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});


module.exports = app;
