const express = require('express');
const cookieParser = require('cookie-parser');

const orderRoutes = require("./routes/order.routes")
const orderController = require("./controllers/order.controller")
const { healthHandler, notFound, errorHandler } = require('./config/http');
const { requireInternalToken } = require('./config/internal');




const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());


app.get('/', (req, res) => {
    res.status(200).json({
        message: "Order service is running"
    });
})

app.get('/health', healthHandler);

app.use("/api/orders", orderRoutes)

// Service-to-service only (called by the payment service; not routed by the gateway)
app.post("/internal/orders/:id/payment-confirmed", requireInternalToken, orderController.confirmOrderPayment)

app.use(notFound);
app.use(errorHandler);

module.exports = app;
