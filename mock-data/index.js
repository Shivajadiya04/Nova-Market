// Development-only sample data shared by every service running with USE_MOCK_DB=true.
// IDs are fixed so that references line up across services (a cart item in the cart
// service points at a product that exists in the product service, and so on).
// Each service loads only the collections it owns into its own in-memory database.

const ids = {
    seller: '650000000000000000000001',
    seller2: '650000000000000000000002',
    user: '650000000000000000000011',
    user2: '650000000000000000000012',
    products: [
        '650000000000000000000101',
        '650000000000000000000102',
        '650000000000000000000103',
        '650000000000000000000104',
        '650000000000000000000105',
        '650000000000000000000106',
        '650000000000000000000107',
        '650000000000000000000108',
    ],
    orders: {
        delivered: '650000000000000000000201',
        confirmed: '650000000000000000000202',
        pending: '650000000000000000000203',
    },
    payments: {
        delivered: '650000000000000000000301',
        confirmed: '650000000000000000000302',
    },
};

// Development test accounts. Passwords are hashed by the auth service when it seeds.
const users = [
    {
        _id: ids.seller,
        username: 'demo_seller',
        email: 'seller@example.com',
        password: 'Seller@123',
        fullName: { firstName: 'Sam', lastName: 'Seller' },
        role: 'seller',
        addresses: [],
    },
    {
        _id: ids.seller2,
        username: 'craft_corner',
        email: 'crafts@example.com',
        password: 'Seller@123',
        fullName: { firstName: 'Meera', lastName: 'Iyer' },
        role: 'seller',
        addresses: [],
    },
    {
        _id: ids.user,
        username: 'demo_user',
        email: 'user@example.com',
        password: 'User@1234',
        fullName: { firstName: 'Priya', lastName: 'Sharma' },
        role: 'user',
        addresses: [
            { street: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', zip: '560001', country: 'India', isDefault: true },
            { street: '4 Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016', zip: '700016', country: 'India', isDefault: false },
        ],
    },
    {
        _id: ids.user2,
        username: 'rahul_k',
        email: 'rahul@example.com',
        password: 'User@1234',
        fullName: { firstName: 'Rahul', lastName: 'Kumar' },
        role: 'user',
        addresses: [],
    },
];

// Simple inline SVG so sample products have images without any network access.
function placeholderImage(label, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">`
        + `<rect width="600" height="600" fill="${color}"/>`
        + `<text x="300" y="315" font-family="Arial, sans-serif" font-size="40" fill="#ffffff" text-anchor="middle">${label}</text>`
        + `</svg>`;
    const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return { url, thumbnail: url, id: `mock_${label.toLowerCase().replace(/\s+/g, '_')}` };
}

const products = [
    { title: 'Wireless Headphones', description: 'Over-ear Bluetooth headphones with active noise cancellation and 30-hour battery life.', amount: 4999, stock: 25, seller: ids.seller, color: '#3b5bdb' },
    { title: 'Mechanical Keyboard', description: 'Compact 75% mechanical keyboard with hot-swappable tactile switches and RGB backlight.', amount: 6499, stock: 12, seller: ids.seller, color: '#495057' },
    { title: 'Cotton T-Shirt', description: 'Soft 100% organic cotton crew-neck t-shirt, regular fit.', amount: 799, stock: 120, seller: ids.seller, color: '#2b8a3e' },
    { title: 'Running Shoes', description: 'Lightweight running shoes with breathable mesh and cushioned sole.', amount: 3499, stock: 30, seller: ids.seller, color: '#e8590c' },
    { title: 'Steel Water Bottle', description: 'Insulated stainless steel bottle, keeps drinks cold for 24 hours. 750 ml.', amount: 899, stock: 60, seller: ids.seller, color: '#1098ad' },
    { title: 'Ceramic Coffee Mug', description: 'Hand-glazed ceramic mug, 350 ml, microwave and dishwasher safe.', amount: 449, stock: 0, seller: ids.seller2, color: '#9c36b5' },
    { title: 'Handwoven Tote Bag', description: 'Durable handwoven jute tote bag with cotton lining.', amount: 1199, stock: 18, seller: ids.seller2, color: '#a87b32' },
    { title: 'Desk Lamp', description: 'LED desk lamp with adjustable brightness, colour temperature and USB charging port.', amount: 1899, stock: 9, seller: ids.seller2, color: '#f08c00' },
].map((p, i) => ({
    _id: ids.products[ i ],
    title: p.title,
    description: p.description,
    price: { amount: p.amount, currency: 'INR' },
    seller: p.seller,
    images: [ placeholderImage(p.title, p.color) ],
    stock: p.stock,
}));

const productById = Object.fromEntries(products.map(p => [ p._id, p ]));

const carts = [
    {
        user: ids.user,
        items: [
            { productId: ids.products[ 0 ], quantity: 1 },
            { productId: ids.products[ 2 ], quantity: 2 },
        ],
    },
];

const defaultAddress = users[ 2 ].addresses[ 0 ];
const shippingAddress = {
    street: defaultAddress.street,
    city: defaultAddress.city,
    state: defaultAddress.state,
    zip: defaultAddress.pincode,
    country: defaultAddress.country,
};

// Mirrors order.controller: each item's price.amount is the line total (unit price * quantity).
function buildOrder(_id, user, status, lines, daysAgo) {
    const items = lines.map(([ productId, quantity ]) => ({
        product: productId,
        quantity,
        price: { amount: productById[ productId ].price.amount * quantity, currency: 'INR' },
    }));
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return {
        _id,
        user,
        items,
        status,
        totalPrice: { amount: items.reduce((sum, item) => sum + item.price.amount, 0), currency: 'INR' },
        shippingAddress,
        createdAt,
        updatedAt: createdAt,
    };
}

const orders = [
    buildOrder(ids.orders.delivered, ids.user, 'DELIVERED', [ [ ids.products[ 1 ], 1 ], [ ids.products[ 4 ], 2 ] ], 14),
    buildOrder(ids.orders.confirmed, ids.user, 'CONFIRMED', [ [ ids.products[ 3 ], 1 ], [ ids.products[ 6 ], 1 ] ], 3),
    buildOrder(ids.orders.pending, ids.user, 'PENDING', [ [ ids.products[ 7 ], 1 ] ], 0),
];

// Payment amounts are in the smallest currency unit (paise), as sent to Razorpay.
const payments = [
    { _id: ids.payments.delivered, order: ids.orders.delivered, user: ids.user, status: 'COMPLETED', razorpayOrderId: 'order_mock_seed0001', paymentId: 'pay_mock_seed0001', signature: 'mock_seed_signature', price: { amount: orders[ 0 ].totalPrice.amount * 100, currency: 'INR' } },
    { _id: ids.payments.confirmed, order: ids.orders.confirmed, user: ids.user, status: 'COMPLETED', razorpayOrderId: 'order_mock_seed0002', paymentId: 'pay_mock_seed0002', signature: 'mock_seed_signature', price: { amount: orders[ 1 ].totalPrice.amount * 100, currency: 'INR' } },
];

// Paid orders reference their payment, as the order service records on confirmation
payments.forEach(payment => {
    const order = orders.find(o => o._id === payment.order);
    order.payment = { paymentId: payment.paymentId, razorpayOrderId: payment.razorpayOrderId, amount: payment.price.amount, currency: payment.price.currency, paidAt: order.createdAt };
});

module.exports = { ids, users, products, carts, orders, payments };
