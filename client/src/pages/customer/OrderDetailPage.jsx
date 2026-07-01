import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { orderService } from '../../services/orderService.js';
import { returnRefundService } from '../../services/returnRefundService.js';

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [returnReason, setReturnReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadOrder() {
    setError('');
    try {
      setOrder(await orderService.getOrder(id));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cancelOrder() {
    try {
      setOrder(await orderService.cancelOrder(id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function requestReturnRefund(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await returnRefundService.createCustomerRequest(id, { reason: returnReason });
      setReturnReason('');
      setMessage('Return/refund request submitted.');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!order && !error) return <div className="page-center">Loading...</div>;

  return (
    <div className="surface">
      <h1>Order Detail</h1>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {order && (
        <>
          <dl className="row">
            <dt className="col-sm-3">Order code</dt>
            <dd className="col-sm-9">{order.orderCode}</dd>
            <dt className="col-sm-3">Status</dt>
            <dd className="col-sm-9">{order.orderStatus}</dd>
            <dt className="col-sm-3">Payment</dt>
            <dd className="col-sm-9">{order.paymentMethod} / {order.paymentStatus}</dd>
            <dt className="col-sm-3">Shipping</dt>
            <dd className="col-sm-9">{order.shippingAddress}</dd>
          </dl>
          <h2>Items</h2>
          <ul>
            {(order.details || []).map((item) => (
              <li key={item._id || item.productId}>
                {item.productNameSnapshot} x {item.quantity} - ${Number(item.subtotal).toFixed(2)}
              </li>
            ))}
          </ul>
          <strong>Total: ${Number(order.totalAmount).toFixed(2)}</strong>
          {order.paymentMethod === 'ONLINE' && order.paymentStatus === 'Pending' && (
            <div className="mt-3">
              <Link className="btn btn-success" to={`/orders/${order.id}/payment`}>
                Pay online
              </Link>
            </div>
          )}
          {order.orderStatus === 'Pending' && order.paymentStatus === 'Pending' && (
            <div className="mt-3">
              <button className="btn btn-outline-danger" type="button" onClick={cancelOrder}>
                Cancel order
              </button>
            </div>
          )}
          {order.orderStatus === 'Delivered' && (
            <form className="mt-4" onSubmit={requestReturnRefund}>
              <h2>Return & Refund</h2>
              <label className="form-label" htmlFor="returnReason">Reason</label>
              <textarea
                id="returnReason"
                className="form-control"
                rows="3"
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
                required
              />
              <button className="btn btn-outline-danger mt-3" type="submit">
                Submit request
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
