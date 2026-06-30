import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';

const STATUS_OPTIONS = ['', 'Pending', 'Confirmed', 'StockExportRequested', 'Packed', 'Shipped', 'Delivered'];

export default function StaffOrderQueuePage() {
  const [status, setStatus] = useState('Pending');
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  async function loadOrders(nextStatus = status) {
    setError('');
    try {
      const result = await staffOrderService.listOrders({ status: nextStatus });
      setOrders(result.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  function handleStatusChange(event) {
    const nextStatus = event.target.value;
    setStatus(nextStatus);
    loadOrders(nextStatus);
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Staff Order Queue</h1>
        <select className="form-select status-select" value={status} onChange={handleStatusChange}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option || 'all'} value={option}>
              {option || 'All statuses'}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderCode}</td>
                <td>{order.paymentMethod} / {order.paymentStatus}</td>
                <td>{order.orderStatus}</td>
                <td>${Number(order.totalAmount || 0).toFixed(2)}</td>
                <td>
                  <Link className="btn btn-outline-success btn-sm" to={`/staff/orders/${order.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
