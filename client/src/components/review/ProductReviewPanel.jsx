import PublicReviewList from './PublicReviewList.jsx';

export default function ProductReviewPanel({ productId }) {
  return (
    <div className="product-review-panel mt-4">
      <PublicReviewList productId={productId} />
    </div>
  );
}
