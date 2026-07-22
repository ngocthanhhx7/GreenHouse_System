import { Link, useParams, useSearchParams } from 'react-router-dom';

import { translatePaymentStatus } from '../../utils/formatters.js';

function normalizePayOSStatus(value) {
  const status = String(value || '').toUpperCase();
  if (status === 'PAID') return 'Paid';
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'FAILED') return 'Failed';
  return 'Pending';
}

export default function PaymentResultPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const status = normalizePayOSStatus(params.get('status'));
  const success = status === 'Paid';

  return (
    <div className="surface">
      <h1>Kết quả thanh toán</h1>
      <div className={`alert ${success ? 'alert-success' : 'alert-warning'}`}>
        Trạng thái trả về từ payOS: <strong>{translatePaymentStatus(status)}</strong>
      </div>
      <p className="text-secondary">Trạng thái chính thức của đơn hàng được cập nhật qua webhook payOS.</p>
      <Link className="btn btn-success" to={`/orders/${id}`}>
        Xem đơn hàng
      </Link>
    </div>
  );
}
