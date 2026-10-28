require('dotenv').config();

// This service has no mock mode: it needs a real Google Gemini API key.
const missing = [ 'JWT_SECRET', 'GOOGLE_API_KEY', 'PRODUCT_SERVICE_URL', 'CART_SERVICE_URL' ].filter(name => !process.env[ name ]);
if (missing.length) {
    console.error(`[config] Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
    process.exit(1);
}

const app = require('./src/app');
const http = require('http');

const { initSocketServer } = require('./src/sockets/socket.server');
const { installGracefulShutdown } = require('./src/config/http');

const httpServer = http.createServer(app);


initSocketServer(httpServer);


const port = Number(process.env.PORT) || 3005;
httpServer.listen(port, () => {
    console.log(`AI Buddy service is running on port ${port}`);
})

installGracefulShutdown(httpServer);
