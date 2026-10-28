import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { cartApi } from '../services/backend';

// Only customers (role "user") can use the cart; the cart service rejects sellers with 403.
export default function AddToCartButton({ product, quantity = 1, compact = false }) {
    const { user, isCustomer } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [ state, setState ] = useState({ busy: false, message: '', error: '' });

    if (user && !isCustomer) return null;

    const outOfStock = !product.stock;

    const handleClick = async () => {
        if (!user) {
            navigate('/login', { state: { from: location } });
            return;
        }
        setState({ busy: true, message: '', error: '' });
        try {
            await cartApi.addItem(product._id, quantity);
            setState({ busy: false, message: 'Added to cart', error: '' });
        } catch (err) {
            setState({ busy: false, message: '', error: err.message });
        }
    };

    return (
        <div className="add-to-cart">
            <button
                type="button"
                className={`btn btn--primary${compact ? ' btn--small' : ''}`}
                onClick={handleClick}
                disabled={state.busy || outOfStock}
            >
                {outOfStock ? 'Out of stock' : state.busy ? 'Adding…' : 'Add to cart'}
            </button>
            <span className="add-to-cart__status" role="status" aria-live="polite">
                {state.message && <>{state.message} · <Link to="/cart">View cart</Link></>}
                {state.error && <span className="text-error">{state.error}</span>}
            </span>
        </div>
    );
}
