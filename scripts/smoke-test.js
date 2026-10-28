// End-to-end API check against a running stack in mock mode (`npm run dev` first; restart it to
// reset the data before re-running). Requests go through the frontend's /api proxy and the
// gateway, exactly like the browser, using the seeded development accounts.
//   npm run smoke                         (frontend at http://localhost:5173, gateway at :8080)
//   node scripts/smoke-test.js <frontendUrl> <gatewayUrl>
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FRONTEND = process.argv[ 2 ] || 'http://localhost:5173';
const GATEWAY = process.argv[ 3 ] || 'http://localhost:8080';
const BASE = `${FRONTEND}/api`;

const results = [];
function check(name, condition, detail = '') {
    results.push({ name, ok: Boolean(condition) });
    console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${!condition && detail ? `  -> ${detail}` : ''}`);
}

async function call(pathname, { method = 'GET', body, cookie, form, headers: extra = {}, base = BASE, raw } = {}) {
    const headers = { ...extra };
    if (cookie) headers.Cookie = cookie;
    if (body || raw) headers[ 'Content-Type' ] = 'application/json';
    const res = await fetch(`${base}${pathname}`, { method, headers, body: raw || form || (body ? JSON.stringify(body) : undefined) });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    const setCookie = res.headers.get('set-cookie') || '';
    const token = /token=([^;]*)/.exec(setCookie)?.[ 1 ];
    return { status: res.status, data, cookie: token ? `token=${token}` : null, setCookie };
}

const describe = (r) => `${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`;
const stockOf = async (id) => (await call(`/products/${id}`)).data.data.stock;

function readEnv(dir, key) {
    try {
        return fs.readFileSync(path.join(__dirname, '..', dir, '.env'), 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[ 1 ].trim() || '';
    } catch {
        return '';
    }
}

async function main() {
    // ---------- health ----------
    let r = await call('/health', { base: GATEWAY });
    check('Gateway /health', r.status === 200, describe(r));
    r = await call('/health/services', { base: GATEWAY });
    check('All backend /health checks ok via gateway', r.status === 200 && r.data.services.AUTH_SERVICE_URL === 'ok' && r.data.services.PAYMENT_SERVICE_URL === 'ok', describe(r));

    // ---------- products (public) ----------
    r = await call('/products');
    check('GET /products lists seeded products', r.status === 200 && r.data.data.length === 8, describe(r));
    const products = r.data.data;
    const shoes = products.find(p => p.title === 'Running Shoes');
    const lamp = products.find(p => p.title === 'Desk Lamp');
    const mug = products.find(p => p.title === 'Ceramic Coffee Mug'); // stock 0

    r = await call('/products?q=shoes');
    check('Text search ?q=shoes', r.status === 200 && r.data.data.length === 1 && r.data.data[ 0 ].title === 'Running Shoes', describe(r));
    r = await call('/products?minprice=1000&maxprice=2000');
    check('Price filter 1000-2000', r.status === 200 && r.data.data.every(p => p.price.amount >= 1000 && p.price.amount <= 2000) && r.data.data.length === 2, describe(r));
    r = await call('/products?skip=5&limit=2');
    check('Pagination skip/limit', r.status === 200 && r.data.data.length === 2, describe(r));
    r = await call('/products?skip=abc&limit=-4');
    check('Bad pagination values are clamped, not 500', r.status === 200, describe(r));
    r = await call(`/products/${shoes._id}`);
    check('GET /products/:id', r.status === 200 && r.data.data.title === 'Running Shoes', describe(r));
    r = await call('/products/not-an-id');
    check('Invalid product id -> 400', r.status === 400, describe(r));
    r = await call('/products/650000000000000000000999');
    check('Unknown product -> 404', r.status === 404, describe(r));
    r = await call('/nope');
    check('Unknown API path -> JSON 404', r.status === 404 && typeof r.data === 'object', describe(r));

    // ---------- auth ----------
    r = await call('/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'wrong-password' } });
    check('Login with wrong password -> 401', r.status === 401 && !r.cookie, describe(r));
    r = await call('/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'User@1234' } });
    check('Login with unknown email -> 401', r.status === 401, describe(r));
    r = await call('/auth/login', { method: 'POST', body: { password: 'User@1234' } });
    check('Login without email/username -> 400', r.status === 400, describe(r));
    r = await call('/auth/login', { method: 'POST', raw: '{"email": ' });
    check('Malformed JSON -> 400', r.status === 400, describe(r));
    r = await call('/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'User@1234' } });
    check('Login as demo customer', r.status === 200 && r.cookie && r.data.user.role === 'user', describe(r));
    check('Auth cookie is HttpOnly, Secure, SameSite=Lax', /HttpOnly/i.test(r.setCookie) && /Secure/i.test(r.setCookie) && /SameSite=Lax/i.test(r.setCookie));
    const user = r.cookie;
    r = await call('/auth/login', { method: 'POST', body: { username: 'demo_seller', password: 'Seller@123' } });
    check('Login as demo seller by username', r.status === 200 && r.data.user.role === 'seller', describe(r));
    const seller = r.cookie;

    r = await call('/auth/me', { cookie: user });
    check('GET /auth/me returns profile from DB', r.status === 200 && r.data.user.username === 'demo_user' && r.data.user.fullName.firstName === 'Priya' && !('password' in r.data.user), describe(r));
    r = await call('/auth/me');
    check('GET /auth/me without cookie -> 401', r.status === 401, describe(r));
    r = await call('/auth/me', { cookie: `${user}tampered` });
    check('Tampered JWT -> 401', r.status === 401, describe(r));

    const unique = Date.now().toString(36);
    const registration = { username: `new_${unique}`, email: `new_${unique}@example.com`, password: 'Secret123', fullName: { firstName: 'New', lastName: 'Person' } };
    r = await call('/auth/register', { method: 'POST', body: registration });
    check('Register new customer -> 201 (no password in response)', r.status === 201 && r.cookie && r.data.user.role === 'user' && !('password' in r.data.user), describe(r));
    r = await call('/auth/register', { method: 'POST', body: registration });
    check('Register duplicate -> 409', r.status === 409, describe(r));
    r = await call('/auth/register', { method: 'POST', body: { ...registration, username: 'x', email: 'bad', password: '1' } });
    check('Register invalid input -> 400', r.status === 400 && r.data.errors.length >= 3, describe(r));
    r = await call('/auth/register', { method: 'POST', body: { ...registration, username: `adm_${unique}`, email: `adm_${unique}@example.com`, role: 'admin' } });
    check('Self-registering as admin is rejected -> 400', r.status === 400, describe(r));

    // ---------- addresses ----------
    r = await call('/auth/users/me/addresses', { cookie: user });
    check('GET addresses (seeded)', r.status === 200 && r.data.addresses.length === 2, describe(r));
    r = await call('/auth/users/me/addresses', { method: 'POST', cookie: user, body: { street: '1 Test Lane', city: 'Pune', state: 'MH', pincode: '411001', country: 'India' } });
    check('Add address keeps pincode', r.status === 201 && r.data.address.pincode === '411001', describe(r));
    const addressId = r.data?.address?._id;
    r = await call('/auth/users/me/addresses', { method: 'POST', cookie: user, body: { street: 'x', city: 'y', state: 'z', pincode: '12', country: 'c' } });
    check('Add address with bad pincode -> 400', r.status === 400, describe(r));
    r = await call(`/auth/users/me/addresses/${addressId}`, { method: 'DELETE', cookie: user });
    check('Delete address', r.status === 200 && r.data.addresses.length === 2, describe(r));

    // ---------- cart ----------
    r = await call('/cart', { cookie: user });
    check('GET /cart (seeded 2 items)', r.status === 200 && r.data.cart.items.length === 2 && r.data.totals.totalQuantity === 3, describe(r));
    r = await call('/cart/items', { method: 'POST', cookie: user, body: { productId: shoes._id, qty: 1 } });
    check('Add item to cart', r.status === 200 && r.data.cart.items.length === 3, describe(r));
    r = await call(`/cart/items/${shoes._id}`, { method: 'PATCH', cookie: user, body: { qty: 2 } });
    check('Update cart quantity', r.status === 200 && r.data.cart.items.find(i => i.productId === shoes._id).quantity === 2, describe(r));
    r = await call(`/cart/items/${shoes._id}`, { method: 'PATCH', cookie: user, body: { qty: 0 } });
    check('Cart qty 0 -> 400', r.status === 400, describe(r));
    r = await call(`/cart/items/${shoes._id}`, { method: 'DELETE', cookie: user });
    check('Remove cart item', r.status === 200 && r.data.cart.items.length === 2, describe(r));
    r = await call('/cart', { cookie: seller });
    check('Seller cannot use cart -> 403', r.status === 403, describe(r));
    r = await call('/cart');
    check('Cart without auth -> 401', r.status === 401, describe(r));

    // ---------- orders + inventory ----------
    const shippingAddress = { street: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', country: 'India' };
    const headphonesId = '650000000000000000000101';
    const headphonesBefore = await stockOf(headphonesId);
    r = await call('/orders', { method: 'POST', cookie: user, body: { shippingAddress } });
    check('Create order from cart (server-side prices)', r.status === 201 && r.data.order.status === 'PENDING' && r.data.order.totalPrice.amount === 4999 + 799 * 2, describe(r));
    const orderId = r.data?.order?._id;
    check('Order reserves stock', await stockOf(headphonesId) === headphonesBefore - 1);
    r = await call('/orders', { method: 'POST', cookie: user, body: { shippingAddress: { street: 'x' } } });
    check('Create order with invalid address -> 400', r.status === 400, describe(r));
    r = await call('/cart', { method: 'DELETE', cookie: user });
    check('Clear cart after order', r.status === 200 && r.data.cart.items.length === 0, describe(r));
    r = await call('/orders', { method: 'POST', cookie: user, body: { shippingAddress } });
    check('Order with empty cart -> 400', r.status === 400 && /empty/i.test(r.data.message), describe(r));
    r = await call('/orders/me', { cookie: user });
    check('GET /orders/me (newest first)', r.status === 200 && r.data.meta.total === 4 && r.data.orders[ 0 ]._id === orderId, describe(r));
    r = await call(`/orders/${orderId}`, { cookie: user });
    check('GET /orders/:id', r.status === 200 && r.data.order._id === orderId, describe(r));
    r = await call('/auth/login', { method: 'POST', body: { email: 'rahul@example.com', password: 'User@1234' } });
    const otherUser = r.cookie;
    r = await call(`/orders/${orderId}`, { cookie: otherUser });
    check("Another user's order -> 403", r.status === 403, describe(r));
    r = await call(`/payments/create/${orderId}`, { method: 'POST', cookie: otherUser });
    check("Paying another user's order -> 404", r.status === 404, describe(r));
    r = await call(`/orders/${orderId}/address`, { method: 'PATCH', cookie: user, body: { shippingAddress: { ...shippingAddress, city: 'Mysuru', pincode: '570001' } } });
    check('Update order address', r.status === 200 && r.data.order.shippingAddress.city === 'Mysuru' && r.data.order.shippingAddress.zip === '570001', describe(r));
    r = await call(`/orders/${orderId}/cancel`, { method: 'POST', cookie: user });
    check('Cancel pending order', r.status === 200 && r.data.order.status === 'CANCELLED', describe(r));
    check('Cancelling releases reserved stock', await stockOf(headphonesId) === headphonesBefore);
    r = await call(`/orders/${orderId}/cancel`, { method: 'POST', cookie: user });
    check('Cancel again -> 409', r.status === 409, describe(r));
    r = await call(`/payments/create/${orderId}`, { method: 'POST', cookie: user });
    check('Paying a cancelled order -> 409', r.status === 409, describe(r));

    await call('/cart/items', { method: 'POST', cookie: user, body: { productId: mug._id, qty: 1 } });
    r = await call('/orders', { method: 'POST', cookie: user, body: { shippingAddress } });
    check('Order with out-of-stock item -> 409', r.status === 409 && /out of stock/.test(r.data.message), describe(r));
    await call('/cart', { method: 'DELETE', cookie: user });

    // Last unit race: two orders for the only remaining units, exactly one can succeed
    const lampStock = await stockOf(lamp._id);
    await call(`/products/${lamp._id}`, { method: 'PATCH', cookie: (await call('/auth/login', { method: 'POST', body: { email: 'crafts@example.com', password: 'Seller@123' } })).cookie, body: { stock: 1 } });
    await call('/cart/items', { method: 'POST', cookie: user, body: { productId: lamp._id, qty: 1 } });
    await call('/cart/items', { method: 'POST', cookie: otherUser, body: { productId: lamp._id, qty: 1 } });
    const [ a, b ] = await Promise.all([
        call('/orders', { method: 'POST', cookie: user, body: { shippingAddress } }),
        call('/orders', { method: 'POST', cookie: otherUser, body: { shippingAddress } }),
    ]);
    check('Concurrent orders for the last unit: exactly one succeeds', [ a.status, b.status ].sort().join(',') === '201,409', `${a.status}/${b.status}`);
    check('Stock never goes negative', await stockOf(lamp._id) === 0);
    for (const [ res, cookie ] of [ [ a, user ], [ b, otherUser ] ]) {
        if (res.status === 201) await call(`/orders/${res.data.order._id}/cancel`, { method: 'POST', cookie });
        await call('/cart', { method: 'DELETE', cookie });
    }
    check('Stock restored after cancelling the winner', await stockOf(lamp._id) === 1, `lamp stock (was ${lampStock})`);

    // ---------- payments (mock Razorpay) ----------
    await call('/cart/items', { method: 'POST', cookie: user, body: { productId: shoes._id, qty: 1 } });
    r = await call('/orders', { method: 'POST', cookie: user, body: { shippingAddress } });
    const payOrderId = r.data?.order?._id;
    await call('/cart', { method: 'DELETE', cookie: user });
    r = await call('/payments/config', { cookie: user });
    check('Payment config reports mock mode, no key exposed', r.status === 200 && r.data.mock === true && r.data.keyId === null, describe(r));
    r = await call(`/payments/create/${payOrderId}`, { method: 'POST', cookie: user });
    check('Create payment in paise', r.status === 201 && r.data.payment.status === 'PENDING' && r.data.payment.price.amount === 349900 && r.data.payment.razorpayOrderId.startsWith('order_mock_'), describe(r));
    const razorpayOrderId = r.data?.payment?.razorpayOrderId;
    r = await call(`/payments/create/${payOrderId}`, { method: 'POST', cookie: user });
    check('Creating again reuses the pending payment (idempotent)', r.status === 200 && r.data.payment.razorpayOrderId === razorpayOrderId, describe(r));
    r = await call('/payments/verify', { method: 'POST', cookie: user, body: { razorpayOrderId, paymentId: 'pay_fake', signature: 'deadbeef' } });
    check('Verify with forged signature -> 400', r.status === 400, describe(r));
    r = await call('/payments/mock/checkout', { method: 'POST', cookie: user, body: { razorpayOrderId } });
    check('Mock checkout returns signed payment', r.status === 200 && r.data.signature, describe(r));
    const signed = r.data;
    r = await call('/payments/verify', { method: 'POST', cookie: otherUser, body: signed });
    check("Another user cannot verify this payment -> 404", r.status === 404, describe(r));
    r = await call('/payments/verify', { method: 'POST', cookie: user, body: signed });
    check('Verify signed payment -> COMPLETED and order confirmed', r.status === 200 && r.data.payment.status === 'COMPLETED' && r.data.orderConfirmed === true, describe(r));
    r = await call(`/orders/${payOrderId}`, { cookie: user });
    check('Order is CONFIRMED with payment details', r.data.order.status === 'CONFIRMED' && r.data.order.payment.paymentId === signed.paymentId && r.data.order.payment.amount === 349900, describe(r));
    r = await call('/payments/verify', { method: 'POST', cookie: user, body: signed });
    check('Repeating verify is idempotent', r.status === 200 && r.data.payment.paymentId === signed.paymentId, describe(r));
    r = await call(`/payments/create/${payOrderId}`, { method: 'POST', cookie: user });
    check('Paying a confirmed order again -> 409', r.status === 409, describe(r));
    r = await call(`/orders/${payOrderId}/cancel`, { method: 'POST', cookie: user });
    check('Cancelling a confirmed order -> 409', r.status === 409, describe(r));

    // ---------- Razorpay webhook ----------
    const webhookSecret = readEnv('payment', 'RAZORPAY_WEBHOOK_SECRET');
    await call('/cart/items', { method: 'POST', cookie: user, body: { productId: shoes._id, qty: 1 } });
    r = await call('/orders', { method: 'POST', cookie: user, body: { shippingAddress } });
    const hookOrderId = r.data?.order?._id;
    await call('/cart', { method: 'DELETE', cookie: user });
    r = await call(`/payments/create/${hookOrderId}`, { method: 'POST', cookie: user });
    const hookPayment = r.data.payment;
    const event = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_hook_1', order_id: hookPayment.razorpayOrderId, amount: hookPayment.price.amount, currency: 'INR', email: 'user@example.com' } } } });
    r = await call('/payments/webhook/razorpay', { method: 'POST', raw: event, headers: { 'x-razorpay-signature': 'bad' } });
    check('Webhook with bad signature -> 400 (or 503 if unconfigured)', webhookSecret ? r.status === 400 : r.status === 503, describe(r));
    if (webhookSecret) {
        const signature = crypto.createHmac('sha256', webhookSecret).update(event).digest('hex');
        r = await call('/payments/webhook/razorpay', { method: 'POST', raw: event, headers: { 'x-razorpay-signature': signature } });
        check('Signed payment.captured webhook confirms the order', r.status === 200, describe(r));
        r = await call(`/orders/${hookOrderId}`, { cookie: user });
        check('Webhook-confirmed order is CONFIRMED', r.data.order.status === 'CONFIRMED' && r.data.order.payment.paymentId === 'pay_hook_1', describe(r));
        r = await call('/payments/webhook/razorpay', { method: 'POST', raw: event, headers: { 'x-razorpay-signature': signature } });
        check('Webhook redelivery is idempotent', r.status === 200, describe(r));
    } else {
        console.log('SKIP  signed webhook checks (no RAZORPAY_WEBHOOK_SECRET in payment/.env)');
    }

    // ---------- internal endpoints are not public ----------
    r = await call('/internal/stock/reserve', { method: 'POST', base: GATEWAY, body: { items: [ { productId: shoes._id, quantity: 1 } ] } });
    check('Gateway does not expose /internal routes', r.status === 404, describe(r));
    r = await call('/internal/stock/reserve', { method: 'POST', base: 'http://localhost:3001', body: { items: [ { productId: shoes._id, quantity: 1 } ] }, headers: { 'x-internal-token': 'guess' } });
    check('Internal endpoint rejects a wrong service token', r.status === 401, describe(r));

    // ---------- seller products ----------
    r = await call('/products/seller', { cookie: seller });
    check('Seller lists own products', r.status === 200 && r.data.data.length === 5, describe(r));
    const form = new FormData();
    form.append('title', 'Smoke Test Lamp');
    form.append('description', 'Created by the smoke test');
    form.append('priceAmount', '1299');
    form.append('priceCurrency', 'INR');
    form.append('stock', '7');
    form.append('images', new Blob([ Buffer.from('89504e470d0a1a0a', 'hex') ], { type: 'image/png' }), 'lamp.png');
    r = await call('/products', { method: 'POST', cookie: seller, form });
    check('Seller creates product with stock and image', r.status === 201 && r.data.data.stock === 7 && r.data.data.images[ 0 ].url.startsWith('data:image/png'), describe(r));
    const newProductId = r.data?.data?._id;
    const textFile = new FormData();
    textFile.append('title', 'Bad upload');
    textFile.append('priceAmount', '10');
    textFile.append('images', new Blob([ 'not an image' ], { type: 'text/plain' }), 'notes.txt');
    r = await call('/products', { method: 'POST', cookie: seller, form: textFile });
    check('Non-image upload -> 400', r.status === 400, describe(r));
    r = await call('/products', { method: 'POST', cookie: seller, form: (() => { const f = new FormData(); f.append('title', 'x'); return f; })() });
    check('Create product without price -> 400', r.status === 400, describe(r));
    r = await call('/products', { method: 'POST', cookie: user, form });
    check('Customer cannot create product -> 403', r.status === 403, describe(r));
    r = await call(`/products/${newProductId}`, { method: 'PATCH', cookie: seller, body: { price: { amount: 999 }, stock: 3 } });
    check('Seller updates price and stock', r.status === 200 && r.data.product.price.amount === 999 && r.data.product.stock === 3, describe(r));
    r = await call(`/products/${newProductId}`, { method: 'PATCH', cookie: seller, body: { stock: -1 } });
    check('Negative stock -> 400', r.status === 400, describe(r));
    r = await call(`/products/${newProductId}`, { method: 'PATCH', cookie: seller, body: { title: '  ', price: { amount: -5 } } });
    check('Empty title / negative price -> 400', r.status === 400, describe(r));
    r = await call('/auth/login', { method: 'POST', body: { email: 'crafts@example.com', password: 'Seller@123' } });
    const otherSeller = r.cookie;
    r = await call(`/products/${newProductId}`, { method: 'PATCH', cookie: otherSeller, body: { title: 'Hijacked' } });
    check('Other seller cannot edit product -> 403', r.status === 403, describe(r));
    r = await call(`/products/${newProductId}`, { method: 'DELETE', cookie: seller });
    check('Seller deletes product', r.status === 200, describe(r));
    r = await call(`/products/${newProductId}`);
    check('Deleted product -> 404', r.status === 404, describe(r));

    // ---------- seller dashboard ----------
    r = await call('/seller/dashboard/metrics', { cookie: seller });
    // seeded CONFIRMED/DELIVERED orders contain seller 1's keyboard x1, bottle x2, shoes x1
    check('Seller metrics (sales, revenue, top products)', r.status === 200 && r.data.sales === 4 && r.data.revenue === 6499 + 899 * 2 + 3499 && r.data.topProducts.length === 3, describe(r));
    check('Seller metrics include inventory', r.data.inventory && r.data.inventory.totalProducts === 5 && r.data.inventory.totalUnits === 25 + 12 + 120 + 30 + 60, describe(r));
    r = await call('/seller/dashboard/orders', { cookie: seller });
    check('Seller orders (only own items)', r.status === 200 && r.data.length === 2 && r.data.every(o => o.items.length > 0), describe(r));
    r = await call('/seller/dashboard/products', { cookie: seller });
    check('Seller dashboard products', r.status === 200 && r.data.length === 5, describe(r));
    r = await call('/seller/dashboard/metrics', { cookie: user });
    check('Customer cannot open seller dashboard -> 403', r.status === 403, describe(r));

    // ---------- logout revokes the token server-side ----------
    r = await call('/auth/logout', { cookie: user });
    check('Logout clears cookie', r.status === 200 && /token=;/.test(r.setCookie), describe(r));
    r = await call('/auth/me', { cookie: user });
    check('Old token rejected by auth after logout', r.status === 401, describe(r));
    r = await call('/cart', { cookie: user });
    check('Old token rejected by other services (gateway) after logout', r.status === 401, describe(r));
    r = await call('/auth/login', { method: 'POST', cookie: user, body: { email: 'user@example.com', password: 'User@1234' } });
    check('Login works while a revoked cookie is still sent', r.status === 200 && r.cookie, describe(r));

    const failed = results.filter(x => !x.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
    console.error('Smoke test crashed:', err.message, '\nIs the stack running (npm run dev)?');
    process.exit(1);
});
