import { productApi } from './backend';

// Carts and orders only store product ids, so pages resolve the details with
// GET /products/:id. Products that no longer exist map to null.
export async function loadProductsById(ids) {
    const unique = [ ...new Set(ids.map(String)) ];
    const results = await Promise.allSettled(unique.map(id => productApi.get(id)));
    return Object.fromEntries(unique.map((id, i) => [ id, results[ i ].status === 'fulfilled' ? results[ i ].value.data : null ]));
}
