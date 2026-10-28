export function formatPrice(price) {
    if (!price || typeof price.amount !== 'number') return '-';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: price.currency || 'INR',
        maximumFractionDigits: 2,
    }).format(price.amount);
}

export function formatDate(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

// Order addresses store the pincode as `zip`; saved user addresses may have either field.
export function formatAddress(address) {
    if (!address) return '';
    const pincode = address.pincode || address.zip;
    return [ address.street, address.city, address.state, pincode, address.country ].filter(Boolean).join(', ');
}

// Turns a saved address or an order address into the shape the order endpoints expect.
export function toShippingAddress(address) {
    return {
        street: address.street || '',
        city: address.city || '',
        state: address.state || '',
        pincode: address.pincode || address.zip || '',
        country: address.country || '',
    };
}

export function shortId(id) {
    return id ? `#${String(id).slice(-6).toUpperCase()}` : '';
}
