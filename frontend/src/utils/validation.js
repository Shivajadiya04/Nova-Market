// Client-side checks that mirror the backend's express-validator rules, so users get
// feedback before submitting. The backend still validates everything.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegister(values) {
    const errors = {};
    if (values.username.trim().length < 3) errors.username = 'Username must be at least 3 characters long';
    if (!EMAIL.test(values.email)) errors.email = 'Enter a valid email address';
    if (values.password.length < 6) errors.password = 'Password must be at least 6 characters long';
    if (!values.firstName.trim()) errors.firstName = 'First name is required';
    if (!values.lastName.trim()) errors.lastName = 'Last name is required';
    if (![ 'user', 'seller' ].includes(values.role)) errors.role = 'Choose an account type';
    return errors;
}

export function validateLogin(values) {
    const errors = {};
    if (!values.identifier.trim()) errors.identifier = 'Enter your email or username';
    else if (values.identifier.includes('@') && !EMAIL.test(values.identifier)) errors.identifier = 'Enter a valid email address';
    if (values.password.length < 6) errors.password = 'Password must be at least 6 characters long';
    return errors;
}

export function validateAddress(values) {
    const errors = {};
    [ 'street', 'city', 'state', 'country' ].forEach(field => {
        if (!values[ field ]?.trim()) errors[ field ] = `${field[ 0 ].toUpperCase()}${field.slice(1)} is required`;
    });
    if (!/^\d{4,}$/.test(values.pincode || '')) errors.pincode = 'Pincode must be at least 4 digits';
    if (values.phone && !/^\d{10}$/.test(values.phone)) errors.phone = 'Phone must be a 10-digit number';
    return errors;
}

export function validateProduct(values) {
    const errors = {};
    if (!values.title.trim()) errors.title = 'Title is required';
    if (values.description.length > 500) errors.description = 'Description can be at most 500 characters';
    const amount = Number(values.priceAmount);
    if (!values.priceAmount || Number.isNaN(amount) || amount <= 0) errors.priceAmount = 'Price must be a number greater than 0';
    if (![ 'INR', 'USD' ].includes(values.priceCurrency)) errors.priceCurrency = 'Currency must be INR or USD';
    if (values.stock === '' || !Number.isInteger(Number(values.stock)) || Number(values.stock) < 0) errors.stock = 'Stock must be a whole number of 0 or more';
    if (values.images && values.images.length > 5) errors.images = 'You can upload at most 5 images';
    return errors;
}

export const hasErrors = (errors) => Object.keys(errors).length > 0;
