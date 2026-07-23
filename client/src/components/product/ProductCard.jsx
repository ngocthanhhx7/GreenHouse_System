import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { useCart } from '../../contexts/CartContext.jsx';
import { cartService } from '../../services/cartService.js';
import { resolveMediaUrl } from '../../services/apiClient.js';
import { formatCurrency } from '../../utils/formatters.js';

export default function ProductCard({ product }) {
  const { user } = useAuth();
  const { runCartMutation } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState(false);
  const imageUrl = resolveMediaUrl(product.imageUrls?.[0]);

  useEffect(() => setImageError(false), [imageUrl]);

  async function handleQuickAdd(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!user) {
      navigate('/login');
      return;
    }

    if (user.role !== 'Customer') {
      setError('Chỉ tài khoản khách hàng mới thêm được giỏ hàng');
      setTimeout(() => setError(''), 2500);
      return;
    }

    setLoading(true);
    setError('');
    try {
      await runCartMutation(() => cartService.addItem({ productId: product.id || product._id, quantity: 1 }));
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (err) {
      setError(err.message || 'Không thể thêm sản phẩm');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="product-card">
      <div className="product-image-container">
        {imageUrl && !imageError ? (
          <img src={imageUrl} alt={product.name} className="product-img" onError={() => setImageError(true)} />
        ) : (
          <div className="product-no-img">Chưa có ảnh</div>
        )}
        <button
          className={`quick-add-btn ${added ? 'added' : ''}`}
          onClick={handleQuickAdd}
          disabled={loading}
          aria-label="Thêm nhanh vào giỏ hàng"
        >
          {loading ? (
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          ) : added ? (
            'Đã thêm'
          ) : (
            '+ Thêm'
          )}
        </button>
      </div>
      <div className="product-body">
        <h3 className="product-title">{product.name}</h3>
        <p className="product-category">{product.category?.name || 'Sản phẩm nhà bếp'}</p>
        <div className="product-footer">
          <strong className="product-price">{formatCurrency(product.price)}</strong>
          <Link className="btn-detail-link" to={`/products/${product.id || product._id}`}>
            Xem chi tiết
          </Link>
        </div>
        {error && <div className="product-card-error">{error}</div>}
      </div>
    </article>
  );
}
