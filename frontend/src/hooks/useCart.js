import { cartApi } from '../services/backend';
import { loadProductsById } from '../services/productLookup';
import { useAsync } from './useAsync';

// Loads the cart plus the product details for each item.
export function useCart() {
    const result = useAsync(async () => {
        const { cart } = await cartApi.get();
        const products = await loadProductsById(cart.items.map(item => item.productId));
        return { cart, products };
    }, []);

    const lines = result.data
        ? result.data.cart.items.map(item => ({ ...item, product: result.data.products[ String(item.productId) ] }))
        : [];

    // Display-only estimate; the order service recomputes the real total from current prices.
    const subtotal = lines.reduce((sum, line) => sum + (line.product ? line.product.price.amount * line.quantity : 0), 0);
    const currency = lines.find(line => line.product)?.product.price.currency || 'INR';

    return { ...result, lines, subtotal: { amount: subtotal, currency } };
}
