import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productApi } from '../services/backend';
import { useAsync } from '../hooks/useAsync';
import ProductCard from '../components/ProductCard';
import Pagination from '../components/Pagination';
import { Alert, EmptyState, Loader } from '../components/Feedback';

const PAGE_SIZE = 12; // the product service caps limit at 20

export default function ShopPage() {
    const [ params, setParams ] = useSearchParams();
    const q = params.get('q') || '';
    const minprice = params.get('minprice') || '';
    const maxprice = params.get('maxprice') || '';
    const page = Math.max(1, Number(params.get('page')) || 1);

    const [ form, setForm ] = useState({ q, minprice, maxprice });
    const [ formError, setFormError ] = useState('');

    const { data, error, loading, reload } = useAsync(
        () => productApi.list({ q, minprice, maxprice, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
        [ q, minprice, maxprice, page ]
    );
    const products = data?.data || [];

    const applyFilters = (event) => {
        event.preventDefault();
        if (form.minprice && form.maxprice && Number(form.minprice) > Number(form.maxprice)) {
            setFormError('Minimum price cannot be higher than maximum price');
            return;
        }
        setFormError('');
        const next = {};
        if (form.q.trim()) next.q = form.q.trim();
        if (form.minprice) next.minprice = form.minprice;
        if (form.maxprice) next.maxprice = form.maxprice;
        setParams(next);
    };

    const clearFilters = () => {
        setForm({ q: '', minprice: '', maxprice: '' });
        setFormError('');
        setParams({});
    };

    const goToPage = (nextPage) => {
        const next = Object.fromEntries(params);
        next.page = String(nextPage);
        setParams(next);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const filtered = Boolean(q || minprice || maxprice);

    return (
        <section>
            <div className="page-header">
                <h1>Shop</h1>
                <p className="muted">Browse products from independent sellers.</p>
            </div>

            <form className="filters" onSubmit={applyFilters} role="search">
                <label className="filters__search">
                    <span className="sr-only">Search products</span>
                    <input
                        type="search"
                        placeholder="Search products…"
                        value={form.q}
                        onChange={e => setForm({ ...form, q: e.target.value })}
                    />
                </label>
                <label>
                    <span className="sr-only">Minimum price</span>
                    <input type="number" min="0" placeholder="Min ₹" value={form.minprice} onChange={e => setForm({ ...form, minprice: e.target.value })} />
                </label>
                <label>
                    <span className="sr-only">Maximum price</span>
                    <input type="number" min="0" placeholder="Max ₹" value={form.maxprice} onChange={e => setForm({ ...form, maxprice: e.target.value })} />
                </label>
                <button type="submit" className="btn btn--primary">Search</button>
                {filtered && <button type="button" className="btn btn--ghost" onClick={clearFilters}>Clear</button>}
            </form>
            <Alert>{formError}</Alert>

            {loading && !data && <Loader label="Loading products…" />}
            {error && <Alert onRetry={reload}>{error.message}</Alert>}

            {data && products.length === 0 && (
                <EmptyState title={filtered ? 'No products match your search' : 'No products yet'}>
                    {filtered ? 'Try different keywords or a wider price range.' : 'Sellers have not listed anything yet.'}
                </EmptyState>
            )}

            {products.length > 0 && (
                <div className={`product-grid${loading ? ' is-refreshing' : ''}`}>
                    {products.map(product => <ProductCard key={product._id} product={product} />)}
                </div>
            )}

            <Pagination
                page={page}
                hasPrevious={page > 1}
                hasNext={products.length === PAGE_SIZE}
                onChange={goToPage}
            />
        </section>
    );
}
