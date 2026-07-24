import { useEffect, useRef, useState } from 'react';

import { reviewService } from '../../services/reviewService.js';

function makeKey() {
  if (globalThis.crypto?.randomUUID) return `review-moderate-${globalThis.crypto.randomUUID()}`;
  return `review-moderate-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ReviewModerationPage() {
  const [reviews, setReviews] = useState([]);
  const [reviewPage, setReviewPage] = useState({ page: 1, pageSize: 20, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({ productId: '', publicationStatus: '', moderationStatus: '' });
  const [decisions, setDecisions] = useState({});
  const [pending, setPending] = useState({});
  const [error, setError] = useState('');
  const pendingKeys = useRef(new Set());

  async function loadModeration() {
    try {
      const result = await reviewService.listModeration({
        page,
        pageSize,
        productId: filters.productId,
        publicationStatus: filters.publicationStatus,
        moderationStatus: filters.moderationStatus,
      });
      setReviews(result?.items || []);
      setReviewPage(result || {});
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách chờ duyệt.');
    }
  }

  useEffect(() => {
    loadModeration();
  }, [page, pageSize, filters.productId, filters.publicationStatus, filters.moderationStatus]);

  async function submitModeration(event, review) {
    event.preventDefault();
    if (!review?.id) return;
    const key = review.id;
    if (pendingKeys.current.has(key)) return;
    pendingKeys.current.add(key);
    setPending((value) => ({ ...value, [key]: true }));
    const decision = decisions[key] || {
      moderationStatus: review.moderationStatus === 'HiddenByStaff' ? 'Allowed' : 'HiddenByStaff',
      reason: '',
    };
    setError('');
    try {
      const result = await reviewService.moderate(review.id, {
        moderationStatus: decision.moderationStatus,
        reason: decision.reason,
        expectedVersion: Number(review.version ?? 0),
      }, { idempotencyKey: makeKey() });
      setReviews((items) => items.map((item) => item.id === review.id ? (result || { ...item, ...decision }) : item));
    } catch (err) {
      setError(err.message || 'Không thể cập nhật kiểm duyệt.');
    } finally {
      pendingKeys.current.delete(key);
      setPending((value) => ({ ...value, [key]: false }));
    }
  }

  const totalPages = Math.max(1, Number(reviewPage.totalPages || 0));

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Staff moderation</span>
          <h1>Kiểm duyệt đánh giá</h1>
        </div>
        <span className="text-secondary">{Number(reviewPage.total || reviews.length)} đánh giá</span>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form className="row g-2 mb-3" aria-label="Bộ lọc kiểm duyệt">
        <div className="col-md-4">
          <label htmlFor="moderationProductId">Mã sản phẩm</label>
          <input
            id="moderationProductId"
            name="productId"
            value={filters.productId}
            onChange={(event) => { setFilters((value) => ({ ...value, productId: event.target.value })); setPage(1); }}
          />
        </div>
        <div className="col-md-4">
          <label htmlFor="moderationPublicationStatus">Publication</label>
          <select
            id="moderationPublicationStatus"
            name="publicationStatus"
            value={filters.publicationStatus}
            onChange={(event) => { setFilters((value) => ({ ...value, publicationStatus: event.target.value })); setPage(1); }}
          >
            <option value="">Tất cả publication</option>
            <option value="Published">Published</option>
            <option value="Withdrawn">Withdrawn</option>
          </select>
        </div>
        <div className="col-md-4">
          <label htmlFor="moderationState">Moderation</label>
          <select
            id="moderationState"
            name="moderationStatus"
            value={filters.moderationStatus}
            onChange={(event) => { setFilters((value) => ({ ...value, moderationStatus: event.target.value })); setPage(1); }}
          >
            <option value="">Tất cả quyết định</option>
            <option value="Allowed">Allowed</option>
            <option value="HiddenByStaff">HiddenByStaff</option>
          </select>
        </div>
      </form>
      <section className="surface" aria-live="polite">
        {reviews.map((review) => {
          const decision = decisions[review.id] || {
            moderationStatus: review.moderationStatus === 'HiddenByStaff' ? 'Allowed' : 'HiddenByStaff',
            reason: '',
          };
          return (
            <article className="border-bottom py-3" key={review.id}>
              <div className="d-flex justify-content-between">
                <strong>{review.rating}/5</strong>
                <span>{review.moderationStatus || 'Allowed'}</span>
              </div>
              <p>{review.content || 'Không có nội dung'}</p>
              <form data-review-id={review.id} onSubmit={(event) => submitModeration(event, review)}>
                <label htmlFor={`moderationStatus-${review.id}`}>Staff moderation</label>
                <select
                  id={`moderationStatus-${review.id}`}
                  name="moderationStatus"
                  value={decision.moderationStatus}
                  onChange={(event) => setDecisions((value) => ({ ...value, [review.id]: { ...decision, moderationStatus: event.target.value } }))}
                >
                  {review.moderationStatus !== 'Allowed' && <option value="Allowed">Allowed</option>}
                  {review.moderationStatus !== 'HiddenByStaff' && <option value="HiddenByStaff">HiddenByStaff</option>}
                </select>
                <label htmlFor={`reason-${review.id}`}>Reason</label>
                <textarea
                  id={`reason-${review.id}`}
                  name="reason"
                  value={decision.reason}
                  onChange={(event) => setDecisions((value) => ({ ...value, [review.id]: { ...decision, reason: event.target.value } }))}
                  maxLength={500}
                  required
                />
                <button type="submit" className="btn btn-primary" data-sl008-action="moderate" onClick={(event) => submitModeration(event, review)} disabled={Boolean(pending[review.id])}>
                  {pending[review.id] ? 'Đang lưu…' : 'Lưu quyết định'}
                </button>
              </form>
            </article>
          );
        })}
        {!reviews.length && <p className="text-secondary">Không có đánh giá chờ duyệt.</p>}
      </section>
      <div className="d-flex align-items-center gap-2 mt-3" aria-label="Phân trang kiểm duyệt">
        <label htmlFor="moderationPageSize">Hiển thị</label>
        <select
          id="moderationPageSize"
          name="pageSize"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
        >
          {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <span>Trang {page}/{totalPages}</span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Trước</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>Sau</button>
      </div>
    </div>
  );
}
