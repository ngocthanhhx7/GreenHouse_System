import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { paymentService } from '../../services/paymentService.js';
import { formatCurrency, translatePaymentStatus } from '../../utils/formatters.js';

export default function PaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    paymentService.createOnlinePayment(id).then(setPayment).catch((err) => setError(err.message));
  }, [id]);

  async function submitStatus(status) {
    setError('');
    try {
      const result = await paymentService.submitMockCallback({
        orderId: id,
        paymentAttemptId: payment.attemptId,
        transactionId: `MOCK-${Date.now()}`,
        providerMessageId: `MOCK-${Date.now()}`,
        amount: payment.amount,
        status,
      });
      navigate(`/payments/result/${id}?status=${result.paymentStatus}`, { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

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
          <p>Trạng thái: {translatePaymentStatus(payment.paymentStatus)}</p>
          <div className="d-flex gap-2">
            <button className="btn btn-success" type="button" onClick={() => submitStatus('Paid')}>
              Mô phỏng thanh toán thành công
            </button>
            <button className="btn btn-outline-danger" type="button" onClick={() => submitStatus('Failed')}>
              Mô phỏng thanh toán thất bại
            </button>
            <Link className="btn btn-outline-secondary" to={`/orders/${id}`}>
              Quay lại đơn hàng
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
