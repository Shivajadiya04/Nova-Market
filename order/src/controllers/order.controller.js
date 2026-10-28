const orderModel = require("../models/order.model")
const axios = require("axios")
const { publishToQueue } = require("../broker/borker");
const { serviceUrl, internalHeaders } = require("../config/internal");

const HTTP_TIMEOUT_MS = 10000;

class OrderError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function publishOrderUpdated(order) {
    return publishToQueue("ORDER_SELLER_DASHBOARD.ORDER_UPDATED", order)
}

const stockItems = (items) => items.map(item => ({ productId: String(item.product), quantity: item.quantity }));

async function reserveStock(items) {
    try {
        await axios.post(`${serviceUrl('PRODUCT_SERVICE_URL')}/internal/stock/reserve`, { items: stockItems(items) }, { headers: internalHeaders(), timeout: HTTP_TIMEOUT_MS });
    } catch (err) {
        if (err.response?.status === 409) throw new OrderError(409, err.response.data.message);
        throw err;
    }
}

// Best effort: a failed release leaves stock understated (never oversold) and is logged for follow-up
async function releaseStock(order) {
    try {
        await axios.post(`${serviceUrl('PRODUCT_SERVICE_URL')}/internal/stock/release`, { items: stockItems(order.items) }, { headers: internalHeaders(), timeout: HTTP_TIMEOUT_MS });
    } catch (err) {
        console.error(`Could not release stock for order ${order._id}:`, err.message);
    }
}


async function createOrder(req, res) {

    const user = req.user;
    const token = req.cookies?.token || req.headers?.authorization?.split(' ')[ 1 ];

    try {

        // fetch user cart from cart service
        const cartResponse = await axios.get(`${serviceUrl('CART_SERVICE_URL')}/api/cart`, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            timeout: HTTP_TIMEOUT_MS
        })

        const cartItems = cartResponse.data.cart.items;

        if (!cartItems.length) {
            throw new OrderError(400, "Your cart is empty")
        }

        // Prices always come from the product service, never from the client
        const products = await Promise.all(cartItems.map(async (item) => {
            try {
                return (await axios.get(`${serviceUrl('PRODUCT_SERVICE_URL')}/api/products/${item.productId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    timeout: HTTP_TIMEOUT_MS
                })).data.data
            } catch (err) {
                if (err.response?.status === 404) return null;
                throw err;
            }
        }))

        let priceAmount = 0;

        const orderItems = cartItems.map((item) => {


            const product = products.find(p => p && p._id === item.productId)

            if (!product) {
                throw new OrderError(409, "A product in your cart is no longer available. Remove it and try again.")
            }

            // if not in stock, does not allow order creation

            if (product.stock < item.quantity) {
                throw new OrderError(409, `Product ${product.title} is out of stock or insufficient stock`)
            }

            const itemTotal = product.price.amount * item.quantity;
            priceAmount += itemTotal;

            return {
                product: item.productId,
                quantity: item.quantity,
                price: {
                    amount: itemTotal,
                    currency: product.price.currency
                }
            }
        })

        const currencies = [ ...new Set(orderItems.map(item => item.price.currency)) ];
        if (currencies.length > 1) {
            throw new OrderError(400, "All items in an order must be priced in the same currency")
        }

        // Reserve stock atomically before the order exists; released again if the order is cancelled
        await reserveStock(orderItems);

        let order;
        try {
            order = await orderModel.create({
                user: user.id,
                items: orderItems,
                status: "PENDING",
                totalPrice: {
                    amount: Math.round(priceAmount * 100) / 100,
                    currency: currencies[ 0 ]
                },
                shippingAddress: {
                    street: req.body.shippingAddress.street,
                    city: req.body.shippingAddress.city,
                    state: req.body.shippingAddress.state,
                    zip: req.body.shippingAddress.pincode,
                    country: req.body.shippingAddress.country,
                }
            })
        } catch (err) {
            await releaseStock({ _id: 'unsaved', items: orderItems });
            throw err;
        }


        await publishToQueue("ORDER_SELLER_DASHBOARD.ORDER_CREATED", order)

        res.status(201).json({ order })

    } catch (err) {
        if (err instanceof OrderError) {
            return res.status(err.status).json({ message: err.message })
        }
        console.error("Create order failed:", err.message)
        res.status(500).json({ message: "Internal server error", error: err.message })
    }

}

async function getMyOrders(req, res) {
    const user = req.user;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

    try {
        const orders = await orderModel.find({ user: user.id }).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
        const totalOrders = await orderModel.countDocuments({ user: user.id });

        res.status(200).json({
            orders,
            meta: {
                total: totalOrders,
                page,
                limit
            }
        })
    } catch (err) {
        res.status(500).json({ message: "Internal server error", error: err.message })
    }
}

async function getOrderById(req, res) {
    const user = req.user;
    const orderId = req.params.id;

    try {
        const order = await orderModel.findById(orderId)

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        if (order.user.toString() !== user.id) {
            return res.status(403).json({ message: "Forbidden: You do not have access to this order" });
        }

        res.status(200).json({ order })
    } catch (err) {
        res.status(500).json({ message: "Internal server error", error: err.message })
    }
}

async function cancelOrderById(req, res) {
    const user = req.user;
    const orderId = req.params.id;

    try {
        const order = await orderModel.findById(orderId)

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        if (order.user.toString() !== user.id) {
            return res.status(403).json({ message: "Forbidden: You do not have access to this order" });
        }

        // only PENDING orders can be cancelled
        if (order.status !== "PENDING") {
            return res.status(409).json({ message: "Order cannot be cancelled at this stage" });
        }

        // Conditional update so a payment confirmed at the same moment wins over the cancel
        const cancelled = await orderModel.findOneAndUpdate(
            { _id: order._id, status: "PENDING" },
            { $set: { status: "CANCELLED" } },
            { new: true }
        );

        if (!cancelled) {
            return res.status(409).json({ message: "Order cannot be cancelled at this stage" });
        }

        await releaseStock(cancelled);
        await publishOrderUpdated(cancelled);

        res.status(200).json({ order: cancelled });
    } catch (err) {

        console.error(err);

        res.status(500).json({ message: "Internal server error", error: err.message });
    }
}


async function updateOrderAddress(req, res) {
    const user = req.user;
    const orderId = req.params.id;

    try {
        const order = await orderModel.findById(orderId)

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        if (order.user.toString() !== user.id) {
            return res.status(403).json({ message: "Forbidden: You do not have access to this order" });
        }

        // only PENDING orders can have address updated
        if (order.status !== "PENDING") {
            return res.status(409).json({ message: "Order address cannot be updated at this stage" });
        }

        order.shippingAddress = {
            street: req.body.shippingAddress.street,
            city: req.body.shippingAddress.city,
            state: req.body.shippingAddress.state,
            zip: req.body.shippingAddress.pincode,
            country: req.body.shippingAddress.country,
        };

        await order.save();
        await publishOrderUpdated(order);

        res.status(200).json({ order });
    } catch (err) {
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
}


// POST /internal/orders/:id/payment-confirmed (payment service only)
// Called after the payment service has verified a Razorpay signature or webhook.
// Idempotent: confirming the same payment twice is a no-op.
async function confirmOrderPayment(req, res) {
    const { paymentId, razorpayOrderId, amount, currency } = req.body;

    if (!paymentId || !razorpayOrderId || !Number.isInteger(amount) || !currency) {
        return res.status(400).json({ message: "paymentId, razorpayOrderId, amount (integer, smallest currency unit) and currency are required" });
    }

    const order = await orderModel.findById(req.params.id);
    if (!order) {
        return res.status(404).json({ message: "Order not found" });
    }

    if (order.status === "CONFIRMED" && order.payment?.paymentId === paymentId) {
        return res.status(200).json({ order, alreadyConfirmed: true });
    }

    const expected = Math.round(order.totalPrice.amount * 100);
    if (amount !== expected || currency !== order.totalPrice.currency) {
        console.error(`Payment ${paymentId} for order ${order._id} does not match the order total (${amount} ${currency} vs ${expected} ${order.totalPrice.currency})`);
        return res.status(409).json({ message: "Paid amount does not match the order total" });
    }

    const confirmed = await orderModel.findOneAndUpdate(
        { _id: order._id, status: "PENDING" },
        { $set: { status: "CONFIRMED", payment: { paymentId, razorpayOrderId, amount, currency, paidAt: new Date() } } },
        { new: true }
    );

    if (!confirmed) {
        // e.g. cancelled while the customer was paying: money was taken for an order we will not ship
        console.error(`Payment ${paymentId} received for order ${order._id} in status ${order.status}: refund required`);
        return res.status(409).json({ message: `Order is ${order.status}; the payment must be refunded` });
    }

    await publishOrderUpdated(confirmed);

    return res.status(200).json({ order: confirmed });
}

module.exports = {
    createOrder,
    getMyOrders,
    getOrderById,
    cancelOrderById,
    updateOrderAddress,
    confirmOrderPayment
}
