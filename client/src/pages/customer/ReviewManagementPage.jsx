import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { resolveMediaUrl } from '../../services/apiClient.js';
import { orderService } from '../../services/orderService.js';
import { reviewService } from '../../services/reviewService.js';
import { buildReviewWorkspace, loadAllOwnReviews } from './reviewWorkspace.js';
import '../../styles/modules/customer-reviews.css';

function commandKey(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorText(error, fallback = 'Không thể thực hiện thao tác đánh giá.') {
  return error?.message || fallback;
}

function errorFields(error) {
  return Object.fromEntries(
    (error?.errors || []).filter((item) => item?.field).map((item) => [item.field, item.message]),
  );
}

function publicationLabel(review) {
  if (review.moderationStatus === 'HiddenByStaff') return 'Đang được ẩn để kiểm tra';
  return review.publicationStatus === 'Withdrawn' ? 'Bạn đã ẩn đánh giá' : 'Đang hiển thị công khai';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

function StarInput({ value, onChange, name }) {
  return (
    <div className="review-star-input" role="radiogroup" aria-label="Chọn số sao">
      {[1, 2, 3, 4, 5].map((rating) => (
        <label key={rating} className={rating <= value ? 'selected' : ''}>
          <input
            type="radio"
            name={name}
            value={rating}
            checked={value === rating}
            onChange={() => onChange(rating)}
            aria-label={`${rating} sao`}
          />
          <span aria-hidden="true">★</span>
        </label>
      ))}
    </div>
  );
}

export default function ReviewManagementPage() {
  const [searchParams] = useSearchParams();
  const preferredOrderId = searchParams.get('orderId') || '';
  const [activeTab, setActiveTab] = useState('pending');
  const [workspace, setWorkspace] = useState({ pending: [], completed: [] });
  const [forms, setForms] = useState({});
  const [editForms, setEditForms] = useState({});
  const [pending, setPending] = useState({});
  const [errors, setErrors] = useState({});
  const [pageError, setPageError] = useState('');
  const [loading, setLoading] = useState(true);
  const pendingKeys = useRef(new Set());

  const loadWorkspace = useCallback(async () => {
    setPageError('');
    const summaries = await orderService.listMyOrders();
    const orders = Array.isArray(summaries) ? summaries : summaries?.items || summaries?.orders || [];
    const detailedOrders = await Promise.all(orders.map(async (order) => {
      if (Array.isArray(order.details) && order.details.length) return order;
      const id = order.id || order._id;
      if (!id) return { ...order, details: [] };
      try {
        return await orderService.getOrder(id);
      } catch (_error) {
        return { ...order, details: [] };
      }
    }));
    const ownReviews = await loadAllOwnReviews((query) => reviewService.listOwn(query));
    const next = buildReviewWorkspace(detailedOrders, ownReviews);
    if (preferredOrderId) {
      next.pending.sort((left, right) => (
        Number(String(right.orderId) === preferredOrderId)
        - Number(String(left.orderId) === preferredOrderId)
      ));
    }
    setWorkspace(next);
  }, [preferredOrderId]);

  useEffect(() => {
    let current = true;
    loadWorkspace()
      .catch((error) => {
        if (current) setPageError(errorText(error, 'Không thể tải danh sách đánh giá của bạn.'));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [loadWorkspace]);

  function begin(key) {
    if (pendingKeys.current.has(key)) return false;
    pendingKeys.current.add(key);
    setPending((current) => ({ ...current, [key]: true }));
    return true;
  }

  function finish(key) {
    pendingKeys.current.delete(key);
    setPending((current) => ({ ...current, [key]: false }));
  }

  async function refreshAfterFailure(error) {
    try {
      await loadWorkspace();
    } catch (_refreshError) {
      // A refresh failure must not replace the actionable mutation error.
    }
    setPageError(errorText(error));
  }

  async function submitCreate(event, item) {
    event.preventDefault();
    const key = `createReview:${item.orderDetailId}`;
    if (!begin(key)) return;
    const form = forms[item.orderDetailId] || { rating: 5, content: '' };
    setErrors((current) => ({ ...current, [key]: {} }));
    try {
      await reviewService.createReview(item.productId, {
        orderDetailId: item.orderDetailId,
        rating: Number(form.rating),
        content: form.content || undefined,
        expectedVersion: 0,
      }, { idempotencyKey: commandKey('review-create') });
      await loadWorkspace();
      setActiveTab('completed');
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: errorFields(error) }));
      await refreshAfterFailure(error);
    } finally {
      finish(key);
    }
  }

  async function submitUpdate(event, review) {
    event.preventDefault();
    const key = `review:${review.id}`;
    if (!begin(key)) return;
    const form = editForms[review.id] || { rating: review.rating, content: review.content || '' };
    setErrors((current) => ({ ...current, [key]: {} }));
    try {
      await reviewService.updateReview(review.id, {
        rating: Number(form.rating),
        content: form.content || undefined,
        expectedVersion: Number(review.version),
      }, { idempotencyKey: commandKey('review-update') });
      await loadWorkspace();
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: errorFields(error) }));
      await refreshAfterFailure(error);
    } finally {
      finish(key);
    }
  }

  async function setPublication(review, publicationStatus) {
    const key = `review:${review.id}`;
    if (!begin(key)) return;
    try {
      await reviewService.setPublication(review.id, {
        publicationStatus,
        expectedVersion: Number(review.version),
      }, { idempotencyKey: commandKey('review-publication') });
      await loadWorkspace();
    } catch (error) {
      await refreshAfterFailure(error);
    } finally {
      finish(key);
    }
  }

  const items = activeTab === 'pending' ? workspace.pending : workspace.completed;

  return (
    <div className="customer-review-center">
      <div className="page-heading customer-review-heading">
        <div>
          <span className="eyebrow">Đơn mua đã hoàn thành</span>
          <h1>Đánh giá của tôi</h1>
          <p>Chia sẻ trải nghiệm riêng cho từng sản phẩm bạn đã nhận.</p>
        </div>
        <Link className="btn btn-outline-success" to="/orders">Xem đơn hàng</Link>
      </div>

      <nav className="review-tabs" aria-label="Trạng thái đánh giá">
        <button type="button" className={activeTab === 'pending' ? 'active' : ''} onClick={() => setActiveTab('pending')}>
          Chờ đánh giá <span>{workspace.pending.length}</span>
        </button>
        <button type="button" className={activeTab === 'completed' ? 'active' : ''} onClick={() => setActiveTab('completed')}>
          Đã đánh giá <span>{workspace.completed.length}</span>
        </button>
      </nav>

      {loading && <div className="review-state-card" role="status">Đang tải danh sách đánh giá…</div>}
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}

      {!loading && (
        <div className="review-purchase-list" aria-live="polite">
          {activeTab === 'pending' && items.map((item) => {
            const form = forms[item.orderDetailId] || { rating: 5, content: '' };
            const key = `createReview:${item.orderDetailId}`;
            const fieldErrors = errors[key] || {};
            return (
              <article className="review-purchase-card" key={item.orderDetailId}>
                <div className="review-product-summary">
                  <div className="review-product-image">
                    {item.productImage ? <img src={resolveMediaUrl(item.productImage)} alt="" /> : <span>GH</span>}
                  </div>
                  <div>
                    <span>{item.orderCode}{item.deliveredAt ? ` · Đã giao ${formatDate(item.deliveredAt)}` : ''}</span>
                    <h2>{item.productName}</h2>
                    <small>SKU: {item.sku || 'Chưa cập nhật'}</small>
                  </div>
                </div>
                <form className="review-editor" onSubmit={(event) => submitCreate(event, item)}>
                  <label>Chất lượng sản phẩm</label>
                  <StarInput
                    name={`rating-${item.orderDetailId}`}
                    value={form.rating}
                    onChange={(rating) => setForms((current) => ({
                      ...current,
                      [item.orderDetailId]: { ...form, rating },
                    }))}
                  />
                  {fieldErrors.rating && <small className="text-danger">{fieldErrors.rating}</small>}
                  <label htmlFor={`content-${item.orderDetailId}`}>Nội dung đánh giá</label>
                  <textarea
                    id={`content-${item.orderDetailId}`}
                    maxLength={1000}
                    rows={4}
                    value={form.content}
                    placeholder="Sản phẩm có đúng mô tả và hữu ích với căn bếp của bạn không?"
                    onChange={(event) => setForms((current) => ({
                      ...current,
                      [item.orderDetailId]: { ...form, content: event.target.value.slice(0, 1000) },
                    }))}
                  />
                  <div className="review-editor-footer">
                    <small>{form.content.length} / 1000</small>
                    <button className="btn btn-success" type="submit" data-sl008-action="createReview" disabled={Boolean(pending[key])}>
                      {pending[key] ? 'Đang gửi…' : 'Gửi đánh giá'}
                    </button>
                  </div>
                  {fieldErrors.content && <small className="text-danger">{fieldErrors.content}</small>}
                  {fieldErrors.orderDetailId && <small className="text-danger">{fieldErrors.orderDetailId}</small>}
                </form>
              </article>
            );
          })}

          {activeTab === 'completed' && items.map((review) => {
            const edit = editForms[review.id] || { rating: review.rating, content: review.content || '' };
            const reviewPending = Boolean(pending[`review:${review.id}`]);
            return (
              <article className="review-purchase-card" key={review.id}>
                <div className="review-product-summary">
                  <div className="review-product-image">
                    {review.productImage ? <img src={resolveMediaUrl(review.productImage)} alt="" /> : <span>GH</span>}
                  </div>
                  <div>
                    <span>{review.orderCode || 'Đơn mua GreenHome'}</span>
                    <h2>{review.productName}</h2>
                    <small>{publicationLabel(review)}</small>
                  </div>
                </div>
                <form className="review-editor" onSubmit={(event) => submitUpdate(event, review)}>
                  <label>Điểm đánh giá</label>
                  <StarInput
                    name={`edit-rating-${review.id}`}
                    value={edit.rating}
                    onChange={(rating) => setEditForms((current) => ({
                      ...current,
                      [review.id]: { ...edit, rating },
                    }))}
                  />
                  <label htmlFor={`edit-content-${review.id}`}>Nội dung</label>
                  <textarea
                    id={`edit-content-${review.id}`}
                    maxLength={1000}
                    rows={4}
                    value={edit.content}
                    onChange={(event) => setEditForms((current) => ({
                      ...current,
                      [review.id]: { ...edit, content: event.target.value.slice(0, 1000) },
                    }))}
                  />
                  <div className="review-editor-footer">
                    <small>{edit.content.length} / 1000</small>
                    <div>
                      {review.publicationStatus === 'Published' ? (
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          data-sl008-action="setPublication:Withdrawn"
                          disabled={reviewPending}
                          onClick={() => setPublication(review, 'Withdrawn')}
                        >
                          Ẩn đánh giá
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          data-sl008-action="setPublication:Published"
                          disabled={reviewPending}
                          onClick={() => setPublication(review, 'Published')}
                        >
                          Hiển thị lại
                        </button>
                      )}
                      <button type="submit" className="btn btn-outline-success btn-sm" data-sl008-action="updateReview" disabled={reviewPending}>
                        {reviewPending ? 'Đang lưu…' : 'Lưu thay đổi'}
                      </button>
                    </div>
                  </div>
                </form>
              </article>
            );
          })}

          {!items.length && (
            <div className="review-state-card">
              <strong>{activeTab === 'pending' ? 'Không có sản phẩm chờ đánh giá.' : 'Bạn chưa gửi đánh giá nào.'}</strong>
              <p>{activeTab === 'pending' ? 'Sản phẩm sẽ xuất hiện sau khi đơn hàng được giao thành công.' : 'Hãy đánh giá sản phẩm trong các đơn đã hoàn thành.'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
