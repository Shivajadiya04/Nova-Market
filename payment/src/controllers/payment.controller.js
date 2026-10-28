const paymentModel = require('../models/payment.model');
const axios = require('axios');
const { publishToQueue } = require("../broker/borker")
const { serviceUrl, internalHeaders } = require("../config/internal")

const Razorpay = require('razorpay');
// Razorpay's official signature helpers (HMAC-SHA256 with the key secret / webhook secret)
const { validatePaymentVerification, validateWebhookSignature } = require('razorpay/dist/utils/razorpay-utils');
const mockRazorpay = require('../services/razorpay.mock');

const HTTP_TIMEOUT_MS = 10000;

// Mock mode without Razorpay keys uses a local stand-in (see services/razorpay.mock.js).
const razorpay = mockRazorpay.isEnabled()
    ? mockRazorpay.client
    : new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

const keySecret = () => (mockRazorpay.isEnabled() ? mockRazorpay.secret : process.env.RAZORPAY_KEY_SECRET);

// Razorpay amounts are integers in the smallest currency unit (paise for INR, cents for USD)
const toMinorUnits = (amount) => Math.round(amount * 100);


// Tells the order service the payment is verified, which moves the order to CONFIRMED.
async function confirmOrder(payment) {
    try {
        await axios.post(`${serviceUrl('ORDER_SERVICE_URL')}/internal/orders/${payment.order}/payment-confirmed`, {
            paymentId: payment.paymentId,
            razorpayOrderId: payment.razorpayOrderId,
            amount: payment.price.amount,
            currency: payment.price.currency,
        }, { headers: internalHeaders(), timeout: HTTP_TIMEOUT_MS });
        return true;
    } catch (err) {
        // The payment stays COMPLETED; Razorpay's webhook retries (or a re-verify) will confirm the order later
        console.error(`Could not confirm order ${payment.order} for payment ${payment.paymentId}:`, err.response?.data?.message || err.message);
        return false;
    }
}

async function publishCompleted(payment, user) {
    await publishToQueue("PAYMENT_NOTIFICATION.PAYMENT_COMPLETED", {
        email: user?.email,
        username: user?.username,
        orderId: payment.order,
        paymentId: payment.paymentId,
        amount: payment.price.amount / 100,
        currency: payment.price.currency,
    })
    await publishToQueue("PAYMENT_SELLER_DASHBOARD.PAYMENT_UPDATED", payment)
}


// GET /api/payments/config: what the frontend needs to open checkout (the key id is public).
async function getPaymentConfig(req, res) {
    res.status(200).json({
        provider: 'razorpay',
        mock: mockRazorpay.isEnabled(),
        keyId: mockRazorpay.isEnabled() ? null : process.env.RAZORPAY_KEY_ID,
    });
}


async function createPayment(req, res) {
    const token = req.cookies?.token || req.headers?.authorization?.split(' ')[ 1 ];

    try {

        const orderId = req.params.orderId;

        // The order service checks the order belongs to this user and returns the server-side total
        let order;
        try {
            const orderResponse = await axios.get(`${serviceUrl('ORDER_SERVICE_URL')}/api/orders/` + encodeURIComponent(orderId), {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                timeout: HTTP_TIMEOUT_MS
            })
            order = orderResponse.data.order;
        } catch (err) {
            const status = err.response?.status;
            if (status === 403 || status === 404) {
                return res.status(404).json({ message: 'Order not found' });
            }
            throw err;
        }

        if (order.status !== 'PENDING') {
            return res.status(409).json({ message: `Order is ${order.status} and cannot be paid` });
        }

        const existing = await paymentModel.find({ order: orderId, status: { $in: [ 'PENDING', 'COMPLETED' ] } });

        if (existing.some(p => p.status === 'COMPLETED')) {
            return res.status(409).json({ message: 'Order has already been paid' });
        }

        // Reuse an unfinished attempt instead of creating a second Razorpay order for the same purchase
        const pending = existing.find(p => p.status === 'PENDING' && p.user.toString() === req.user.id);
        if (pending) {
            return res.status(200).json({ message: 'Payment already initiated', payment: pending });
        }

        const amount = toMinorUnits(order.totalPrice.amount);

        const razorpayOrder = await razorpay.orders.create({
            amount,
            currency: order.totalPrice.currency,
            receipt: String(orderId),
            notes: { orderId: String(orderId), userId: req.user.id },
        });

        const payment = await paymentModel.create({
            order: orderId,
            razorpayOrderId: razorpayOrder.id,
            user: req.user.id,
            price: {
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency
            }
        })

        await publishToQueue("PAYMENT_SELLER_DASHBOARD.PAYMENT_CREATED", payment)
        await publishToQueue("PAYMENT_NOTIFICATION.PAYMENT_INITIATED", {
            email: req.user.email,
            orderId: orderId,
            amount: payment.price.amount / 100,
            currency: payment.price.currency,
            username: req.user.username,
        })
        return res.status(201).json({ message: 'Payment initiated', payment });

    } catch (err) {
        console.error('Create payment failed:', err.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }

}

async function verifyPayment(req, res) {
    const { razorpayOrderId, paymentId, signature } = req.body;

    if (typeof razorpayOrderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') {
        return res.status(400).json({ message: 'razorpayOrderId, paymentId and signature are required' });
    }

    try {

        // Only the user who started the payment can complete it
        const payment = await paymentModel.findOne({ razorpayOrderId, user: req.user.id });

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        const isValid = validatePaymentVerification({
            order_id: razorpayOrderId,
            payment_id: paymentId
        }, signature, keySecret())

        if (!isValid) {
            // Not marked FAILED: a forged request must not be able to spoil a genuine payment
            return res.status(400).json({ message: 'Invalid signature' });
        }

        if (payment.status === 'COMPLETED') {
            if (payment.paymentId !== paymentId) {
                return res.status(409).json({ message: 'Order has already been paid' });
            }
            // Idempotent retry: make sure the order is confirmed and return the same result
            await confirmOrder(payment);
            return res.status(200).json({ message: 'Payment verified successfully', payment });
        }

        // Atomic transition so concurrent verifications cannot process the payment twice
        const completed = await paymentModel.findOneAndUpdate(
            { _id: payment._id, status: { $in: [ 'PENDING', 'FAILED' ] } },
            { $set: { paymentId, signature, status: 'COMPLETED' } },
            { new: true }
        );

        if (!completed) {
            return res.status(409).json({ message: 'Payment is already being processed' });
        }

        const orderConfirmed = await confirmOrder(completed);
        await publishCompleted(completed, req.user);

        res.status(200).json({ message: 'Payment verified successfully', payment: completed, orderConfirmed });

    } catch (err) {
        console.error('Verify payment failed:', err.message);

        await publishToQueue("PAYMENT_NOTIFICATION.PAYMENT_FAILED",
            {
                email: req.user.email,
                username: req.user.username,
                paymentId: paymentId,
                orderId: razorpayOrderId,
            }
        )
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}


// POST /api/payments/webhook/razorpay: Razorpay's server-to-server notifications.
// Confirms orders even if the customer closed the browser before /verify ran.
// Configure it in the Razorpay dashboard with events payment.captured and payment.failed.
async function handleWebhook(req, res) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        return res.status(503).json({ message: 'Webhook not configured' });
    }

    const signature = req.headers[ 'x-razorpay-signature' ];
    if (!signature || !req.rawBody || !validateWebhookSignature(req.rawBody.toString('utf8'), signature, secret)) {
        return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const entity = req.body.payload?.payment?.entity;
    if (!entity?.order_id) {
        return res.status(200).json({ message: 'Ignored' });
    }

    const payment = await paymentModel.findOne({ razorpayOrderId: entity.order_id });
    if (!payment) {
        return res.status(200).json({ message: 'Unknown order, ignored' });
    }

    if (event === 'payment.captured') {
        if (entity.amount !== payment.price.amount || entity.currency !== payment.price.currency) {
            console.error(`Webhook amount mismatch for ${entity.order_id}`);
            return res.status(200).json({ message: 'Amount mismatch, ignored' });
        }

        let completed = payment;
        if (payment.status !== 'COMPLETED') {
            completed = await paymentModel.findOneAndUpdate(
                { _id: payment._id, status: { $in: [ 'PENDING', 'FAILED' ] } },
                { $set: { paymentId: entity.id, status: 'COMPLETED' } },
                { new: true }
            ) || await paymentModel.findById(payment._id);
            if (completed.paymentId === entity.id) await publishCompleted(completed, { email: entity.email });
        }

        // Respond 5xx if the order could not be confirmed so Razorpay retries the webhook
        const confirmed = await confirmOrder(completed);
        return res.status(confirmed ? 200 : 502).json({ message: confirmed ? 'Order confirmed' : 'Order confirmation pending' });
    }

    if (event === 'payment.failed') {
        const failed = await paymentModel.findOneAndUpdate(
            { _id: payment._id, status: 'PENDING' },
            { $set: { status: 'FAILED', paymentId: entity.id } },
            { new: true }
        );
        if (failed) {
            await publishToQueue("PAYMENT_NOTIFICATION.PAYMENT_FAILED", {
                email: entity.email,
                paymentId: entity.id,
                orderId: String(payment.order),
            })
            await publishToQueue("PAYMENT_SELLER_DASHBOARD.PAYMENT_UPDATED", failed)
        }
        return res.status(200).json({ message: 'Recorded' });
    }

    return res.status(200).json({ message: 'Ignored' });
}


module.exports = {
    getPaymentConfig,
    createPayment,
    verifyPayment,
    handleWebhook
}
