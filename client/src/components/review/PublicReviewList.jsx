import { useEffect, useState } from 'react';

import { reviewService } from '../../services/reviewService.js';

function readError(error) {
  if (!error) return '';
  return error.message || 'Không thể tải đánh giá sản phẩm.';
}

export default function PublicReviewList({ productId }) {
  const [reviewPage, setReviews] = useState({ items: [], total: 0, averageRating: 0, page: 1, pageSize: 20, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    reviewService.listPublic(productId, { page, pageSize })
      .then((result) => {
        if (current) setReviews(result || {});
      })
      .catch((err) => {
        if (current) setError(readError(err));
      });
    return () => { current = false; };
  }, [productId, page, pageSize]);

  const reviews = reviewPage.items || [];
  const averageRating = Number(reviewPage.averageRating || 0);
  const totalPages = Math.max(1, Number(reviewPage.totalPages || 0));
  const currentPage = Number(reviewPage.page || page || 1);

  return (
    <section className="review-public-list" aria-labelledby="public-review-heading">
      <div className="page-heading">
        <h3 id="public-review-heading">Đánh giá từ khách hàng</h3>
        <span className="text-secondary">
          {Number(reviewPage.total || 0)} đánh giá / {averageRating.toFixed(1)} điểm trung bình
        </span>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="review-list" aria-live="polite">
        {reviews.map((review) => (
          <article className="border-bottom py-3" key={review.id || `${review.createdAt}-${review.displayName}`}>
            <div className="d-flex justify-content-between gap-2">
              <strong>{review.displayName || 'Khách hàng ẩn danh'}</strong>
              <span aria-label={`Đánh giá ${review.rating} trên 5`}>{review.rating}/5</span>
            </div>
            {review.verifiedPurchase && <small className="text-success">Đã mua hàng</small>}
            {review.content && <p className="mb-1">{review.content}</p>}
            <small className="text-secondary">
              {review.updatedAt && review.updatedAt !== review.createdAt ? 'Cập nhật ' : ''}
              {review.updatedAt || review.createdAt || ''}
            </small>
          </article>
        ))}
        {!reviews.length && <p className="text-secondary">Chưa có đánh giá nào.</p>}
      </div>
      <div className="review-pagination d-flex align-items-center gap-2 mt-3" aria-label="Phân trang đánh giá">
        <label htmlFor="publicReviewPageSize">Hiển thị</label>
        <select
          id="publicReviewPageSize"
          name="pageSize"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
        >
          {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <span>trang {currentPage}/{totalPages}</span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}>Trước</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages}>Sau</button>
      </div>
    </section>
  );
}
