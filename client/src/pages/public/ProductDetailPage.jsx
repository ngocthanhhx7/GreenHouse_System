import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { productService } from '../../services/productService.js';

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    productService.getProduct(id).then(setProduct).catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <main className="public-page">
        <div className="surface">
          <div className="alert alert-danger">{error}</div>
          <Link to="/products">Back to products</Link>
        </div>
      </main>
    );
  }

  if (!product) return <div className="page-center">Loading...</div>;

  return (
    <main className="public-page">
      <div className="surface product-detail">
        <div className="product-image large">
          {product.imageUrls?.[0] ? <img src={product.imageUrls[0]} alt={product.name} /> : <span>No image</span>}
        </div>
        <div>
          <h1>{product.name}</h1>
          <p className="text-secondary">{product.category?.name}</p>
          <p>{product.description}</p>
          <strong className="price">${Number(product.price || 0).toFixed(2)}</strong>
          <div className="mt-4">
            <Link className="btn btn-outline-success" to="/products">
              Back to catalog
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
