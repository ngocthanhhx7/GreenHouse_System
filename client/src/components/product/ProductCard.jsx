import { Link } from 'react-router-dom';

export default function ProductCard({ product }) {
  return (
    <article className="product-card">
      <div className="product-image">
        {product.imageUrls?.[0] ? <img src={product.imageUrls[0]} alt={product.name} /> : <span>No image</span>}
      </div>
      <div className="product-body">
        <h3>{product.name}</h3>
        <p className="text-secondary">{product.category?.name || 'Kitchen product'}</p>
        <strong>${Number(product.price || 0).toFixed(2)}</strong>
        <Link className="btn btn-outline-success btn-sm mt-3" to={`/products/${product.id}`}>
          View detail
        </Link>
      </div>
    </article>
  );
}
