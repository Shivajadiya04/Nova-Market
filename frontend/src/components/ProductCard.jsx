import { Link } from 'react-router-dom';
import { formatPrice } from '../utils/format';
import AddToCartButton from './AddToCartButton';

export default function ProductCard({ product }) {
    const image = product.images?.[ 0 ];
    const outOfStock = !product.stock;

    return (
        <article className="product-card">
            <Link to={`/products/${product._id}`} className="product-card__image">
                {image
                    ? <img src={image.thumbnail || image.url} alt={product.title} loading="lazy" />
                    : <span className="product-card__placeholder" aria-hidden="true">{product.title.slice(0, 1)}</span>}
            </Link>
            <div className="product-card__body">
                <h3 className="product-card__title">
                    <Link to={`/products/${product._id}`}>{product.title}</Link>
                </h3>
                <p className="product-card__price">{formatPrice(product.price)}</p>
                <p className={`stock ${outOfStock ? 'stock--out' : ''}`}>{outOfStock ? 'Out of stock' : `${product.stock} in stock`}</p>
                <AddToCartButton product={product} compact />
            </div>
        </article>
    );
}
