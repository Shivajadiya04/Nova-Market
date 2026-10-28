import { Link } from 'react-router-dom';
import { sellerApi } from '../../services/backend';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatPrice, shortId } from '../../utils/format';
import { Alert, EmptyState, Loader, StatusBadge } from '../../components/Feedback';

export default function SellerDashboardPage() {
    const { data, error, loading, reload } = useAsync(
        () => Promise.all([ sellerApi.metrics(), sellerApi.orders() ]).then(([ metrics, orders ]) => ({ metrics, orders })),
        []
    );

    if (loading && !data) return <Loader label="Loading dashboard…" />;
    if (error) return <Alert onRetry={reload}>{error.message}</Alert>;

    const { metrics, orders } = data;
    const recent = orders.slice(0, 5);

    return (
        <section className="stack">
            <div className="page-header page-header--row">
                <div>
                    <h1>Seller dashboard</h1>
                    <p className="muted">Sales and revenue count confirmed, shipped and delivered orders.</p>
                </div>
                <Link to="/seller/products/new" className="btn btn--primary">Add product</Link>
            </div>

            <div className="stats">
                <div className="stat">
                    <span className="stat__label">Items sold</span>
                    <span className="stat__value">{metrics.sales}</span>
                </div>
                <div className="stat">
                    <span className="stat__label">Revenue</span>
                    <span className="stat__value">{formatPrice({ amount: metrics.revenue, currency: 'INR' })}</span>
                </div>
                <div className="stat">
                    <span className="stat__label">Orders with your products</span>
                    <span className="stat__value">{orders.length}</span>
                </div>
            </div>

            <div className="cart-layout">
                <div className="card">
                    <div className="card__header">
                        <h2>Recent orders</h2>
                        <Link to="/seller/orders">View all</Link>
                    </div>
                    {recent.length === 0
                        ? <p className="muted">No orders yet.</p>
                        : (
                            <ul className="summary__items">
                                {recent.map(order => (
                                    <li key={order._id}>
                                        <span>{shortId(order._id)} · {formatDate(order.createdAt)}</span>
                                        <StatusBadge status={order.status} />
                                    </li>
                                ))}
                            </ul>
                        )}
                </div>

                <aside className="stack">
                <div className="summary">
                    <h2>Inventory</h2>
                    <div className="summary__row"><span>Products listed</span><span>{metrics.inventory?.totalProducts ?? '-'}</span></div>
                    <div className="summary__row"><span>Units in stock</span><span>{metrics.inventory?.totalUnits ?? '-'}</span></div>
                    <div className="summary__row"><span>Out of stock</span><span className={metrics.inventory?.outOfStock ? 'text-error' : ''}>{metrics.inventory?.outOfStock ?? '-'}</span></div>
                    {metrics.inventory?.lowStock?.length > 0 && (
                        <>
                            <h3>Low stock (≤ {metrics.inventory.lowStockThreshold})</h3>
                            <ul className="summary__items">
                                {metrics.inventory.lowStock.map(product => (
                                    <li key={product.id}>
                                        <Link to={`/seller/products/${product.id}/edit`}>{product.title}</Link>
                                        <span>{product.stock} left</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
                <div className="summary">
                    <h2>Top products</h2>
                    {metrics.topProducts.length === 0
                        ? <EmptyState title="No sales yet">Top sellers appear once orders are confirmed.</EmptyState>
                        : (
                            <ol className="summary__items">
                                {metrics.topProducts.map(product => (
                                    <li key={product.id}>
                                        <Link to={`/products/${product.id}`}>{product.title}</Link>
                                        <span>{product.sold} sold</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                </div>
                </aside>
            </div>
        </section>
    );
}
