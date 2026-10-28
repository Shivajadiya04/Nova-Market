import { Link, useSearchParams } from 'react-router-dom';
import { orderApi } from '../services/backend';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatPrice, shortId } from '../utils/format';
import Pagination from '../components/Pagination';
import { Alert, EmptyState, Loader, StatusBadge } from '../components/Feedback';

const PAGE_SIZE = 10;

export default function OrdersPage() {
    const [ params, setParams ] = useSearchParams();
    const page = Math.max(1, Number(params.get('page')) || 1);
    const { data, error, loading, reload } = useAsync(() => orderApi.listMine({ page, limit: PAGE_SIZE }), [ page ]);

    if (loading && !data) return <Loader label="Loading your orders…" />;
    if (error) return <Alert onRetry={reload}>{error.message}</Alert>;

    const { orders, meta } = data;
    const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));

    if (meta.total === 0) {
        return <EmptyState title="No orders yet" action={<Link to="/" className="btn btn--primary">Start shopping</Link>}>Orders you place will show up here.</EmptyState>;
    }

    return (
        <section>
            <div className="page-header"><h1>Your orders</h1></div>
            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr><th>Order</th><th>Placed</th><th>Items</th><th>Total</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
                    </thead>
                    <tbody>
                        {orders.map(order => (
                            <tr key={order._id}>
                                <td data-label="Order">{shortId(order._id)}</td>
                                <td data-label="Placed">{formatDate(order.createdAt)}</td>
                                <td data-label="Items">{order.items.reduce((n, item) => n + item.quantity, 0)}</td>
                                <td data-label="Total">{formatPrice(order.totalPrice)}</td>
                                <td data-label="Status"><StatusBadge status={order.status} /></td>
                                <td><Link to={`/orders/${order._id}`}>View</Link></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pagination
                page={page}
                hasPrevious={page > 1}
                hasNext={page < totalPages}
                onChange={next => setParams({ page: String(next) })}
                label={`Page ${page} of ${totalPages}`}
            />
        </section>
    );
}
