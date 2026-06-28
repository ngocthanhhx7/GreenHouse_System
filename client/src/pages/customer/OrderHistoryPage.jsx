import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { orderService } from '../../services/orderService.js';

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    orderService.listMyOrders().then(setOrders).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="surface">
      <h1>Order History</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderCode}</td>
                <td>${Number(order.totalAmount).toFixed(2)}</td>
                <td>{order.paymentMethod} / {order.paymentStatus}</td>
                <td>{order.orderStatus}</td>
                <td><Link to={`/orders/${order.id}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
