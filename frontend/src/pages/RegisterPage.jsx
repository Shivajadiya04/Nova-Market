import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Field from '../components/Field';
import { Alert } from '../components/Feedback';
import { hasErrors, validateRegister } from '../utils/validation';

export default function RegisterPage() {
    const { user, register } = useAuth();
    const navigate = useNavigate();
    const [ values, setValues ] = useState({ username: '', email: '', password: '', firstName: '', lastName: '', role: 'user' });
    const [ errors, setErrors ] = useState({});
    const [ submitError, setSubmitError ] = useState('');
    const [ busy, setBusy ] = useState(false);

    if (user) return <Navigate to="/" replace />;

    const update = (field) => (event) => {
        setValues(prev => ({ ...prev, [ field ]: event.target.value }));
        setErrors(prev => ({ ...prev, [ field ]: undefined }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const found = validateRegister(values);
        setErrors(found);
        if (hasErrors(found)) return;

        setBusy(true);
        setSubmitError('');
        try {
            const created = await register({
                username: values.username.trim(),
                email: values.email.trim(),
                password: values.password,
                fullName: { firstName: values.firstName.trim(), lastName: values.lastName.trim() },
                role: values.role,
            });
            navigate(created.role === 'seller' ? '/seller' : '/', { replace: true });
        } catch (err) {
            setSubmitError(err.message);
            setBusy(false);
        }
    };

    return (
        <section className="auth-card">
            <h1>Create an account</h1>
            <Alert>{submitError}</Alert>
            <form className="form" onSubmit={handleSubmit} noValidate>
                <div className="form__row">
                    <Field label="First name" value={values.firstName} onChange={update('firstName')} error={errors.firstName} autoComplete="given-name" />
                    <Field label="Last name" value={values.lastName} onChange={update('lastName')} error={errors.lastName} autoComplete="family-name" />
                </div>
                <Field label="Username" value={values.username} onChange={update('username')} error={errors.username} autoComplete="username" hint="At least 3 characters" />
                <Field label="Email" type="email" value={values.email} onChange={update('email')} error={errors.email} autoComplete="email" />
                <Field label="Password" type="password" value={values.password} onChange={update('password')} error={errors.password} autoComplete="new-password" hint="At least 6 characters" />
                <fieldset className="radio-group">
                    <legend>Account type</legend>
                    <label className="radio">
                        <input type="radio" name="role" value="user" checked={values.role === 'user'} onChange={update('role')} />
                        Customer: shop and place orders
                    </label>
                    <label className="radio">
                        <input type="radio" name="role" value="seller" checked={values.role === 'seller'} onChange={update('role')} />
                        Seller: list and manage products
                    </label>
                    {errors.role && <small className="field__error">{errors.role}</small>}
                </fieldset>
                <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
            </form>
            <p className="auth-card__footer">Already have an account? <Link to="/login">Log in</Link></p>
        </section>
    );
}
