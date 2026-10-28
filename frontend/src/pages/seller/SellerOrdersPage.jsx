import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { productApi, sellerApi } from '../../services/backend';
import { useAsync } from '../../hooks/useAsync';
import { formatAddress, formatDate, formatPrice, shortId } from '../../utils/format';
import { Alert, EmptyState, Loader, StatusBadge } from '../../components/Feedback';

const STATUSES = [ 'ALL', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED' ];

// Orders that contain this seller's products (items are already filtered by the backend).
export default function SellerOrdersPage() {
    const { data, error, loading, reload } = useAsync(
        () => Promise.all([ sellerApi.orders(), productApi.listMine() ]).then(([ orders, mine ]) => ({ orders, products: mine.data })),
        []
    );
    const [ status, setStatus ] = useState('ALL');

    const titles = useMemo(
        () => Object.fromEntries((data?.products || []).map(p => [ String(p._id), p.title ])),
        [ data ]
    );

    if (loading && !data) return <Loader label="Loading orders…" />;
    if (error) return <Alert onRetry={reload}>{error.message}</Alert>;

    const orders = status === 'ALL' ? data.orders : data.orders.filter(order => order.status === status);

    return (
        <section>
            <div className="page-header page-header--row">
                <h1>Sales</h1>
                <label className="inline-field">
                    <span>Status</span>
                    <select value={status} onChange={e => setStatus(e.target.value)}>
                        {STATUSES.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s}</option>)}
                    </select>
                </label>
            </div>

            {orders.length === 0 ? (
                <EmptyState title="No orders found">{status === 'ALL' ? 'Orders containing your products will appear here.' : 'No orders with this status.'}</EmptyState>
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr><th>Order</th><th>Date</th><th>Your items</th><th>Ship to</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            {orders.map(order => (
                                <tr key={order._id}>
                                    <td data-label="Order">{shortId(order._id)}</td>
                                    <td data-label="Date">{formatDate(order.createdAt)}</td>
                                    <td data-label="Your items">
                                        <ul className="plain-list">
                                            {order.items.map(item => (
                                                <li key={item._id || item.product}>
                                                    <Link to={`/products/${item.product}`}>{titles[ String(item.product) ] || shortId(item.product)}</Link>
                                                    {' '}× {item.quantity} · {formatPrice(item.price)}
                                                </li>
                                            ))}
                                        </ul>
                                    </td>
                                    <td data-label="Ship to">{formatAddress(order.shippingAddress)}</td>
                                    <td data-label="Status"><StatusBadge status={order.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
