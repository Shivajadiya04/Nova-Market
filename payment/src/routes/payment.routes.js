const express = require('express');
const createAuthMiddleware = require("../middlewares/auth.middleware")
const paymentController = require("../controllers/payment.controller")
const mockRazorpay = require("../services/razorpay.mock")



const router = express.Router();


router.get("/config", createAuthMiddleware([ "user" ]), paymentController.getPaymentConfig)

router.post("/create/:orderId", createAuthMiddleware([ "user" ]), paymentController.createPayment)

router.post("/verify", createAuthMiddleware([ "user" ]), paymentController.verifyPayment)

// Called by Razorpay, authenticated by its X-Razorpay-Signature header instead of a user token
router.post("/webhook/razorpay", paymentController.handleWebhook)

// Development-only: stands in for Razorpay Checkout. Not registered unless mock mode is active.
if (mockRazorpay.isEnabled()) {
    router.post("/mock/checkout", createAuthMiddleware([ "user" ]), mockRazorpay.simulateCheckout)
}

module.exports = router;
