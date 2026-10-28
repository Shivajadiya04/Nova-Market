const express = require('express');
const cartRoutes = require('./routes/cart.routes');
const cookieParser = require('cookie-parser');
const { healthHandler, notFound, errorHandler } = require('./config/http');


const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());



app.get('/', (req, res) => {
    res.status(200).json({
        message: "Cart service is running"
    });
})

app.get('/health', healthHandler);

app.use('/api/cart', cartRoutes);

app.use(notFound);
app.use(errorHandler);



module.exports = app;
