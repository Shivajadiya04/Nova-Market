const express = require('express');
const cookieParser = require('cookie-parser');
const paymentRoutes = require('./routes/payment.routes');
const { healthHandler, notFound, errorHandler } = require('./config/http');


const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Keep the raw bytes: Razorpay webhook signatures are computed over the exact request body
app.use(express.json({
    limit: '100kb',
    verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(cookieParser());


app.get('/', (req, res) => {
    res.status(200).json({
        message: "Payment service is running"
    });
})

app.get('/health', healthHandler);

app.use('/api/payments', paymentRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
