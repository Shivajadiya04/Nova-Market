const userModel = require("../models/user.model")
const productModel = require("../models/product.model")
const orderModel = require("../models/order.model")
const paymentModel = require("../models/payment.model")


async function getMetrics(req, res) {
    try {
        const seller = req.user;

        // Get all products for this seller (the JWT payload carries `id`, not `_id`)
        const products = await productModel.find({ seller: seller.id });
        const productIds = products.map(p => p._id);
        const isSellerProduct = (productId) => productIds.some(id => id.equals(productId));

        // Get all orders containing seller's products
        const orders = await orderModel.find({
            'items.product': { $in: productIds },
            status: { $in: [ "CONFIRMED", "SHIPPED", "DELIVERED" ] }
        });

        // Sales: total number of items sold
        let sales = 0;
        let revenue = 0;
        const productSales = {};

        orders.forEach(order => {
            order.items.forEach(item => {
                if (isSellerProduct(item.product)) {
                    sales += item.quantity;
                    // order items store the line total in price.amount (see order.controller)
                    revenue += item.price.amount;
                    productSales[ item.product ] = (productSales[ item.product ] || 0) + item.quantity;
                }
            });
        });

        // Top products by quantity sold
        const topProducts = Object.entries(productSales)
            .sort((a, b) => b[ 1 ] - a[ 1 ])
            .slice(0, 5)
            .map(([ productId, qty ]) => {
                const prod = products.find(p => p._id.equals(productId));
                return prod ? { id: prod._id, title: prod.title, sold: qty } : null;
            })
            .filter(Boolean);

        // Inventory from the product copy this service keeps in sync via product events
        const lowStockThreshold = Number(process.env.LOW_STOCK_THRESHOLD) || 5;
        const inventory = {
            totalProducts: products.length,
            totalUnits: products.reduce((sum, p) => sum + (p.stock || 0), 0),
            outOfStock: products.filter(p => !p.stock).length,
            lowStockThreshold,
            lowStock: products
                .filter(p => p.stock > 0 && p.stock <= lowStockThreshold)
                .map(p => ({ id: p._id, title: p.title, stock: p.stock })),
        };

        return res.json({
            sales,
            revenue,
            topProducts,
            inventory
        });
    } catch (error) {
        console.error("Error fetching metrics:", error)
        return res.status(500).json({
            message: "Internal Server Error"
        });
    }
}

async function getOrders(req, res) {
    try {
        const seller = req.user;

        // Get all products for this seller (the JWT payload carries `id`, not `_id`)
        const products = await productModel.find({ seller: seller.id });
        const productIds = products.map(p => p._id);

        // Get all orders containing seller's products
        const orders = await orderModel.find({
            'items.product': { $in: productIds }
        }).populate('user', 'name email').sort({ createdAt: -1 });

        // Filter order items to only include those from this seller
        const filteredOrders = orders.map(order => {
            const filteredItems = order.items.filter(item => productIds.some(id => id.equals(item.product)));
            return {
                ...order.toObject(),
                items: filteredItems
            };
        }).filter(order => order.items.length > 0);
        return res.json(filteredOrders);
    } catch (error) {
        console.error("Error fetching orders:", error)
        return res.status(500).json({
            message: "Internal Server Error"
        });
    }
}

async function getProducts(req, res) {

    try {
        const seller = req.user;

        const products = await productModel.find({ seller: seller.id }).sort({ createdAt: -1 });

        return res.json(products);
    } catch (error) {
        console.error("Error fetching products:", error)
        return res.status(500).json({
            message: "Internal Server Error"
        });
    }

}

module.exports = {
    getMetrics,
    getOrders,
    getProducts
}
