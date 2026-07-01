import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import { cartService } from '../../services/cartService.js';

export default function ProductCard({ product }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');

  async function handleQuickAdd(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user) {
      navigate('/login');
      return;
    }
    
    if (user.role !== 'Customer') {
      setError('Customers only');
      setTimeout(() => setError(''), 2500);
      return;
    }

    setLoading(true);
    setError('');
    try {
      await cartService.addItem({ productId: product.id, quantity: 1 });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (err) {
      setError(err.message || 'Failed to add');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="product-card">
      <div className="product-image-container">
        {product.imageUrls?.[0] ? (
          <img src={product.imageUrls[0]} alt={product.name} className="product-img" />
        ) : (
          <div className="product-no-img">No image available</div>
        )}
        <button 
          className={`quick-add-btn ${added ? 'added' : ''}`}
          onClick={handleQuickAdd}
          disabled={loading}
          aria-label="Quick add to cart"
        >
          {loading ? (
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          ) : added ? (
            '✓'
          ) : (
            '+ Add'
          )}
        </button>
      </div>
      <div className="product-body">
        <h3 className="product-title">{product.name}</h3>
        <p className="product-category">{product.category?.name || 'Kitchen product'}</p>
        <div className="product-footer">
          <strong className="product-price">${Number(product.price || 0).toFixed(2)}</strong>
          <Link className="btn-detail-link" to={`/products/${product.id}`}>
            Details →
          </Link>
        </div>
        {error && <div className="product-card-error">{error}</div>}
      </div>
    </article>
  );
}
