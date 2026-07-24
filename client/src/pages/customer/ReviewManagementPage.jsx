import { useEffect, useState } from 'react';

import { reviewService } from '../../services/reviewService.js';

export default function ReviewManagementPage() {
  const [ownReviews, setOwnReviews] = useState([]);
  const [ownReviewPage, setOwnReviewPage] = useState({ page: 1, pageSize: 20, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState('');

  async function loadOwn() {
    try {
      const result = await reviewService.listOwn({ page, pageSize });
      setOwnReviews(result?.items || []);
      setOwnReviewPage(result || {});
    } catch (err) {
      setError(err.message || 'Không thể tải đánh giá của bạn.');
    }
  }

  async function refreshOwnReviews() {
    return reviewService.listOwn({ page, pageSize });
  }

  useEffect(() => {
    loadOwn();
  }, [page, pageSize]);

  const totalPages = Math.max(1, Number(ownReviewPage.totalPages || 0));

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Tài khoản</span>
          <h1>Quản lý đánh giá</h1>
        </div>
        <span className="text-secondary">{Number(ownReviewPage.total || ownReviews.length)} đánh giá</span>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <section className="surface" aria-live="polite">
        {ownReviews.map((review) => (
          <article className="border-bottom py-3" key={review.id}>
            <div className="d-flex justify-content-between">
              <strong>{review.rating}/5</strong>
              <span className="small">Phiên bản {review.version ?? 0}</span>
            </div>
            <p>{review.content || 'Không có nội dung'}</p>
            <dl className="small mb-0">
              <dt>Customer publication</dt>
              <dd>{review.publicationStatus}</dd>
              <dt>Staff moderation</dt>
              <dd>{review.moderationStatus}</dd>
              <dt>Lịch sử</dt>
              <dd>
                {review.historySummary?.contentEntries ?? 0} nội dung · {review.historySummary?.publicationEntries ?? 0} publication · {review.historySummary?.moderationEntries ?? 0} moderation
              </dd>
            </dl>
          </article>
        ))}
        {!ownReviews.length && <p className="text-secondary">Bạn chưa có đánh giá nào.</p>}
      </section>
      <div className="d-flex align-items-center gap-2 mt-3" aria-label="Phân trang đánh giá của bạn">
        <label htmlFor="ownReviewPageSize">Hiển thị</label>
        <select
          id="ownReviewPageSize"
          name="pageSize"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
        >
          {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <span className="text-secondary">Trang {page}/{totalPages}</span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Trước</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>Sau</button>
      </div>
    </div>
  );
}
