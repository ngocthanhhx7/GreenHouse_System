import { Link, useParams, useSearchParams } from 'react-router-dom';

import { translatePaymentStatus } from '../../utils/formatters.js';

export default function PaymentResultPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const status = params.get('status') || 'Unknown';
  const success = status === 'Paid';

  return (
    <div className="surface">
      <h1>Kết quả thanh toán</h1>
      <div className={`alert ${success ? 'alert-success' : 'alert-warning'}`}>
        Trạng thái thanh toán: <strong>{translatePaymentStatus(status)}</strong>
      </div>
      <Link className="btn btn-success" to={`/orders/${id}`}>
        Xem đơn hàng
      </Link>
    </div>
  );
}
