import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { orderApi } from '../services/backend';
import { loadProductsById } from '../services/productLookup';
import { getPaymentConfig, payForOrder } from '../services/razorpay';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { formatAddress, formatDate, formatPrice, shortId, toShippingAddress } from '../utils/format';
import AddressForm from '../components/AddressForm';
import { Alert, EmptyState, Loader, StatusBadge } from '../components/Feedback';

export default function OrderDetailPage() {
    const { id } = useParams();
    const location = useLocation();
    const { user } = useAuth();
    const { data, error, loading, reload, setData } = useAsync(async () => {
        const { order } = await orderApi.get(id);
        const products = await loadProductsById(order.items.map(item => item.product));
        return { order, products };
    }, [ id ]);

    const [ editingAddress, setEditingAddress ] = useState(false);
    const [ busy, setBusy ] = useState('');
    const [ message, setMessage ] = useState(location.state?.placed ? 'Order placed successfully.' : '');
    const [ actionError, setActionError ] = useState('');
    const [ mockCheckout, setMockCheckout ] = useState(false);

    useEffect(() => {
        getPaymentConfig().then(config => setMockCheckout(config.mock)).catch(() => {});
    }, []);

    if (loading && !data) return <Loader label="Loading order…" />;
    if (error) {
        if ([ 400, 403, 404 ].includes(error.status) || error.data?.error?.includes('Cast to ObjectId')) {
            return <EmptyState title="Order not found" action={<Link to="/orders" className="btn btn--primary">Back to orders</Link>} />;
        }
        return <Alert onRetry={reload}>{error.message}</Alert>;
    }

    const { order, products } = data;
    const pending = order.status === 'PENDING';
    const setOrder = (next) => setData(prev => ({ ...prev, order: next }));

    const run = async (action, task) => {
        setBusy(action);
        setActionError('');
        setMessage('');
        try {
            await task();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy('');
        }
    };

    const cancel = () => {
        if (!window.confirm('Cancel this order? This cannot be undone.')) return;
        run('cancel', async () => {
            const { order: updated } = await orderApi.cancel(order._id);
            setOrder(updated);
            setMessage('Order cancelled.');
        });
    };

    const updateAddress = (shippingAddress) => run('address', async () => {
        const { order: updated } = await orderApi.updateAddress(order._id, shippingAddress);
        setOrder(updated);
        setEditingAddress(false);
        setMessage('Shipping address updated.');
    });

    const pay = () => run('pay', async () => {
        const { payment, orderConfirmed } = await payForOrder(order._id, user);
        // The server moves the order to CONFIRMED after verifying the payment; show its state
        const { order: refreshed } = await orderApi.get(order._id);
        setOrder(refreshed);
        setMessage(orderConfirmed === false && refreshed.status === 'PENDING'
            ? `Payment received (${payment.paymentId}). Your order will be confirmed shortly.`
            : `Payment successful (${payment.paymentId}). Your order is confirmed.`);
    });

    return (
        <section>
            <Link to="/orders" className="back-link">← All orders</Link>
            <div className="page-header page-header--row">
                <div>
                    <h1>Order {shortId(order._id)}</h1>
                    <p className="muted">Placed {formatDate(order.createdAt)}</p>
                </div>
                <StatusBadge status={order.status} />
            </div>

            <Alert type="success" onClose={() => setMessage('')}>{message}</Alert>
            <Alert onClose={() => setActionError('')}>{actionError}</Alert>

            <div className="cart-layout">
                <div className="stack">
                    <div className="card">
                        <h2>Items</h2>
                        <ul className="summary__items">
                            {order.items.map(item => {
                                const product = products[ String(item.product) ];
                                return (
                                    <li key={item._id || item.product}>
                                        <span>
                                            {product ? <Link to={`/products/${item.product}`}>{product.title}</Link> : 'Product no longer available'} × {item.quantity}
                                        </span>
                                        <span>{formatPrice(item.price)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="summary__row summary__row--total"><span>Total</span><span>{formatPrice(order.totalPrice)}</span></div>
                    </div>

                    <div className="card">
                        <div className="card__header">
                            <h2>Shipping address</h2>
                            {pending && !editingAddress && (
                                <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditingAddress(true)}>Change</button>
                            )}
                        </div>
                        {editingAddress
                            ? <AddressForm
                                initialValues={toShippingAddress(order.shippingAddress)}
                                onSubmit={updateAddress}
                                onCancel={() => setEditingAddress(false)}
                                submitLabel="Update address"
                                busy={busy === 'address'}
                            />
                            : <p>{formatAddress(order.shippingAddress)}</p>}
                    </div>
                </div>

                <aside className="summary">
                    <h2>Actions</h2>
                    {pending ? (
                        <>
                            <button type="button" className="btn btn--primary btn--block" onClick={pay} disabled={Boolean(busy)}>
                                {busy === 'pay' ? 'Processing payment…' : `Pay ${formatPrice(order.totalPrice)}`}
                            </button>
                            {mockCheckout && <p className="muted small">Mock checkout (development): no real payment is made.</p>}
                            <button type="button" className="btn btn--danger btn--block" onClick={cancel} disabled={Boolean(busy)}>
                                {busy === 'cancel' ? 'Cancelling…' : 'Cancel order'}
                            </button>
                        </>
                    ) : (
                        <>
                            {order.payment?.paymentId && (
                                <dl className="details">
                                    <dt>Paid</dt><dd>{formatDate(order.payment.paidAt)}</dd>
                                    <dt>Payment</dt><dd>{order.payment.paymentId}</dd>
                                </dl>
                            )}
                            <p className="muted">Only pending orders can be paid, cancelled or re-addressed.</p>
                        </>
                    )}
                </aside>
            </div>
        </section>
    );
}
