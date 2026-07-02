import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';
import { formatCurrency, translateOrderStatus, translatePaymentMethod, translatePaymentStatus } from '../../utils/formatters.js';

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
        <h1>Hàng đợi xử lý đơn</h1>
        <select className="form-select status-select" value={status} onChange={handleStatusChange}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option || 'all'} value={option}>
              {option ? translateOrderStatus(option) : 'Tất cả trạng thái'}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Đơn hàng</th>
              <th>Thanh toán</th>
              <th>Trạng thái</th>
              <th>Tổng tiền</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderCode}</td>
                <td>{translatePaymentMethod(order.paymentMethod)} / {translatePaymentStatus(order.paymentStatus)}</td>
                <td>{translateOrderStatus(order.orderStatus)}</td>
                <td>{formatCurrency(order.totalAmount)}</td>
                <td>
                  <Link className="btn btn-outline-success btn-sm" to={`/staff/orders/${order.id}`}>
                    Mở đơn
                  </Link>
                </td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td colSpan="5" className="text-center text-muted">Không có đơn hàng trong trạng thái này.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
