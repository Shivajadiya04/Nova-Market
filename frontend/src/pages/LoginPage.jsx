import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Field from '../components/Field';
import { Alert } from '../components/Feedback';
import { hasErrors, validateLogin } from '../utils/validation';

export default function LoginPage() {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [ values, setValues ] = useState({ identifier: '', password: '' });
    const [ errors, setErrors ] = useState({});
    const [ submitError, setSubmitError ] = useState('');
    const [ busy, setBusy ] = useState(false);

    if (user) return <Navigate to={user.role === 'seller' ? '/seller' : '/'} replace />;

    const update = (field) => (event) => {
        setValues(prev => ({ ...prev, [ field ]: event.target.value }));
        setErrors(prev => ({ ...prev, [ field ]: undefined }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const found = validateLogin(values);
        setErrors(found);
        if (hasErrors(found)) return;

        const identifier = values.identifier.trim();
        const credentials = identifier.includes('@')
            ? { email: identifier, password: values.password }
            : { username: identifier, password: values.password };

        setBusy(true);
        setSubmitError('');
        try {
            const loggedIn = await login(credentials);
            const fallback = loggedIn.role === 'seller' ? '/seller' : '/';
            // Return to the page that asked for login, unless it belongs to the other role
            const from = location.state?.from?.pathname;
            const customerOnly = /^\/(cart|checkout|orders|assistant)/.test(from || '');
            const sellerOnly = /^\/seller/.test(from || '');
            const allowed = from && !(loggedIn.role === 'seller' ? customerOnly : sellerOnly);
            navigate(allowed ? from : fallback, { replace: true });
        } catch (err) {
            setSubmitError(err.message);
            setBusy(false);
        }
    };

    return (
        <section className="auth-card">
            <h1>Log in</h1>
            <p className="muted">Welcome back to Nova Market.</p>
            <Alert>{submitError}</Alert>
            <form className="form" onSubmit={handleSubmit} noValidate>
                <Field label="Email or username" value={values.identifier} onChange={update('identifier')} error={errors.identifier} autoComplete="username" autoFocus />
                <Field label="Password" type="password" value={values.password} onChange={update('password')} error={errors.password} autoComplete="current-password" />
                <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
            </form>
            <p className="auth-card__footer">New here? <Link to="/register">Create an account</Link></p>
        </section>
    );
}
