import { useEffect, useRef, useState } from 'react';

import useAuth from '../../hooks/useAuth.js';
import { reviewService } from '../../services/reviewService.js';
import PublicReviewList from './PublicReviewList.jsx';

function makeKey(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorText(error) {
  if (!error) return '';
  return error.message || 'Không thể thực hiện thao tác đánh giá.';
}

function fieldErrors(error) {
  const result = {};
  (error?.errors || []).forEach((item) => {
    if (item?.field) result[item.field] = item.message || errorText(error);
  });
  return result;
}

export default function ProductReviewPanel({ productId }) {
  const { user } = useAuth();
  const [eligibleOrderDetails, setEligibleOrderDetails] = useState([]);
  const [reviewForm, setReviewForm] = useState({ orderDetailId: '', rating: 5, content: '' });
  const [ownReviews, setOwnReviews] = useState([]);
  const [editForms, setEditForms] = useState({});
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [pending, setPending] = useState({});
  const pendingKeys = useRef(new Set());

  useEffect(() => {
    let current = true;
    if (user?.role !== 'Customer') return undefined;
    Promise.all([
      reviewService.listEligibility(productId),
      reviewService.listOwn({ page: 1, pageSize: 20, productId }),
    ]).then(([eligibility, own]) => {
      if (!current) return;
      const items = eligibility?.items || eligibility?.eligibleOrderDetails || [];
      setEligibleOrderDetails(items);
      setReviewForm((value) => ({ ...value, orderDetailId: value.orderDetailId || items[0]?.orderDetailId || items[0]?.id || '' }));
      setOwnReviews(own?.items || []);
    }).catch((err) => {
      if (current) setError(errorText(err));
    });
    return () => { current = false; };
  }, [productId, user?.role]);

  function begin(action) {
    if (pendingKeys.current.has(action)) return false;
    pendingKeys.current.add(action);
    setPending((value) => ({ ...value, [action]: true }));
    return true;
  }

  function finish(action) {
    pendingKeys.current.delete(action);
    setPending((value) => ({ ...value, [action]: false }));
  }

  async function submitReview(event) {
    event.preventDefault();
    const action = 'createReview';
    if (!begin(action)) return;
    setError('');
    setFormErrors({});
    try {
      await reviewService.createReview(productId, {
        orderDetailId: reviewForm.orderDetailId || undefined,
        rating: Number(reviewForm.rating),
        content: reviewForm.content || undefined,
        expectedVersion: 0,
      }, { idempotencyKey: makeKey('review-create') });
      setReviewForm({ orderDetailId: '', rating: 5, content: '' });
      const own = await reviewService.listOwn({ page: 1, pageSize: 20, productId });
      setOwnReviews(own?.items || []);
    } catch (err) {
      setError(errorText(err));
      setFormErrors(fieldErrors(err));
    } finally {
      finish(action);
    }
  }

  async function submitUpdate(event, review) {
    event.preventDefault();
    if (!review?.id) return;
    const action = `updateReview:${review.id}`;
    if (!begin(action)) return;
    const form = editForms[review.id] || { rating: review.rating, content: review.content || '' };
    setError('');
    setFormErrors({});
    try {
      const result = await reviewService.updateReview(review.id, {
        rating: Number(form.rating),
        content: form.content || undefined,
        expectedVersion: Number(review.version ?? 0),
      }, { idempotencyKey: makeKey('review-update') });
      setOwnReviews((items) => items.map((item) => item.id === review.id ? (result || { ...item, ...form }) : item));
    } catch (err) {
      setError(errorText(err));
      setFormErrors(fieldErrors(err));
    } finally {
      finish(action);
    }
  }

  async function withdrawReview(review) {
    if (!review?.id) return;
    const action = 'setPublication:Withdrawn';
    if (!begin(action)) return;
    setError('');
    try {
      const result = await reviewService.setPublication(review.id, {
        publicationStatus: 'Withdrawn',
        expectedVersion: Number(review.version ?? 0),
      }, { idempotencyKey: makeKey('review-withdraw') });
      setOwnReviews((items) => items.map((item) => item.id === review.id ? (result || { ...item, publicationStatus: 'Withdrawn' }) : item));
    } catch (err) {
      setError(errorText(err));
    } finally {
      finish(action);
    }
  }

  async function republishReview(review) {
    if (!review?.id) return;
    const action = 'setPublication:Published';
    if (!begin(action)) return;
    setError('');
    try {
      const result = await reviewService.setPublication(review.id, {
        publicationStatus: 'Published',
        expectedVersion: Number(review.version ?? 0),
      }, { idempotencyKey: makeKey('review-republish') });
      setOwnReviews((items) => items.map((item) => item.id === review.id ? (result || { ...item, publicationStatus: 'Published' }) : item));
    } catch (err) {
      setError(errorText(err));
    } finally {
      finish(action);
    }
  }

  const hasOwnReview = ownReviews.some(
    (review) => String(review.productId || '') === String(productId),
  );

  return (
    <div className="product-review-panel mt-4">
      <PublicReviewList productId={productId} />
      {user?.role !== 'Customer' ? null : hasOwnReview ? null : (
        <section className="surface mt-4" aria-labelledby="write-review-heading">
          <h3 id="write-review-heading">Viết đánh giá</h3>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <form className="row g-3" onSubmit={submitReview}>
            <div className="col-md-6">
              <label className="form-label" htmlFor="orderDetailId">Sản phẩm trong đơn đã giao</label>
              <select
                id="orderDetailId"
                name="orderDetailId"
                className="form-select"
                value={reviewForm.orderDetailId}
                onChange={(event) => setReviewForm((value) => ({ ...value, orderDetailId: event.target.value }))}
              >
                <option value="">Chọn sản phẩm (không bắt buộc)</option>
                {eligibleOrderDetails.map((eligibleOrderDetail) => (
                  <option key={eligibleOrderDetail.orderDetailId || eligibleOrderDetail.id} value={eligibleOrderDetail.orderDetailId || eligibleOrderDetail.id}>
                    {eligibleOrderDetail.orderCode || 'Đơn đã giao'}{eligibleOrderDetail.productName ? ` · ${eligibleOrderDetail.productName}` : ''}
                  </option>
                ))}
              </select>
              {formErrors.orderDetailId && <div className="text-danger small">{formErrors.orderDetailId}</div>}
            </div>
            <div className="col-md-3">
              <label className="form-label" htmlFor="rating">Điểm đánh giá</label>
              <select
                id="rating"
                name="rating"
                className="form-select"
                value={reviewForm.rating}
                onChange={(event) => setReviewForm((value) => ({ ...value, rating: Number(event.target.value) }))}
              >
                {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}
              </select>
              {formErrors.rating && <div className="text-danger small">{formErrors.rating}</div>}
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="content">Nội dung đánh giá (không bắt buộc)</label>
              <textarea
                id="content"
                name="content"
                className="form-control"
                rows="3"
                maxLength={1000}
                value={reviewForm.content}
                onChange={(event) => setReviewForm((value) => ({ ...value, content: event.target.value.slice(0, 1000) }))}
              />
              <small className="text-secondary">{reviewForm.content.length} / 1000</small>
              {formErrors.content && <div className="text-danger small">{formErrors.content}</div>}
            </div>
            <div className="col-12">
              <button className="btn btn-success" type="submit" data-sl008-action="createReview" onClick={submitReview} disabled={Boolean(pending.createReview)}>
                {pending.createReview ? 'Đang gửi…' : 'Gửi đánh giá'}
              </button>
            </div>
          </form>
        </section>
      )}

      {user?.role === 'Customer' && (
        <section className="surface mt-4" aria-labelledby="own-review-heading">
          <h3 id="own-review-heading">Đánh giá của bạn</h3>
          {ownReviews.map((review) => {
            const edit = editForms[review.id] || { rating: review.rating, content: review.content || '' };
            return (
              <article className="border-bottom py-3" key={review.id}>
                <div className="d-flex justify-content-between">
                  <strong>{review.rating}/5</strong>
                  <span className="small">Phiên bản {review.version ?? 0}</span>
                </div>
                <p className="mb-1">{review.content || 'Không có nội dung'}</p>
                <p className="small mb-2">
                  Customer publication: {review.publicationStatus || 'Published'} · Staff moderation: {review.moderationStatus || 'Allowed'}
                </p>
                <p className="small text-secondary">
                  Lịch sử: {review.historySummary?.contentEntries ?? 0} nội dung, {review.historySummary?.publicationEntries ?? 0} publication, {review.historySummary?.moderationEntries ?? 0} moderation
                </p>
                <form data-review-id={review.id} onSubmit={(event) => submitUpdate(event, review)}>
                  <label className="visually-hidden" htmlFor={`edit-rating-${review.id}`}>Điểm đánh giá</label>
                  <select
                    id={`edit-rating-${review.id}`}
                    value={edit.rating}
                    onChange={(event) => setEditForms((value) => ({ ...value, [review.id]: { ...edit, rating: Number(event.target.value) } }))}
                  >
                    {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}
                  </select>
                  <label className="visually-hidden" htmlFor={`edit-content-${review.id}`}>Nội dung</label>
                  <textarea
                    id={`edit-content-${review.id}`}
                    maxLength={1000}
                    value={edit.content}
                    onChange={(event) => setEditForms((value) => ({ ...value, [review.id]: { ...edit, content: event.target.value.slice(0, 1000) } }))}
                  />
                  <button type="submit" className="btn btn-outline-success btn-sm" data-sl008-action="updateReview" onClick={(event) => submitUpdate(event, review)} disabled={Boolean(pending[`updateReview:${review.id}`])}>Cập nhật</button>
                </form>
                <div className="d-flex gap-2 mt-2">
                  {review.publicationStatus === 'Published' ? (
                    <button type="button" className="btn btn-outline-secondary btn-sm" data-review-id={review.id} data-sl008-action="setPublication:Withdrawn" onClick={() => withdrawReview(review)} disabled={Boolean(pending['setPublication:Withdrawn'])}>
                      Rút publication
                    </button>
                  ) : review.publicationStatus === 'Withdrawn' ? (
                    <button type="button" className="btn btn-outline-secondary btn-sm" data-review-id={review.id} data-sl008-action="setPublication:Published" onClick={() => republishReview(review)} disabled={Boolean(pending['setPublication:Published'])}>
                      Đăng lại publication
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!ownReviews.length && <p className="text-secondary">Bạn chưa có đánh giá nào.</p>}
        </section>
      )}
    </div>
  );
}
