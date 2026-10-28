const { subscribeToQueue } = require("./broker")
const userModel = require("../models/user.model")
const productModel = require("../models/product.model")
const orderModel = require("../models/order.model")
const paymentModel = require("../models/payment.model")

// Idempotent upsert by _id: RabbitMQ may redeliver a message, and "updated" events can
// arrive for records this copy has not seen yet.
async function upsert(model, doc) {
    const { _id, __v, ...fields } = doc;
    await model.updateOne({ _id }, { $set: fields }, { upsert: true });
}

module.exports = async function () {
    subscribeToQueue("AUTH_SELLER_DASHBOARD.USER_CREATED", async (user) => {
        // auth only sends public profile fields; never store a password hash here
        const { password, ...safe } = user;
        await upsert(userModel, safe)
    })

    subscribeToQueue("PRODUCT_SELLER_DASHBOARD.PRODUCT_CREATED", async (product) => {
        await upsert(productModel, product)
    })

    subscribeToQueue("PRODUCT_SELLER_DASHBOARD.PRODUCT_UPDATED", async (product) => {
        await upsert(productModel, product)
    })

    subscribeToQueue("PRODUCT_SELLER_DASHBOARD.PRODUCT_DELETED", async ({ _id }) => {
        await productModel.deleteOne({ _id })
    })

    subscribeToQueue("ORDER_SELLER_DASHBOARD.ORDER_CREATED", async (order) => {
        await upsert(orderModel, order)
    })

    subscribeToQueue("ORDER_SELLER_DASHBOARD.ORDER_UPDATED", async (order) => {
        await upsert(orderModel, order)
    })

    subscribeToQueue("PAYMENT_SELLER_DASHBOARD.PAYMENT_CREATED", async (payment) => {
        await upsert(paymentModel, payment)
    })

    // was "PAYMENT_UPDATE" while the payment service publishes "PAYMENT_UPDATED"
    subscribeToQueue("PAYMENT_SELLER_DASHBOARD.PAYMENT_UPDATED", async (payment) => {
        await upsert(paymentModel, payment)
    })
}
