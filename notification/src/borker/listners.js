const { subscribeToQueue } = require("./borker");
const { sendEmail } = require("../email");

// Values come from user input (names, titles): escape them before putting them in HTML
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ ch ]);
const greetingName = (data) => escapeHtml(data.fullName?.firstName || data.username || 'there');

async function send(data, subject, text, html) {
    if (!data.email) {
        console.warn(`Skipping "${subject}" email: event has no recipient address`);
        return;
    }
    await sendEmail(data.email, subject, text, html);
}


module.exports = function () {

    subscribeToQueue("AUTH_NOTIFICATION.USER_CREATED", async (data) => {

        const emailHTMLTemplate = `
        <h1>Welcome to Nova Market!</h1>
        <p>Dear ${escapeHtml(`${data.fullName?.firstName || ''} ${data.fullName?.lastName || ''}`.trim() || data.username)},</p>
        <p>Thank you for registering with us. We're excited to have you on board!</p>
        <p>Best regards,<br/>The Team</p>
        `;

        await send(data, "Welcome to Nova Market", "Thank you for registering with us!", emailHTMLTemplate);

    })

    subscribeToQueue("PAYMENT_NOTIFICATION.PAYMENT_INITIATED", async (data) => {
        const emailHTMLTemplate = `
        <h1>Payment Initiated</h1>
        <p>Dear ${greetingName(data)},</p>
        <p>Your payment of ${escapeHtml(data.currency)} ${escapeHtml(data.amount)} for the order ID: ${escapeHtml(data.orderId)} has been initiated.</p>
        <p>We will notify you once the payment is completed.</p>
        <p>Best regards,<br/>The Team</p>
        `;
        await send(data, "Payment Initiated", "Your payment is being processed", emailHTMLTemplate);
    })

    subscribeToQueue("PAYMENT_NOTIFICATION.PAYMENT_COMPLETED", async (data) => {
        const emailHTMLTemplate = `
        <h1>Payment Successful!</h1>
        <p>Dear ${greetingName(data)},</p>
        <p>We have received your payment of ${escapeHtml(data.currency)} ${escapeHtml(data.amount)} for the order ID: ${escapeHtml(data.orderId)}.</p>
        <p>Thank you for your purchase!</p>
        <p>Best regards,<br/>The Team</p>
        `;
        await send(data, "Payment Successful", "We have received your payment", emailHTMLTemplate);
    })


    subscribeToQueue("PAYMENT_NOTIFICATION.PAYMENT_FAILED", async (data) => {
        const emailHTMLTemplate = `
        <h1>Payment Failed</h1>
        <p>Dear ${greetingName(data)},</p>
        <p>Unfortunately, your payment for the order ID: ${escapeHtml(data.orderId)} has failed.</p>
        <p>Please try again or contact support if the issue persists.</p>
        <p>Best regards,<br/>The Team</p>
        `;
        await send(data, "Payment Failed", "Your payment could not be processed", emailHTMLTemplate);
    })

    subscribeToQueue("PRODUCT_NOTIFICATION.PRODUCT_CREATED", async (data) => {
        const emailHTMLTemplate = `
        <h1>Your product is live!</h1>
        <p>Dear ${greetingName(data)},</p>
        <p>Your product "${escapeHtml(data.title)}" has been published and is now visible to shoppers.</p>
        <p>Best regards,<br/>The Team</p>
        `;
        await send(data, "Your product is live", "Your product has been published", emailHTMLTemplate);
    })

}
