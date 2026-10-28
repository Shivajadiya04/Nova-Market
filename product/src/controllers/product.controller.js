const productModel = require('../models/product.model');
const { uploadImage } = require('../services/imagekit.service');
const mongoose = require('mongoose');
const { publishToQueue } = require("../broker/borker")

const CURRENCIES = [ 'USD', 'INR' ];

// Keeps the seller dashboard's copy of the catalogue (and its inventory figures) in sync
function publishProductUpdated(product) {
    return publishToQueue("PRODUCT_SELLER_DASHBOARD.PRODUCT_UPDATED", product);
}

function toNonNegativeInt(value, fallback) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
}


// Accepts multipart/form-data with fields: title, description, priceAmount, priceCurrency, stock (optional), images[] (files)
async function createProduct(req, res) {
    try {
        const { title, description, priceAmount, priceCurrency = 'INR', stock } = req.body;
        const seller = req.user.id; // Extract seller from authenticated user

        const price = {
            amount: Number(priceAmount),
            currency: priceCurrency,
        };

        const images = await Promise.all((req.files || []).map(file => uploadImage({ buffer: file.buffer, mimetype: file.mimetype })));


        const product = await productModel.create({
            title, description, price, seller, images,
            ...(stock !== undefined && { stock: Number(stock) }),
        });

        await publishToQueue("PRODUCT_SELLER_DASHBOARD.PRODUCT_CREATED", product);
        await publishToQueue("PRODUCT_NOTIFICATION.PRODUCT_CREATED", {
            email: req.user.email,
            username: req.user.username,
            productId: product._id,
            title: product.title,
            sellerId: seller
        });

        return res.status(201).json({
            message: 'Product created',
            data: product,
        });
    } catch (err) {
        console.error('Create product error', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


async function getProducts(req, res) {

    const { q, minprice, maxprice } = req.query;
    const skip = toNonNegativeInt(req.query.skip, 0);
    const limit = Math.min(Math.max(toNonNegativeInt(req.query.limit, 20), 1), 20);


    const filter = {}

    if (q) {
        filter.$text = { $search: String(q) }
    }

    if (minprice && !Number.isNaN(Number(minprice))) {
        filter[ 'price.amount' ] = { ...filter[ 'price.amount' ], $gte: Number(minprice) }
    }

    if (maxprice && !Number.isNaN(Number(maxprice))) {
        filter[ 'price.amount' ] = { ...filter[ 'price.amount' ], $lte: Number(maxprice) }
    }

    const products = await productModel.find(filter).skip(skip).limit(limit);

    return res.status(200).json({ data: products });


}


async function getProductById(req, res) {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await productModel.findById(id);

    if (!product) {
        return res.status(404).json({ message: 'Product not found' });
    }

    return res.status(200).json({ data: product });
}

async function updateProduct(req, res) {

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await productModel.findOne({
        _id: id,
    })


    if (!product) {
        return res.status(404).json({ message: 'Product not found' });
    }

    if (product.seller.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden: You can only update your own products' });
    }

    const allowedUpdates = [ 'title', 'description', 'price', 'stock' ];
    for (const key of Object.keys(req.body)) {
        if (allowedUpdates.includes(key)) {
            if (key === 'stock') {
                const stock = Number(req.body.stock);
                if (!Number.isInteger(stock) || stock < 0) {
                    return res.status(400).json({ message: 'stock must be a non-negative integer' });
                }
                product.stock = stock;
            } else if (key === 'price' && typeof req.body.price === 'object') {
                if (req.body.price.amount !== undefined) {
                    const amount = Number(req.body.price.amount);
                    if (Number.isNaN(amount) || amount <= 0) {
                        return res.status(400).json({ message: 'price.amount must be a number > 0' });
                    }
                    product.price.amount = amount;
                }
                if (req.body.price.currency !== undefined) {
                    if (!CURRENCIES.includes(req.body.price.currency)) {
                        return res.status(400).json({ message: 'price.currency must be USD or INR' });
                    }
                    product.price.currency = req.body.price.currency;
                }
            } else if (key === 'title') {
                if (typeof req.body.title !== 'string' || !req.body.title.trim()) {
                    return res.status(400).json({ message: 'title must be a non-empty string' });
                }
                product.title = req.body.title.trim();
            } else if (key === 'description') {
                if (typeof req.body.description !== 'string' || req.body.description.length > 500) {
                    return res.status(400).json({ message: 'description must be a string of at most 500 characters' });
                }
                product.description = req.body.description;
            } else {
                product[ key ] = req.body[ key ];
            }

        }
    }
    await product.save();
    await publishProductUpdated(product);
    return res.status(200).json({ message: 'Product updated', product });
}

async function deleteProduct(req, res) {

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await productModel.findOne({
        _id: id,
    })

    if (!product) {
        return res.status(404).json({ message: 'Product not found' });
    }

    if (product.seller.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden: You can only delete your own products' });
    }

    await productModel.findOneAndDelete({ _id: id });
    await publishToQueue("PRODUCT_SELLER_DASHBOARD.PRODUCT_DELETED", { _id: product._id });
    return res.status(200).json({ message: 'Product deleted' });

}

async function getProductsBySeller(req, res) {

    const seller = req.user

    const skip = toNonNegativeInt(req.query.skip, 0);
    const limit = Math.min(Math.max(toNonNegativeInt(req.query.limit, 20), 1), 20);

    const products = await productModel.find({ seller: seller.id }).skip(skip).limit(limit);

    return res.status(200).json({ data: products });
}


// ---------- internal (order service only) ----------

function parseStockItems(body) {
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items || !items.length) return null;
    const valid = items.every(item => mongoose.Types.ObjectId.isValid(item.productId)
        && Number.isInteger(item.quantity) && item.quantity > 0);
    return valid ? items.map(item => ({ productId: String(item.productId), quantity: item.quantity })) : null;
}

async function releaseItems(items) {
    const released = [];
    for (const item of items) {
        const product = await productModel.findOneAndUpdate({ _id: item.productId }, { $inc: { stock: item.quantity } }, { new: true });
        if (product) released.push(product);
    }
    return released;
}

// POST /internal/stock/reserve { items: [{ productId, quantity }] }
// All-or-nothing: each decrement only applies if enough stock is left, and earlier
// decrements are rolled back if a later item cannot be reserved.
async function reserveStock(req, res) {
    const items = parseStockItems(req.body);
    if (!items) {
        return res.status(400).json({ message: 'items must be a non-empty list of { productId, quantity > 0 }' });
    }

    const reserved = [];
    for (const item of items) {
        const product = await productModel.findOneAndUpdate(
            { _id: item.productId, stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity } },
            { new: true }
        );

        if (!product) {
            await releaseItems(reserved.map(r => r.item));
            const current = await productModel.findById(item.productId);
            return res.status(409).json({
                message: current
                    ? `Only ${current.stock} of "${current.title}" left in stock`
                    : 'A product in your cart is no longer available',
                productId: item.productId,
            });
        }
        reserved.push({ item, product });
    }

    await Promise.all(reserved.map(r => publishProductUpdated(r.product)));
    return res.status(200).json({ message: 'Stock reserved', items });
}

// POST /internal/stock/release { items: [{ productId, quantity }] }
async function releaseStock(req, res) {
    const items = parseStockItems(req.body);
    if (!items) {
        return res.status(400).json({ message: 'items must be a non-empty list of { productId, quantity > 0 }' });
    }

    const released = await releaseItems(items);
    await Promise.all(released.map(publishProductUpdated));
    return res.status(200).json({ message: 'Stock released', items });
}

module.exports = { createProduct, getProducts, getProductById, updateProduct, deleteProduct, getProductsBySeller, reserveStock, releaseStock };
