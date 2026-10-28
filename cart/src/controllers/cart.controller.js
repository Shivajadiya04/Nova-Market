const cartModel = require('../models/cart.model');



async function getCart(req, res) {

    const user = req.user;

    let cart = await cartModel.findOne({ user: user.id });

    if (!cart) {
        cart = new cartModel({ user: user.id, items: [] });
        await cart.save();
    }

    res.status(200).json({
        cart,
        totals: {
            itemCount: cart.items.length,
            totalQuantity: cart.items.reduce((sum, item) => sum + item.quantity, 0)
        }
    });

}


async function addItemToCart(req, res) {

    const { productId, qty } = req.body;

    const user = req.user

    let cart = await cartModel.findOne({ user: user.id });

    if (!cart) {
        cart = new cartModel({ user: user.id, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(item => item.productId.toString() === productId);

    if (existingItemIndex >= 0) {
        cart.items[ existingItemIndex ].quantity += qty;
    } else {
        cart.items.push({ productId, quantity: qty });
    }

    await cart.save();

    res.status(200).json({
        message: 'Item added to cart',
        cart,
    });

}

async function updateItemQuantity(req, res) {
    const { productId } = req.params;
    const { qty } = req.body;
    const user = req.user;
    const cart = await cartModel.findOne({ user: user.id });
    if (!cart) {
        return res.status(404).json({ message: 'Cart not found' });
    }
    const existingItemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
    if (existingItemIndex < 0) {
        return res.status(404).json({ message: 'Item not found' });
    }
    cart.items[ existingItemIndex ].quantity = qty;
    await cart.save();
    res.status(200).json({ message: 'Item updated', cart });
}

async function removeItemFromCart(req, res) {
    const { productId } = req.params;
    const user = req.user;
    const cart = await cartModel.findOne({ user: user.id });
    if (!cart) {
        return res.status(404).json({ message: 'Cart not found' });
    }
    const existingItemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
    if (existingItemIndex < 0) {
        return res.status(404).json({ message: 'Item not found' });
    }
    cart.items.splice(existingItemIndex, 1);
    await cart.save();
    res.status(200).json({ message: 'Item removed', cart });
}

async function clearCart(req, res) {
    const user = req.user;
    let cart = await cartModel.findOne({ user: user.id });
    if (!cart) {
        cart = new cartModel({ user: user.id, items: [] });
    }
    cart.items = [];
    await cart.save();
    res.status(200).json({ message: 'Cart cleared', cart });
}

module.exports = {
    addItemToCart,
    updateItemQuantity,
    removeItemFromCart,
    clearCart,
    getCart
};