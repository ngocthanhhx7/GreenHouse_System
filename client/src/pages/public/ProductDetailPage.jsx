import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { cartService } from '../../services/cartService.js';
import { orderService } from '../../services/orderService.js';
import { productService } from '../../services/productService.js';
import { reviewService } from '../../services/reviewService.js';

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

  useEffect(() => {
    productService.getProduct(id).then(setProduct).catch((err) => setError(err.message));
    reviewService.listProductReviews(id).then(setReviews).catch((err) => setReviewError(err.message));
  }, [id]);

  useEffect(() => {
    if (user?.role !== 'Customer') return;
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

  async function submitReview(event) {
    event.preventDefault();
    setReviewError('');
    setMessage('');
    try {
      await reviewService.createCustomerReview(product.id, {
        orderId: reviewForm.orderId,
        rating: Number(reviewForm.rating),
        content: reviewForm.content,
      });
      setReviewForm({ orderId: '', rating: 5, content: '' });
      setMessage('Review submitted.');
      setReviews(await reviewService.listProductReviews(product.id));
    } catch (err) {
      setReviewError(err.message);
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
      <div className="surface mt-4">
        <div className="page-heading">
          <h2>Reviews</h2>
          <span className="text-secondary">
            {reviews.total || 0} reviews / {Number(reviews.averageRating || 0).toFixed(1)} average
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
          {!reviews.items?.length && <p className="text-secondary">No reviews yet.</p>}
        </div>
        {user?.role === 'Customer' && (
          <form className="row g-3" onSubmit={submitReview}>
            <div className="col-md-5">
              <label className="form-label" htmlFor="reviewOrderId">Delivered order</label>
              <select
                id="reviewOrderId"
                className="form-select"
                value={reviewForm.orderId}
                onChange={(event) => setReviewForm((current) => ({ ...current, orderId: event.target.value }))}
                required
              >
                <option value="">Select delivered order</option>
                {reviewableOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderCode}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label" htmlFor="reviewRating">Rating</label>
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
              <label className="form-label" htmlFor="reviewContent">Review</label>
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
              <button className="btn btn-success" type="submit">Submit review</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
