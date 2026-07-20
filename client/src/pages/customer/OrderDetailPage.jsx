import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { orderService } from '../../services/orderService.js';
import { returnRefundService } from '../../services/returnRefundService.js';
import { formatCurrency, translateOrderStatus, translatePaymentMethod, translatePaymentStatus } from '../../utils/formatters.js';

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
      setMessage('Đã gửi yêu cầu đổi trả / hoàn tiền.');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!order && !error) return <div className="page-center">Đang tải đơn hàng...</div>;

  return (
    <div className="surface">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Chi tiết đơn mua</span>
          <h1>{order?.orderCode || 'Đơn hàng'}</h1>
        </div>
        <Link className="btn btn-outline-success" to="/orders">Quay lại đơn mua</Link>
      </div>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {order && (
        <>
          <div className="order-status-timeline">
            {['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'].map((status) => (
              <div className={`timeline-step ${order.orderStatus === status ? 'active' : ''}`} key={status}>
                <span></span>
                <strong>{translateOrderStatus(status)}</strong>
              </div>
            ))}
          </div>
          <dl className="row">
            <dt className="col-sm-3">Mã đơn</dt>
            <dd className="col-sm-9">{order.orderCode}</dd>
            <dt className="col-sm-3">Trạng thái</dt>
            <dd className="col-sm-9">{translateOrderStatus(order.orderStatus)}</dd>
            <dt className="col-sm-3">Thanh toán</dt>
            <dd className="col-sm-9">{translatePaymentMethod(order.paymentMethod)} / {translatePaymentStatus(order.paymentStatus)}</dd>
            <dt className="col-sm-3">Địa chỉ giao hàng</dt>
            <dd className="col-sm-9">{order.shippingAddress}</dd>
          </dl>
          <h2>Sản phẩm trong đơn</h2>
          <ul className="order-item-list">
            {(order.details || []).map((item) => (
              <li key={item._id || item.productId}>
                <span>{item.productNameSnapshot} x {item.quantity}</span>
                <strong>{formatCurrency(item.subtotal)}</strong>
              </li>
            ))}
          </ul>
          <strong className="order-total">Tổng cộng: {formatCurrency(order.totalAmount)}</strong>
          {order.paymentMethod === 'ONLINE' && order.paymentStatus === 'Pending' && (
            <div className="mt-3">
              <Link className="btn btn-success" to={`/orders/${order.id}/payment`}>
                Thanh toán online
              </Link>
            </div>
          )}
          {['Pending', 'WaitingForPayment'].includes(order.orderStatus) && ['Unpaid', 'Pending', 'Failed'].includes(order.paymentStatus) && (
            <div className="mt-3">
              <button className="btn btn-outline-danger" type="button" onClick={cancelOrder}>
                Hủy đơn hàng
              </button>
            </div>
          )}
          {order.orderStatus === 'Delivered' && (
            <form className="mt-4" onSubmit={requestReturnRefund}>
              <h2>Yêu cầu đổi trả / hoàn tiền</h2>
              <label className="form-label" htmlFor="returnReason">Lý do</label>
              <textarea
                id="returnReason"
                className="form-control"
                rows="3"
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
                required
              />
              <button className="btn btn-outline-danger mt-3" type="submit">
                Gửi yêu cầu
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
