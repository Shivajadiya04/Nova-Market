import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { productApi } from '../../services/backend';
import { useAuth } from '../../hooks/useAuth';
import Field from '../../components/Field';
import { Alert, EmptyState, Loader } from '../../components/Feedback';
import { hasErrors, validateProduct } from '../../utils/validation';

const EMPTY = { title: '', description: '', priceAmount: '', priceCurrency: 'INR', stock: '0', images: [] };

// Create (POST multipart /products) and edit (PATCH JSON /products/:id) a product.
// The backend accepts images only when creating, so editing shows them read-only.
export default function ProductFormPage() {
    const { id } = useParams();
    const editing = Boolean(id);
    const navigate = useNavigate();
    const { user } = useAuth();

    const [ values, setValues ] = useState(EMPTY);
    const [ existingImages, setExistingImages ] = useState([]);
    const [ previews, setPreviews ] = useState([]);
    const [ errors, setErrors ] = useState({});
    const [ loadState, setLoadState ] = useState({ loading: editing, error: null });
    const [ submitError, setSubmitError ] = useState('');
    const [ busy, setBusy ] = useState(false);

    useEffect(() => {
        if (!editing) return;
        productApi.get(id)
            .then(({ data: product }) => {
                if (String(product.seller) !== String(user.id)) {
                    setLoadState({ loading: false, error: { status: 403, message: 'You can only edit your own products.' } });
                    return;
                }
                setValues({
                    title: product.title,
                    description: product.description || '',
                    priceAmount: String(product.price.amount),
                    priceCurrency: product.price.currency || 'INR',
                    stock: String(product.stock ?? 0),
                    images: [],
                });
                setExistingImages(product.images || []);
                setLoadState({ loading: false, error: null });
            })
            .catch(error => setLoadState({ loading: false, error }));
    }, [ editing, id, user.id ]);

    useEffect(() => {
        const urls = values.images.map(file => URL.createObjectURL(file));
        setPreviews(urls);
        return () => urls.forEach(url => URL.revokeObjectURL(url));
    }, [ values.images ]);

    const update = (field) => (event) => {
        const value = field === 'images' ? Array.from(event.target.files || []) : event.target.value;
        setValues(prev => ({ ...prev, [ field ]: value }));
        setErrors(prev => ({ ...prev, [ field ]: undefined }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const found = validateProduct(values);
        setErrors(found);
        if (hasErrors(found)) return;

        setBusy(true);
        setSubmitError('');
        try {
            if (editing) {
                await productApi.update(id, {
                    title: values.title.trim(),
                    description: values.description.trim(),
                    price: { amount: Number(values.priceAmount), currency: values.priceCurrency },
                    stock: Number(values.stock),
                });
            } else {
                const form = new FormData();
                form.append('title', values.title.trim());
                if (values.description.trim()) form.append('description', values.description.trim());
                form.append('priceAmount', values.priceAmount);
                form.append('priceCurrency', values.priceCurrency);
                form.append('stock', values.stock);
                values.images.forEach(file => form.append('images', file));
                await productApi.create(form);
            }
            navigate('/seller/products', { replace: true });
        } catch (err) {
            setSubmitError(err.message);
            setBusy(false);
        }
    };

    if (loadState.loading) return <Loader label="Loading product…" />;
    if (loadState.error) {
        return <EmptyState title={loadState.error.status === 404 ? 'Product not found' : 'Cannot edit this product'} action={<Link to="/seller/products" className="btn btn--primary">Back to my products</Link>}>{loadState.error.message}</EmptyState>;
    }

    return (
        <section className="narrow">
            <Link to="/seller/products" className="back-link">← My products</Link>
            <div className="page-header"><h1>{editing ? 'Edit product' : 'Add a product'}</h1></div>
            <Alert>{submitError}</Alert>

            <form className="form card" onSubmit={handleSubmit} noValidate>
                <Field label="Title" value={values.title} onChange={update('title')} error={errors.title} />
                <Field
                    label="Description"
                    as="textarea"
                    rows={4}
                    value={values.description}
                    onChange={update('description')}
                    error={errors.description}
                    hint={`${values.description.length}/500 characters`}
                />
                <div className="form__row">
                    <Field label="Price" type="number" min="0" step="0.01" value={values.priceAmount} onChange={update('priceAmount')} error={errors.priceAmount} />
                    <Field label="Currency" as="select" value={values.priceCurrency} onChange={update('priceCurrency')} error={errors.priceCurrency}>
                        <option value="INR">INR</option>
                        <option value="USD">USD</option>
                    </Field>
                    <Field label="Stock" type="number" min="0" step="1" value={values.stock} onChange={update('stock')} error={errors.stock} />
                </div>

                {editing ? (
                    existingImages.length > 0 && (
                        <div className="field">
                            <span className="field__label">Images</span>
                            <div className="image-previews">
                                {existingImages.map((img, i) => <img key={img.id || i} src={img.thumbnail || img.url} alt="" />)}
                            </div>
                            <small className="field__hint">Images can only be added when a product is created.</small>
                        </div>
                    )
                ) : (
                    <>
                        <Field label="Images (up to 5)" type="file" accept="image/*" multiple onChange={update('images')} error={errors.images} />
                        {previews.length > 0 && (
                            <div className="image-previews">
                                {previews.map(url => <img key={url} src={url} alt="" />)}
                            </div>
                        )}
                    </>
                )}

                <div className="form__actions">
                    <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create product'}</button>
                    <Link to="/seller/products" className="btn btn--ghost">Cancel</Link>
                </div>
            </form>
        </section>
    );
}
