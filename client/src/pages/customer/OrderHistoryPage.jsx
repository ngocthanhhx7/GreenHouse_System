import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { orderService } from '../../services/orderService.js';
import { formatCurrency, translateOrderStatus, translatePaymentMethod, translatePaymentStatus } from '../../utils/formatters.js';

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    orderService.listMyOrders().then(setOrders).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="surface">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Tài khoản khách hàng</span>
          <h1>Lịch sử mua hàng</h1>
        </div>
        <Link className="btn btn-outline-success" to="/products">Mua thêm sản phẩm</Link>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Tổng tiền</th>
              <th>Thanh toán</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderCode}</td>
                <td>{formatCurrency(order.totalAmount)}</td>
                <td>{translatePaymentMethod(order.paymentMethod)} / {translatePaymentStatus(order.paymentStatus)}</td>
                <td><span className="status-pill">{translateOrderStatus(order.orderStatus)}</span></td>
                <td><Link to={`/orders/${order.id}`}>Xem chi tiết</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && !error && <p className="text-secondary">Bạn chưa có đơn hàng nào.</p>}
      </div>
    </div>
  );
}
