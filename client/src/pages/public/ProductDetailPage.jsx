import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { cartService } from '../../services/cartService.js';
import { productService } from '../../services/productService.js';

export default function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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

  async function addToCart() {
    setError('');
    setMessage('');
    try {
      await cartService.addItem({ productId: product.id, quantity: 1 });
      setMessage('Product added to cart.');
    } catch (err) {
      setError(err.message);
    }
  }

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
          {message && <div className="alert alert-success mt-3">{message}</div>}
          <div className="mt-4">
            {user?.role === 'Customer' ? (
              <button className="btn btn-success me-2" type="button" onClick={addToCart}>
                Add to cart
              </button>
            ) : (
              <Link className="btn btn-success me-2" to="/login">
                Login to buy
              </Link>
            )}
            <Link className="btn btn-outline-success" to="/products">
              Back to catalog
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
