// Public API prefix -> environment variable holding that service's base URL.
// Values may be full URLs or bare host:port (Render's private network gives host:port).
module.exports = [
    { prefix: '/api/auth', env: 'AUTH_SERVICE_URL' },
    { prefix: '/api/products', env: 'PRODUCT_SERVICE_URL' },
    { prefix: '/api/cart', env: 'CART_SERVICE_URL' },
    { prefix: '/api/orders', env: 'ORDER_SERVICE_URL' },
    { prefix: '/api/payments', env: 'PAYMENT_SERVICE_URL' },
    { prefix: '/api/seller/dashboard', env: 'SELLER_DASHBOARD_SERVICE_URL' },
    { prefix: '/api/socket', env: 'AI_BUDDY_SERVICE_URL', ws: true, optional: true },
];
