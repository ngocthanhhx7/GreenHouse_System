import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { orderService } from '../../services/orderService.js';
import { returnRefundService } from '../../services/returnRefundService.js';
import { formatCurrency, translateOrderStatus, translatePaymentMethod, translatePaymentStatus } from '../../utils/formatters.js';

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnEvidenceFiles, setReturnEvidenceFiles] = useState([]);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const returnSubmissionInFlight = useRef(false);
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
    if (returnSubmissionInFlight.current) {
      setMessage('Yêu cầu đang được xử lý, vui lòng không bấm gửi nhiều lần.');
      return;
    }
    returnSubmissionInFlight.current = true;
    setIsSubmittingReturn(true);
    setError('');
    setMessage('');
    try {
      if (!returnEvidenceFiles.length) throw new Error('Vui lòng đính kèm ít nhất một ảnh bằng chứng.');
      const uploaded = await returnRefundService.uploadEvidence(returnEvidenceFiles);
      const evidenceImages = (uploaded.items || []).map((item) => item.url);
      await returnRefundService.createCustomerRequest(id, { reason: returnReason, evidenceImages });
      setReturnReason('');
      setReturnEvidenceFiles([]);
      setMessage('Đã gửi yêu cầu đổi trả / hoàn tiền.');
    } catch (err) {
      setError(err.message);
    } finally {
      returnSubmissionInFlight.current = false;
      setIsSubmittingReturn(false);
    }
  }

  if (!order && !error) return <div className="page-center">Đang tải đơn hàng...</div>;
  const returnWindowExpired = Boolean(order?.returnDeadlineAt && Date.now() > new Date(order.returnDeadlineAt).getTime());

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
            <dt className="col-sm-3">Người nhận</dt>
            <dd className="col-sm-9">{order.receiverName || '-'} · {order.receiverPhone || '-'}</dd>
            {order.customerNote && <><dt className="col-sm-3">Ghi chú</dt><dd className="col-sm-9">{order.customerNote}</dd></>}
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
          {order.paymentMethod === 'COD' && order.orderStatus === 'Delivered' && order.codDiscrepancyStatus === 'Open' && (
            <div className="alert alert-warning mt-3">
              Đơn đã giao nhưng bằng chứng thu tiền COD đang được đối soát. Bạn vẫn có thể gửi yêu cầu trong thời hạn; hệ thống sẽ giữ yêu cầu và chưa thực hiện hoàn tiền cho tới khi đối soát xong.
            </div>
          )}
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
          {order.orderStatus === 'Delivered' && returnWindowExpired && (
            <div className="alert alert-secondary mt-4">Đơn hàng đã quá thời hạn 5 ngày để gửi yêu cầu trả hàng / hoàn tiền.</div>
          )}
          {order.orderStatus === 'Delivered' && !returnWindowExpired && (
            <form className="mt-4" onSubmit={requestReturnRefund}>
              <h2>Yêu cầu đổi trả / hoàn tiền</h2>
              {order.returnDeadlineAt && <p className="text-secondary">Hạn gửi yêu cầu: {new Date(order.returnDeadlineAt).toLocaleString('vi-VN')}</p>}
              <label className="form-label" htmlFor="returnReason">Lý do</label>
              <textarea
                id="returnReason"
                className="form-control"
                rows="3"
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
                required
              />
              <label className="form-label mt-3" htmlFor="returnEvidence">Ảnh bằng chứng</label>
              <input
                id="returnEvidence"
                className="form-control"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => setReturnEvidenceFiles(Array.from(event.target.files || []).slice(0, 5))}
                required
              />
              <div className="form-text">Tối đa 5 ảnh JPG, PNG hoặc WebP; mỗi ảnh không quá 5 MB.</div>
              <button className="btn btn-outline-danger mt-3" type="submit" disabled={isSubmittingReturn}>
                {isSubmittingReturn ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
              <span className="visually-hidden" aria-live="polite">{isSubmittingReturn ? 'Yêu cầu đang được xử lý.' : message}</span>
            </form>
          )}
        </>
      )}
    </div>
  );
}
