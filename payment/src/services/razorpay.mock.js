const crypto = require('crypto');
const { isMockMode } = require('../config/env');
const paymentModel = require('../models/payment.model');

// Development-only Razorpay stand-in, active only in mock mode when RAZORPAY_KEY_ID is not set.
// - client.orders.create() returns a fake order id instead of calling Razorpay.
// - simulateCheckout plays the role of Razorpay Checkout: it returns a paymentId and a
//   signature made with a random per-process secret, so the unchanged /verify handler
//   still performs real HMAC signature validation.
// Nothing here talks to Razorpay or moves money.

const secret = crypto.randomBytes(32).toString('hex');

function isEnabled() {
    return isMockMode() && !process.env.RAZORPAY_KEY_ID;
}

const client = {
    orders: {
        async create({ amount, currency }) {
            return { id: `order_mock_${crypto.randomBytes(8).toString('hex')}`, amount, currency, status: 'created' };
        }
    }
};

async function simulateCheckout(req, res) {
    const { razorpayOrderId } = req.body;

    const payment = await paymentModel.findOne({ razorpayOrderId, user: req.user.id, status: 'PENDING' });

    if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
    }

    const paymentId = `pay_mock_${crypto.randomBytes(8).toString('hex')}`;
    const signature = crypto.createHmac('sha256', secret).update(`${razorpayOrderId}|${paymentId}`).digest('hex');

    return res.status(200).json({ razorpayOrderId, paymentId, signature });
}

module.exports = { isEnabled, client, secret, simulateCheckout };
