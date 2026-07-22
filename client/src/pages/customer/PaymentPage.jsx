import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { paymentService } from '../../services/paymentService.js';
import { formatCurrency, translatePaymentStatus } from '../../utils/formatters.js';

export default function PaymentPage() {
  const { id } = useParams();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    paymentService.createOnlinePayment(id).then(setPayment).catch((err) => setError(err.message));
  }, [id]);

  return (
    <div className="surface">
      <h1>Thanh toán online</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      {!payment ? (
        <p className="text-secondary">Đang chuẩn bị yêu cầu thanh toán...</p>
      ) : (
        <div className="payment-panel">
          <p>Đơn hàng: <strong>{payment.orderCode}</strong></p>
          <p>Số tiền: <strong>{formatCurrency(payment.amount)}</strong></p>
          <p>Cổng thanh toán: <strong>payOS</strong></p>
          <p>Trạng thái: {translatePaymentStatus(payment.paymentStatus)}</p>
          <div className="d-flex gap-2">
            <a className="btn btn-success" href={payment.checkoutUrl}>
              Thanh toán qua payOS
            </a>
            <Link className="btn btn-outline-secondary" to={`/orders/${id}`}>
              Quay lại đơn hàng
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
