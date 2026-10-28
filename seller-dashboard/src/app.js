const express = require('express');
const cookieParser = require('cookie-parser');
const sellerRoutes = require('./routes/seller.routes');
const { healthHandler, notFound, errorHandler } = require('./config/http');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);


app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());


app.get('/', (req, res) => {
    res.status(200).json({ message: 'Seller Dashboard Service is running.' });
});

app.get('/health', healthHandler);

app.use("/api/seller/dashboard", sellerRoutes);

app.use(notFound);
app.use(errorHandler);


module.exports = app;
