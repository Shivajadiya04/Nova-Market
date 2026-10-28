import { useState } from 'react';
import { Link } from 'react-router-dom';
import { productApi } from '../../services/backend';
import { useAsync } from '../../hooks/useAsync';
import { formatPrice } from '../../utils/format';
import { Alert, EmptyState, Loader } from '../../components/Feedback';

export default function SellerProductsPage() {
    const { data, error, loading, reload, setData } = useAsync(() => productApi.listMine(), []);
    const [ busyId, setBusyId ] = useState(null);
    const [ message, setMessage ] = useState('');
    const [ actionError, setActionError ] = useState('');

    const remove = async (product) => {
        if (!window.confirm(`Delete "${product.title}"? This cannot be undone.`)) return;
        setBusyId(product._id);
        setActionError('');
        try {
            await productApi.remove(product._id);
            setData(prev => ({ ...prev, data: prev.data.filter(p => p._id !== product._id) }));
            setMessage(`Deleted "${product.title}".`);
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    if (loading && !data) return <Loader label="Loading your products…" />;
    if (error) return <Alert onRetry={reload}>{error.message}</Alert>;

    const products = data.data;

    return (
        <section>
            <div className="page-header page-header--row">
                <h1>My products</h1>
                <Link to="/seller/products/new" className="btn btn--primary">Add product</Link>
            </div>
            <Alert type="success" onClose={() => setMessage('')}>{message}</Alert>
            <Alert onClose={() => setActionError('')}>{actionError}</Alert>

            {products.length === 0 ? (
                <EmptyState title="You have no products yet" action={<Link to="/seller/products/new" className="btn btn--primary">List your first product</Link>} />
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr><th>Product</th><th>Price</th><th>Stock</th><th><span className="sr-only">Actions</span></th></tr>
                        </thead>
                        <tbody>
                            {products.map(product => (
                                <tr key={product._id}>
                                    <td data-label="Product">
                                        <div className="table__product">
                                            {product.images?.[ 0 ] && <img src={product.images[ 0 ].thumbnail || product.images[ 0 ].url} alt="" />}
                                            <Link to={`/products/${product._id}`}>{product.title}</Link>
                                        </div>
                                    </td>
                                    <td data-label="Price">{formatPrice(product.price)}</td>
                                    <td data-label="Stock"><span className={product.stock ? '' : 'text-error'}>{product.stock}</span></td>
                                    <td className="table__actions">
                                        <Link to={`/seller/products/${product._id}/edit`} className="btn btn--ghost btn--small">Edit</Link>
                                        <button type="button" className="btn btn--danger btn--small" onClick={() => remove(product)} disabled={busyId === product._id}>
                                            {busyId === product._id ? 'Deleting…' : 'Delete'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {products.length === 20 && <p className="muted small">Showing the first 20 products (the product service returns at most 20).</p>}
        </section>
    );
}
