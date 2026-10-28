// Payment flow for an order:
//   1. GET  /payments/config           -> Razorpay public key id, or mock mode
//   2. POST /payments/create/:orderId  -> backend creates (or reuses) the Razorpay order
//   3. Razorpay Checkout (real) or the payment service's mock checkout (development only)
//   4. POST /payments/verify            -> backend validates the signature and confirms the order
import { paymentApi } from './backend';

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptPromise = null;
let configPromise = null;

export function getPaymentConfig() {
    if (!configPromise) {
        configPromise = paymentApi.config().catch(err => {
            configPromise = null;
            throw err;
        });
    }
    return configPromise;
}

function loadCheckoutScript() {
    if (window.Razorpay) return Promise.resolve();
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = CHECKOUT_SCRIPT;
            script.onload = resolve;
            script.onerror = () => {
                scriptPromise = null;
                reject(new Error('Could not load Razorpay Checkout. Check your internet connection.'));
            };
            document.body.appendChild(script);
        });
    }
    return scriptPromise;
}

function openRazorpayCheckout(keyId, payment, user) {
    return new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
            key: keyId,
            order_id: payment.razorpayOrderId,
            amount: payment.price.amount, // smallest currency unit, as created by the backend
            currency: payment.price.currency,
            name: 'Nova Market',
            prefill: { email: user?.email },
            handler: (response) => resolve({
                razorpayOrderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
            }),
            modal: { ondismiss: () => reject(new Error('Payment was cancelled. You can try again.')) },
        });
        checkout.on('payment.failed', (response) => reject(new Error(response.error?.description || 'Payment failed. You can try again.')));
        checkout.open();
    });
}

// Resolves with the verify response: { payment, orderConfirmed }
export async function payForOrder(orderId, user) {
    const config = await getPaymentConfig();
    const { payment } = await paymentApi.create(orderId);

    let result;
    if (config.mock) {
        result = await paymentApi.mockCheckout(payment.razorpayOrderId);
    } else {
        if (!config.keyId) throw new Error('Online payment is not configured.');
        await loadCheckoutScript();
        result = await openRazorpayCheckout(config.keyId, payment, user);
    }

    return paymentApi.verify(result);
}
