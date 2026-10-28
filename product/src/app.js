const express = require('express');
const cookieParser = require('cookie-parser');
const productRoutes = require('./routes/product.routes');
const productController = require('./controllers/product.controller');
const { healthHandler, notFound, errorHandler } = require('./config/http');
const { requireInternalToken } = require('./config/internal');


const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());



app.get('/', (req, res) => {
    res.status(200).json({
        message: "Product service is running"
    });
})

app.get('/health', healthHandler);

app.use('/api/products', productRoutes);

// Service-to-service only (called by the order service; not routed by the gateway)
app.post('/internal/stock/reserve', requireInternalToken, productController.reserveStock);
app.post('/internal/stock/release', requireInternalToken, productController.releaseStock);

app.use(notFound);
app.use(errorHandler);


module.exports = app;
