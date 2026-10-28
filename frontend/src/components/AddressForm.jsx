import { useState } from 'react';
import Field from './Field';
import { hasErrors, validateAddress } from '../utils/validation';

const EMPTY = { street: '', city: '', state: '', pincode: '', country: 'India', phone: '', isDefault: false };

// Address fields shared by the account page, checkout and order address editing.
// showPhone/showDefault toggle the fields that only saved addresses support.
export default function AddressForm({ initialValues, onSubmit, submitLabel = 'Save address', onCancel, showPhone = false, showDefault = false, busy = false }) {
    const [ values, setValues ] = useState({ ...EMPTY, ...initialValues });
    const [ errors, setErrors ] = useState({});

    const update = (field) => (event) => {
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        setValues(prev => ({ ...prev, [ field ]: value }));
        setErrors(prev => ({ ...prev, [ field ]: undefined }));
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        const found = validateAddress(values);
        setErrors(found);
        if (hasErrors(found)) return;

        const address = {
            street: values.street.trim(),
            city: values.city.trim(),
            state: values.state.trim(),
            pincode: values.pincode.trim(),
            country: values.country.trim(),
        };
        if (showPhone && values.phone) address.phone = values.phone.trim();
        if (showDefault) address.isDefault = values.isDefault;
        onSubmit(address);
    };

    return (
        <form className="form" onSubmit={handleSubmit} noValidate>
            <Field label="Street" value={values.street} onChange={update('street')} error={errors.street} autoComplete="street-address" />
            <div className="form__row">
                <Field label="City" value={values.city} onChange={update('city')} error={errors.city} autoComplete="address-level2" />
                <Field label="State" value={values.state} onChange={update('state')} error={errors.state} autoComplete="address-level1" />
            </div>
            <div className="form__row">
                <Field label="Pincode" value={values.pincode} onChange={update('pincode')} error={errors.pincode} inputMode="numeric" autoComplete="postal-code" />
                <Field label="Country" value={values.country} onChange={update('country')} error={errors.country} autoComplete="country-name" />
            </div>
            {showPhone && (
                <Field label="Phone (optional)" value={values.phone} onChange={update('phone')} error={errors.phone} inputMode="numeric" autoComplete="tel" hint="10 digits" />
            )}
            {showDefault && (
                <label className="checkbox">
                    <input type="checkbox" checked={values.isDefault} onChange={update('isDefault')} />
                    Make this my default address
                </label>
            )}
            <div className="form__actions">
                <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
                {onCancel && <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>}
            </div>
        </form>
    );
}
