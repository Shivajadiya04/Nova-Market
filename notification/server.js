require('dotenv').config();

// This service has no mock mode: it only reacts to RabbitMQ events and sends real email via Gmail OAuth2.
const missing = [ 'RABBIT_URL', 'EMAIL_USER', 'CLIENT_ID', 'CLIENT_SECRET', 'REFRESH_TOKEN' ].filter(name => !process.env[ name ]);
if (missing.length) {
    console.error(`[config] Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
    process.exit(1);
}

const app = require("./src/app");
const broker = require("./src/borker/borker");
const { installGracefulShutdown } = require("./src/config/http");


const port = Number(process.env.PORT) || 3006;
const server = app.listen(port, () => {
    console.log(`Notification service is running on port ${port}`);
})

installGracefulShutdown(server, [ () => broker.close() ]);
