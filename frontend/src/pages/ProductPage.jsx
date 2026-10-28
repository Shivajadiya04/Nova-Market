import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { productApi } from '../services/backend';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { formatPrice } from '../utils/format';
import AddToCartButton from '../components/AddToCartButton';
import { Alert, EmptyState, Loader } from '../components/Feedback';

export default function ProductPage() {
    const { id } = useParams();
    const { user } = useAuth();
    const { data, error, loading, reload } = useAsync(() => productApi.get(id), [ id ]);
    const [ activeImage, setActiveImage ] = useState(0);
    const [ quantity, setQuantity ] = useState(1);

    if (loading) return <Loader label="Loading product…" />;
    if (error) {
        if (error.status === 404 || error.status === 400) {
            return <EmptyState title="Product not found" action={<Link to="/" className="btn btn--primary">Back to shop</Link>} />;
        }
        return <Alert onRetry={reload}>{error.message}</Alert>;
    }

    const product = data.data;
    const images = product.images || [];
    const image = images[ activeImage ] || images[ 0 ];
    const isOwner = user && String(product.seller) === String(user.id);
    const maxQuantity = Math.max(1, product.stock || 1);

    return (
        <article className="product-detail">
            <Link to="/" className="back-link">← Back to shop</Link>
            <div className="product-detail__layout">
                <div className="gallery">
                    <div className="gallery__main">
                        {image ? <img src={image.url} alt={product.title} /> : <span className="product-card__placeholder">{product.title.slice(0, 1)}</span>}
                    </div>
                    {images.length > 1 && (
                        <div className="gallery__thumbs">
                            {images.map((img, index) => (
                                <button
                                    key={img.id || index}
                                    type="button"
                                    className={index === activeImage ? 'is-active' : ''}
                                    onClick={() => setActiveImage(index)}
                                    aria-label={`Show image ${index + 1}`}
                                >
                                    <img src={img.thumbnail || img.url} alt="" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="product-detail__info">
                    <h1>{product.title}</h1>
                    <p className="product-detail__price">{formatPrice(product.price)}</p>
                    <p className={`stock ${product.stock ? '' : 'stock--out'}`}>
                        {product.stock ? `${product.stock} in stock` : 'Out of stock'}
                    </p>
                    {product.description && <p className="product-detail__description">{product.description}</p>}

                    {product.stock > 0 && (!user || user.role === 'user') && (
                        <div className="quantity-picker">
                            <label htmlFor="quantity">Quantity</label>
                            <input
                                id="quantity"
                                type="number"
                                min="1"
                                max={maxQuantity}
                                value={quantity}
                                onChange={e => setQuantity(Math.min(maxQuantity, Math.max(1, Number(e.target.value) || 1)))}
                            />
                        </div>
                    )}
                    <AddToCartButton product={product} quantity={quantity} />

                    {isOwner && (
                        <p><Link to={`/seller/products/${product._id}/edit`} className="btn btn--ghost">Edit this product</Link></p>
                    )}
                </div>
            </div>
        </article>
    );
}
