import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, cartApi, orderApi } from '../services/backend';
import { useCart } from '../hooks/useCart';
import { useAsync } from '../hooks/useAsync';
import { formatAddress, formatPrice, toShippingAddress } from '../utils/format';
import AddressForm from '../components/AddressForm';
import { Alert, EmptyState, Loader } from '../components/Feedback';

export default function CheckoutPage() {
    const navigate = useNavigate();
    const cart = useCart();
    const addresses = useAsync(() => authApi.getAddresses(), []);
    const saved = addresses.data?.addresses || [];

    const [ selected, setSelected ] = useState(null); // address _id or 'new'
    const [ saveNew, setSaveNew ] = useState(true);
    const [ busy, setBusy ] = useState(false);
    const [ submitError, setSubmitError ] = useState('');

    useEffect(() => {
        if (selected || (!addresses.data && !addresses.error)) return;
        const preferred = saved.find(a => a.isDefault) || saved[ 0 ];
        setSelected(preferred ? preferred._id : 'new');
    }, [ addresses.data, saved, selected ]);

    const placeOrder = async (shippingAddress) => {
        setBusy(true);
        setSubmitError('');
        try {
            if (selected === 'new' && saveNew) {
                await authApi.addAddress(shippingAddress);
            }
            const { order } = await orderApi.create(shippingAddress);
            // The order service does not empty the cart, so do it once the order exists.
            await cartApi.clear().catch(() => {});
            navigate(`/orders/${order._id}`, { replace: true, state: { placed: true } });
        } catch (err) {
            setSubmitError(err.message);
            setBusy(false);
        }
    };

    if ((cart.loading && !cart.data) || (addresses.loading && !addresses.data)) return <Loader label="Preparing checkout…" />;
    if (cart.error && !cart.data) return <Alert onRetry={cart.reload}>{cart.error.message}</Alert>;
    if (cart.lines.length === 0) {
        return <EmptyState title="Nothing to check out" action={<Link to="/" className="btn btn--primary">Browse products</Link>}>Your cart is empty.</EmptyState>;
    }

    const selectedAddress = saved.find(a => a._id === selected);

    return (
        <section>
            <div className="page-header"><h1>Checkout</h1></div>
            <Alert>{submitError}</Alert>

            <div className="cart-layout">
                <div className="card">
                    <h2>Shipping address</h2>
                    {addresses.error && <Alert onRetry={addresses.reload}>Could not load saved addresses: {addresses.error.message}</Alert>}

                    <fieldset className="radio-group" disabled={busy}>
                        <legend className="sr-only">Choose an address</legend>
                        {saved.map(address => (
                            <label key={address._id} className="radio radio--card">
                                <input type="radio" name="address" checked={selected === address._id} onChange={() => setSelected(address._id)} />
                                <span>
                                    {formatAddress(address)}
                                    {address.isDefault && <span className="badge badge--default">Default</span>}
                                </span>
                            </label>
                        ))}
                        <label className="radio radio--card">
                            <input type="radio" name="address" checked={selected === 'new'} onChange={() => setSelected('new')} />
                            <span>Use a new address</span>
                        </label>
                    </fieldset>

                    {selected === 'new' && (
                        <>
                            <label className="checkbox">
                                <input type="checkbox" checked={saveNew} onChange={e => setSaveNew(e.target.checked)} />
                                Save this address to my account
                            </label>
                            <AddressForm onSubmit={placeOrder} submitLabel="Place order" busy={busy} />
                        </>
                    )}

                    {selectedAddress && (
                        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => placeOrder(toShippingAddress(selectedAddress))}>
                            {busy ? 'Placing order…' : 'Place order'}
                        </button>
                    )}
                </div>

                <aside className="summary">
                    <h2>Order summary</h2>
                    <ul className="summary__items">
                        {cart.lines.map(line => (
                            <li key={String(line.productId)}>
                                <span>{line.product?.title || 'Unavailable product'} × {line.quantity}</span>
                                <span>{line.product ? formatPrice({ amount: line.product.price.amount * line.quantity, currency: line.product.price.currency }) : '-'}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="summary__row summary__row--total"><span>Estimated total</span><span>{formatPrice(cart.subtotal)}</span></div>
                    <p className="muted small">Prices and stock are checked again when the order is placed. You can pay from the order page.</p>
                </aside>
            </div>
        </section>
    );
}
