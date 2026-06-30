import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';

export default function StaffOrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadOrder() {
    setError('');
    try {
      setOrder(await staffOrderService.getOrder(id));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadOrder();
  }, [id]);

  async function runAction(action, successMessage) {
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
      await loadOrder();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!order && !error) return <div className="page-center">Loading...</div>;

  return (
    <div className="surface">
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {order && (
        <>
          <div className="page-heading">
            <div>
              <h1>{order.orderCode}</h1>
              <p className="text-secondary mb-0">{order.paymentMethod} / {order.paymentStatus} / {order.orderStatus}</p>
            </div>
            <Link className="btn btn-outline-success" to={`/staff/orders/${order.id}/invoice`}>
              Invoice
            </Link>
          </div>
          <p>{order.shippingAddress}</p>
          <div className="action-row">
            {order.orderStatus === 'Pending' && (
              <button className="btn btn-success" type="button" onClick={() => runAction(() => staffOrderService.confirmOrder(order.id), 'Order confirmed.')}>
                Confirm order
              </button>
            )}
            {order.orderStatus === 'Confirmed' && (
              <button className="btn btn-success" type="button" onClick={() => runAction(() => staffOrderService.requestStockExport(order.id), 'Stock export requested.')}>
                Request stock export
              </button>
            )}
            {(order.allowedNextStatuses || []).map((nextStatus) => (
              <button key={nextStatus} className="btn btn-outline-success" type="button" onClick={() => runAction(() => staffOrderService.updateStatus(order.id, nextStatus), `Moved to ${nextStatus}.`)}>
                Move to {nextStatus}
              </button>
            ))}
          </div>
          <div className="table-responsive mt-4">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(order.details || []).map((item) => (
                  <tr key={item._id || item.id}>
                    <td>{item.productNameSnapshot}</td>
                    <td>{item.quantity}</td>
                    <td>${Number(item.priceSnapshot || 0).toFixed(2)}</td>
                    <td>${Number(item.subtotal || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
