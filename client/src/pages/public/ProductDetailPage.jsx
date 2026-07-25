import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { useCart } from '../../contexts/CartContext.jsx';
import { cartService } from '../../services/cartService.js';
import { createCartCommandRetryStore } from '../../services/cartCommandRetry.js';
import { resolveMediaUrl } from '../../services/apiClient.js';
import { productService } from '../../services/productService.js';
import { formatProductCurrency, formatProductSku } from '../../utils/formatters.js';
import ProductReviewPanel from '../../components/review/ProductReviewPanel.jsx';

export default function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { runCartMutation } = useCart();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const cartCommandRetries = useRef(createCartCommandRetryStore());

  useEffect(() => {
    productService.getProduct(id).then(setProduct).catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    setActiveImageIndex(0);
    setImageError(false);
  }, [product?.id]);

  if (error) {
    return (
      <main className="public-page">
        <div className="surface">
          <div className="alert alert-danger">{error}</div>
          <Link to="/products">Quay lại danh sách sản phẩm</Link>
        </div>
      </main>
    );
  }

  if (!product) return <div className="page-center">Đang tải sản phẩm...</div>;

  const productImages = product.imageUrls || [];
  const activeImage = resolveMediaUrl(productImages[activeImageIndex]);
  const isOutOfStock = product.availabilityStatus === 'OutOfStock';

  async function addToCart() {
    setError('');
    setMessage('');
    try {
      await runCartMutation((currentCart) => {
        const command = cartCommandRetries.current.acquire(`add:${product.id || product._id}`, {
          productId: product.id || product._id,
          quantity: 1,
          expectedVersion: Number(currentCart.version || 0),
        });
        return cartService.addItem(command.facts, { idempotencyKey: command.idempotencyKey })
          .then((result) => {
            cartCommandRetries.current.confirm(`add:${product.id || product._id}`, command);
            return result;
          });
      });
      setMessage('Đã thêm sản phẩm vào giỏ hàng.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="public-page">
      <div className="surface product-detail">
        <div className="product-gallery">
          <div className="product-image large">
            {activeImage && !imageError ? <img src={activeImage} alt={product.name} onError={() => setImageError(true)} /> : <span>Chưa có ảnh phù hợp</span>}
          </div>
          {productImages.length > 1 && <div className="product-gallery-thumbnails" aria-label="Chọn ảnh sản phẩm">{productImages.map((url, index) => <button className={index === activeImageIndex ? 'active' : ''} type="button" key={`${url}-${index}`} onClick={() => { setActiveImageIndex(index); setImageError(false); }} aria-label={`Xem ảnh ${index + 1}`}><img src={resolveMediaUrl(url)} alt="" /></button>)}</div>}
        </div>
        <div>
          <span className="eyebrow">{product.category?.name || 'Sản phẩm nhà bếp'}</span>
          <h1>{product.name}</h1>
          <p className="product-sku">{formatProductSku(product.sku)}</p>
          <p>{product.description || 'Sản phẩm đang được GreenHome cập nhật mô tả chi tiết.'}</p>
          <strong className="price">{formatProductCurrency(product)}</strong>
          <p className={`stock-note ${isOutOfStock ? 'text-danger' : 'text-success'}`}>
            {isOutOfStock ? 'Hết hàng' : 'Còn hàng'}
          </p>
          {message && <div className="alert alert-success mt-3">{message}</div>}
          <div className="mt-4">
            {user?.role === 'Customer' ? (
              <button className="btn btn-success me-2" type="button" onClick={addToCart} disabled={isOutOfStock}>
                {isOutOfStock ? 'Tạm hết hàng' : 'Thêm vào giỏ hàng'}
              </button>
            ) : user ? (
              <span className="btn btn-secondary me-2 disabled" role="button" aria-disabled="true">
                Chỉ khách hàng mới mua được
              </span>
            ) : (
              <Link
                className="btn btn-success me-2"
                to="/login"
                state={{ from: `/products/${id}` }}
              >
                Đăng nhập để mua
              </Link>
            )}
            <Link className="btn btn-outline-success" to="/products">
              Quay lại catalog
            </Link>
          </div>
        </div>
      </div>
      <ProductReviewPanel productId={id} />
    </main>
  );
}
