import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cartApi } from '../services/backend';
import { useCart } from '../hooks/useCart';
import { formatPrice } from '../utils/format';
import { Alert, EmptyState, Loader } from '../components/Feedback';

export default function CartPage() {
    const { lines, subtotal, loading, error, reload, data, setData } = useCart();
    const [ busyId, setBusyId ] = useState(null);
    const [ actionError, setActionError ] = useState('');

    const applyCart = (cart) => setData(prev => ({ ...prev, cart }));

    const changeQuantity = async (productId, qty) => {
        if (qty < 1) return;
        setBusyId(productId);
        setActionError('');
        try {
            const { cart } = await cartApi.updateItem(productId, qty);
            applyCart(cart);
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const removeItem = async (productId) => {
        setBusyId(productId);
        setActionError('');
        try {
            const { cart } = await cartApi.removeItem(productId);
            applyCart(cart);
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    if (loading && !data) return <Loader label="Loading your cart…" />;
    if (error && !data) return <Alert onRetry={reload}>{error.message}</Alert>;

    if (lines.length === 0) {
        return <EmptyState title="Your cart is empty" action={<Link to="/" className="btn btn--primary">Start shopping</Link>} />;
    }

    const unavailable = lines.some(line => !line.product || line.product.stock < line.quantity);

    return (
        <section>
            <div className="page-header"><h1>Your cart</h1></div>
            <Alert onClose={() => setActionError('')}>{actionError}</Alert>

            <div className="cart-layout">
                <ul className="cart-list">
                    {lines.map(line => {
                        const id = String(line.productId);
                        const product = line.product;
                        const busy = busyId === id;
                        return (
                            <li key={id} className="cart-item">
                                <div className="cart-item__image">
                                    {product?.images?.[ 0 ] && <img src={product.images[ 0 ].thumbnail || product.images[ 0 ].url} alt="" />}
                                </div>
                                <div className="cart-item__info">
                                    {product
                                        ? <Link to={`/products/${id}`} className="cart-item__title">{product.title}</Link>
                                        : <span className="cart-item__title">Product no longer available</span>}
                                    {product && <span className="muted">{formatPrice(product.price)} each</span>}
                                    {product && product.stock < line.quantity && (
                                        <span className="text-error">Only {product.stock} in stock</span>
                                    )}
                                </div>
                                <div className="cart-item__qty" aria-label={`Quantity for ${product?.title || 'item'}`}>
                                    <button type="button" className="btn btn--ghost btn--icon" onClick={() => changeQuantity(id, line.quantity - 1)} disabled={busy || line.quantity <= 1} aria-label="Decrease quantity">−</button>
                                    <span aria-live="polite">{line.quantity}</span>
                                    <button type="button" className="btn btn--ghost btn--icon" onClick={() => changeQuantity(id, line.quantity + 1)} disabled={busy || (product && line.quantity >= product.stock)} aria-label="Increase quantity">+</button>
                                </div>
                                <div className="cart-item__total">
                                    {product ? formatPrice({ amount: product.price.amount * line.quantity, currency: product.price.currency }) : '-'}
                                </div>
                                <button type="button" className="btn btn--link text-error" onClick={() => removeItem(id)} disabled={busy}>Remove</button>
                            </li>
                        );
                    })}
                </ul>

                <aside className="summary">
                    <h2>Summary</h2>
                    <div className="summary__row"><span>Items</span><span>{lines.reduce((n, l) => n + l.quantity, 0)}</span></div>
                    <div className="summary__row summary__row--total"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
                    {unavailable && <p className="text-error">Remove unavailable items or lower their quantity before checking out.</p>}
                    <Link to="/checkout" className={`btn btn--primary btn--block${unavailable ? ' is-disabled' : ''}`} aria-disabled={unavailable} onClick={e => unavailable && e.preventDefault()}>
                        Proceed to checkout
                    </Link>
                </aside>
            </div>
        </section>
    );
}
