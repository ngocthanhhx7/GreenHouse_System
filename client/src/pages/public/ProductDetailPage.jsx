import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { cartService } from '../../services/cartService.js';
import { resolveMediaUrl } from '../../services/apiClient.js';
import { orderService } from '../../services/orderService.js';
import { productService } from '../../services/productService.js';
import { reviewService } from '../../services/reviewService.js';
import { formatProductCurrency, formatProductSku } from '../../utils/formatters.js';

export default function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState({ items: [], total: 0, averageRating: 0 });
  const [reviewableOrders, setReviewableOrders] = useState([]);
  const [reviewForm, setReviewForm] = useState({ orderId: '', rating: 5, content: '' });
  const [reviewError, setReviewError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    productService.getProduct(id).then(setProduct).catch((err) => setError(err.message));
    reviewService.listProductReviews(id).then(setReviews).catch((err) => setReviewError(err.message));
  }, [id]);

  useEffect(() => {
    setActiveImageIndex(0);
    setImageError(false);
  }, [product?.id]);

  useEffect(() => {
    if (user?.role !== 'Customer') return undefined;
    let isCurrent = true;

    async function loadReviewableOrders() {
      try {
        const orders = await orderService.listMyOrders();
        const deliveredOrders = orders.filter((order) => order.orderStatus === 'Delivered');
        const detailedOrders = await Promise.all(deliveredOrders.map((order) => orderService.getOrder(order.id)));
        const options = reviewService.filterReviewableOrders(detailedOrders, id);
        if (!isCurrent) return;
        setReviewableOrders(options);
        setReviewForm((current) => ({ ...current, orderId: current.orderId || options[0]?.id || '' }));
      } catch (err) {
        if (isCurrent) setReviewError(err.message);
      }
    }

    loadReviewableOrders();
    return () => {
      isCurrent = false;
    };
  }, [id, user?.role]);

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

  async function addToCart() {
    setError('');
    setMessage('');
    try {
      await cartService.addItem({ productId: product.id || product._id, quantity: 1 });
      setMessage('Đã thêm sản phẩm vào giỏ hàng.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitReview(event) {
    event.preventDefault();
    setReviewError('');
    setMessage('');
    try {
      await reviewService.createCustomerReview(product.id || product._id, {
        orderId: reviewForm.orderId,
        rating: Number(reviewForm.rating),
        content: reviewForm.content,
      });
      setReviewForm({ orderId: '', rating: 5, content: '' });
      setMessage('Cảm ơn bạn đã gửi đánh giá.');
      setReviews(await reviewService.listProductReviews(product.id || product._id));
    } catch (err) {
      setReviewError(err.message);
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
          <p className="stock-note">Tồn kho: {Number(product.stockQuantity || 0)} {product.unit || 'sản phẩm'}</p>
          {message && <div className="alert alert-success mt-3">{message}</div>}
          <div className="mt-4">
            {user?.role === 'Customer' ? (
              <button className="btn btn-success me-2" type="button" onClick={addToCart}>
                Thêm vào giỏ hàng
              </button>
            ) : (
              <Link className="btn btn-success me-2" to="/login">
                Đăng nhập để mua
              </Link>
            )}
            <Link className="btn btn-outline-success" to="/products">
              Quay lại catalog
            </Link>
          </div>
        </div>
      </div>
      <div className="surface mt-4">
        <div className="page-heading">
          <h2>Đánh giá sản phẩm</h2>
          <span className="text-secondary">
            {reviews.total || 0} đánh giá / {Number(reviews.averageRating || 0).toFixed(1)} điểm trung bình
          </span>
        </div>
        {reviewError && <div className="alert alert-danger">{reviewError}</div>}
        <div className="mb-4">
          {(reviews.items || []).map((review) => (
            <div className="border-bottom py-2" key={review.id}>
              <strong>{review.rating}/5</strong>
              <p className="mb-0">{review.content}</p>
            </div>
          ))}
          {!reviews.items?.length && <p className="text-secondary">Chưa có đánh giá nào.</p>}
        </div>
        {user?.role === 'Customer' && (
          <form className="row g-3" onSubmit={submitReview}>
            <div className="col-md-5">
              <label className="form-label" htmlFor="reviewOrderId">Đơn hàng đã giao</label>
              <select
                id="reviewOrderId"
                className="form-select"
                value={reviewForm.orderId}
                onChange={(event) => setReviewForm((current) => ({ ...current, orderId: event.target.value }))}
                required
              >
                <option value="">Chọn đơn hàng</option>
                {reviewableOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderCode}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label" htmlFor="reviewRating">Điểm đánh giá</label>
              <select
                id="reviewRating"
                className="form-select"
                value={reviewForm.rating}
                onChange={(event) => setReviewForm((current) => ({ ...current, rating: event.target.value }))}
              >
                {[5, 4, 3, 2, 1].map((rating) => (
                  <option key={rating} value={rating}>{rating}</option>
                ))}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="reviewContent">Nội dung đánh giá</label>
              <textarea
                id="reviewContent"
                className="form-control"
                rows="3"
                value={reviewForm.content}
                onChange={(event) => setReviewForm((current) => ({ ...current, content: event.target.value }))}
                required
              />
            </div>
            <div className="col-12">
              <button className="btn btn-success" type="submit">Gửi đánh giá</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
