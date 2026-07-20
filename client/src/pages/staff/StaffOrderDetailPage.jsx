import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';
import { formatCurrency, translateOrderStatus, translatePaymentMethod, translatePaymentStatus } from '../../utils/formatters.js';

export default function StaffOrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
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

  useEffect(() => { loadOrder(); }, [id]);

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

  if (!order && !error) return <div className="page-center">Đang tải đơn hàng...</div>;

  return (
    <div className="surface">
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {order && (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">Xử lý đơn hàng</span>
              <h1>{order.orderCode}</h1>
              <p className="text-secondary mb-0">
                {translatePaymentMethod(order.paymentMethod)} / {translatePaymentStatus(order.paymentStatus)} / {translateOrderStatus(order.orderStatus)}
              </p>
            </div>
            <Link className="btn btn-outline-success" to={`/staff/orders/${order.id}/invoice`}>In hóa đơn</Link>
          </div>
          <p><strong>Địa chỉ giao hàng:</strong> {order.shippingAddress}</p>
          <div className="action-row">
            {order.orderStatus === 'Pending' && (
              <button className="btn btn-success" type="button" onClick={() => runAction(() => staffOrderService.confirmOrder(order.id), 'Đã xác nhận đơn hàng.')}>Xác nhận đơn</button>
            )}
            {order.orderStatus === 'Confirmed' && (
              <button className="btn btn-success" type="button" onClick={() => runAction(() => staffOrderService.requestStockExport(order.id), 'Đã gửi yêu cầu xuất kho.')}>Yêu cầu xuất kho</button>
            )}
            {order.paymentMethod === 'COD' && ['Packed', 'Shipped'].includes(order.orderStatus) && order.paymentStatus !== 'Paid' && (
              <button className="btn btn-outline-success" type="button" onClick={() => runAction(() => staffOrderService.markCodCollected(order.id, { note: 'Nhân viên xác nhận đã thu COD.' }), 'Đã ghi nhận thu tiền COD.')}>Đã thu COD</button>
            )}
            {(order.allowedNextStatuses || []).map((nextStatus) => (
              <button key={nextStatus} className="btn btn-outline-success" type="button" onClick={() => runAction(() => staffOrderService.updateStatus(order.id, nextStatus), `Đã chuyển sang ${translateOrderStatus(nextStatus)}.`)}>Chuyển sang {translateOrderStatus(nextStatus)}</button>
            ))}
          </div>
          {['Pending', 'Confirmed'].includes(order.orderStatus) && (
            <div className="row g-2 mt-3 align-items-end">
              <div className="col-md-8">
                <label className="form-label" htmlFor="staffCancelReason">Lý do hủy đơn</label>
                <input id="staffCancelReason" className="form-control" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Nhập lý do hủy bắt buộc" />
              </div>
              <div className="col-md-4">
                <button className="btn btn-outline-danger" type="button" onClick={() => runAction(() => staffOrderService.cancelOrder(order.id, { cancelReason }), 'Đã hủy đơn hàng.')}>Hủy đơn</button>
              </div>
            </div>
          )}
          <div className="table-responsive mt-4">
            <table className="table">
              <thead><tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Tạm tính</th></tr></thead>
              <tbody>
                {(order.details || []).map((item) => (
                  <tr key={item._id || item.id}><td>{item.productNameSnapshot}</td><td>{item.quantity}</td><td>{formatCurrency(item.priceSnapshot)}</td><td>{formatCurrency(item.subtotal)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
