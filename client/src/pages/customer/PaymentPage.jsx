import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { paymentService } from '../../services/paymentService.js';

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
        transactionId: `MOCK-${Date.now()}`,
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
      <h1>Online Payment</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      {!payment ? (
        <p className="text-secondary">Preparing payment request...</p>
      ) : (
        <div className="payment-panel">
          <p>Order: <strong>{payment.orderCode}</strong></p>
          <p>Amount: <strong>${Number(payment.amount).toFixed(2)}</strong></p>
          <p>Status: {payment.paymentStatus}</p>
          <div className="d-flex gap-2">
            <button className="btn btn-success" type="button" onClick={() => submitStatus('Paid')}>
              Simulate Paid
            </button>
            <button className="btn btn-outline-danger" type="button" onClick={() => submitStatus('Failed')}>
              Simulate Failed
            </button>
            <Link className="btn btn-outline-secondary" to={`/orders/${id}`}>
              Back to order
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
