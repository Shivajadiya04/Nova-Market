// Service list shared by the root helper scripts.
const path = require('path');

const root = path.resolve(__dirname, '..');

// Services that support USE_MOCK_DB=true and are started by `npm run dev`.
const coreServices = [
    { name: 'auth', port: 3000 },
    { name: 'product', port: 3001 },
    { name: 'cart', port: 3002 },
    { name: 'order', port: 3003 },
    { name: 'payment', port: 3004 },
    { name: 'seller-dashboard', port: 3007 },
];

// Need real third-party credentials; started only by `npm run dev:all`.
const optionalServices = [
    { name: 'ai-buddy', port: 3005 },
    { name: 'notification', port: 3006 },
];

const allServices = [ ...coreServices, ...optionalServices ];

// The public entry point; started by `npm run dev` in front of the services.
const gateway = { name: 'gateway', port: 8080 };

// Shared location for the MongoDB binary used by the existing Jest suites (mongodb-memory-server).
const mongoBinaryDir = path.join(root, '.mongodb-binaries');

module.exports = { root, coreServices, optionalServices, allServices, gateway, mongoBinaryDir };
