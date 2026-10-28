const express = require('express');
const cookieParser = require('cookie-parser');
const { healthHandler, notFound, errorHandler } = require('./config/http');
const { requireInternalToken } = require('./config/internal');




const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());



app.get('/', (req, res) => {
    res.status(200).json({
        message: "Auth service is running"
    });
})

app.get('/health', healthHandler);

// Routes
const authRoutes = require('./routes/auth.routes');
const authController = require('./controllers/auth.controller');
app.use('/api/auth', authRoutes);

// Service-to-service only (not routed by the gateway)
app.post('/internal/tokens/status', requireInternalToken, authController.getTokenStatus);

app.use(notFound);
app.use(errorHandler);


module.exports = app;
