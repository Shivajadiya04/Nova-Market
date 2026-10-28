// One function per backend endpoint, grouped by service. Request and response shapes follow
// the existing controllers exactly; components never build URLs themselves.
import { apiRequest, toQuery } from './api';

export const authApi = {
    // auth: false -> a 401 here means "not logged in", not "session expired"
    me: () => apiRequest('/auth/me', { auth: false }),
    login: (credentials) => apiRequest('/auth/login', { method: 'POST', body: credentials, auth: false }),
    register: (payload) => apiRequest('/auth/register', { method: 'POST', body: payload, auth: false }),
    logout: () => apiRequest('/auth/logout', { auth: false }),
    getAddresses: () => apiRequest('/auth/users/me/addresses'),
    addAddress: (address) => apiRequest('/auth/users/me/addresses', { method: 'POST', body: address }),
    deleteAddress: (addressId) => apiRequest(`/auth/users/me/addresses/${addressId}`, { method: 'DELETE' }),
};

export const productApi = {
    list: ({ q, minprice, maxprice, skip, limit }) => apiRequest(`/products${toQuery({ q, minprice, maxprice, skip, limit })}`, { auth: false }),
    get: (id) => apiRequest(`/products/${id}`, { auth: false }),
    listMine: () => apiRequest('/products/seller'),
    create: (formData) => apiRequest('/products', { method: 'POST', body: formData }),
    update: (id, changes) => apiRequest(`/products/${id}`, { method: 'PATCH', body: changes }),
    remove: (id) => apiRequest(`/products/${id}`, { method: 'DELETE' }),
};

export const cartApi = {
    get: () => apiRequest('/cart'),
    addItem: (productId, qty) => apiRequest('/cart/items', { method: 'POST', body: { productId, qty } }),
    updateItem: (productId, qty) => apiRequest(`/cart/items/${productId}`, { method: 'PATCH', body: { qty } }),
    removeItem: (productId) => apiRequest(`/cart/items/${productId}`, { method: 'DELETE' }),
    clear: () => apiRequest('/cart', { method: 'DELETE' }),
};

export const orderApi = {
    create: (shippingAddress) => apiRequest('/orders', { method: 'POST', body: { shippingAddress } }),
    listMine: ({ page, limit }) => apiRequest(`/orders/me${toQuery({ page, limit })}`),
    get: (id) => apiRequest(`/orders/${id}`),
    cancel: (id) => apiRequest(`/orders/${id}/cancel`, { method: 'POST' }),
    updateAddress: (id, shippingAddress) => apiRequest(`/orders/${id}/address`, { method: 'PATCH', body: { shippingAddress } }),
};

export const paymentApi = {
    config: () => apiRequest('/payments/config'),
    create: (orderId) => apiRequest(`/payments/create/${orderId}`, { method: 'POST' }),
    verify: ({ razorpayOrderId, paymentId, signature }) => apiRequest('/payments/verify', { method: 'POST', body: { razorpayOrderId, paymentId, signature } }),
    // Exists only when the payment service runs in mock mode without Razorpay keys.
    mockCheckout: (razorpayOrderId) => apiRequest('/payments/mock/checkout', { method: 'POST', body: { razorpayOrderId } }),
};

export const sellerApi = {
    metrics: () => apiRequest('/seller/dashboard/metrics'),
    orders: () => apiRequest('/seller/dashboard/orders'),
};
