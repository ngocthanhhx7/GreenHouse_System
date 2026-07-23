import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { exchangeService } from '../../services/exchangeService.js';
import { orderService } from '../../services/orderService.js';
import { returnRefundService } from '../../services/returnRefundService.js';
import { formatCurrency, translateOrderStatus, translatePaymentMethod, translatePaymentStatus } from '../../utils/formatters.js';

const ACTIVE_EXCHANGE_STATUSES = new Set([
  'AwaitingCODReconciliation', 'CODRecoveryInProgress', 'Submitted',
  'AwaitingExactStockChoice', 'WaitingForExactStock', 'ApprovedAwaitingShipment',
  'CustomerShipped', 'WarehouseInspecting', 'OutboundFulfillment',
  'ReplacementShipped', 'DeliveryIncident',
]);
const ACTIVE_RETURN_STATUSES = new Set([
  'New', 'Pending', 'AwaitingCODReconciliation', 'Approved',
  'AwaitingInspection', 'Received', 'ReadyForRefund', 'CODRecoveryInProgress',
]);

function newKey(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [activeCase, setActiveCase] = useState(null);
  const [afterSalesMode, setAfterSalesMode] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnEvidenceFiles, setReturnEvidenceFiles] = useState([]);
  const [exchangeReason, setExchangeReason] = useState('');
  const [exchangeEvidenceFiles, setExchangeEvidenceFiles] = useState([]);
  const [exchangeQuantities, setExchangeQuantities] = useState({});
  const [eligibleReplacementUnits, setEligibleReplacementUnits] = useState([]);
  const [selectedReplacementUnitIds, setSelectedReplacementUnitIds] = useState([]);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [isSubmittingExchange, setIsSubmittingExchange] = useState(false);
  const returnSubmissionInFlight = useRef(false);
  const exchangeSubmissionInFlight = useRef(false);
  const exchangeSubmissionKey = useRef(newKey(`exchange:${id}`));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadOrder() {
    setError('');
    try {
      const [loadedOrder, exchangeResult, returnResult] = await Promise.all([
        orderService.getOrder(id),
        exchangeService.listMyRequests(),
        returnRefundService.listMyRequests(),
      ]);
      setOrder(loadedOrder);
      const exchange = (exchangeResult.items || []).find((item) => (
        String(item.orderId) === String(id) && ACTIVE_EXCHANGE_STATUSES.has(item.status)
      ));
      setEligibleReplacementUnits((exchangeResult.items || [])
        .flatMap((item) => item.units || [])
        .filter((unit) => (
          String(unit.orderId) === String(id)
          && unit.outcome === 'ReplacementDelivered'
          && unit.exchangeDeadlineAt
          && Date.now() <= new Date(unit.exchangeDeadlineAt).getTime()
        )));
      const returnRequest = (returnResult.items || []).find((item) => (
        String(item.orderId) === String(id) && ACTIVE_RETURN_STATUSES.has(item.status)
      ));
      setActiveCase(exchange ? { type: 'EXCHANGE', ...exchange } : returnRequest ? { type: 'RETURN', ...returnRequest } : null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cancelOrder() {
    try { setOrder(await orderService.cancelOrder(id)); } catch (err) { setError(err.message); }
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
      const created = await returnRefundService.createCustomerRequest(id, { reason: returnReason, evidenceImages });
      setActiveCase({ type: 'RETURN', ...created });
      setMessage('Đã ghi nhận yêu cầu trả hàng/hoàn tiền.');
    } catch (err) {
      setError(err.message);
    } finally {
      returnSubmissionInFlight.current = false;
      setIsSubmittingReturn(false);
    }
  }

  async function requestExchange(event) {
    event.preventDefault();
    if (exchangeSubmissionInFlight.current) {
      setMessage('Yêu cầu đang được xử lý, vui lòng chờ.');
      return;
    }
    exchangeSubmissionInFlight.current = true;
    setIsSubmittingExchange(true);
    setError('');
    setMessage('');
    try {
      const originalDeadline = order.exchangeDeadlineAt || order.returnDeadlineAt;
      const originalExpired = Boolean(originalDeadline && Date.now() > new Date(originalDeadline).getTime());
      const lines = originalExpired ? [] : (order.details || [])
        .map((item) => ({
          orderDetailId: item._id || item.id,
          quantity: Number(exchangeQuantities[item._id || item.id] || 0),
        }))
        .filter((item) => item.quantity > 0);
      if (originalExpired && !selectedReplacementUnitIds.length) throw new Error('Vui lòng chọn ít nhất một sản phẩm thay thế còn trong hạn.');
      if (!originalExpired && !lines.length) throw new Error('Vui lòng chọn ít nhất một sản phẩm cần đổi.');
      if (!exchangeEvidenceFiles.length) throw new Error('Vui lòng đính kèm ít nhất một ảnh bằng chứng.');
      const uploaded = await exchangeService.uploadEvidence(exchangeEvidenceFiles);
      const evidenceImages = (uploaded.items || []).map((item) => item.url);
      const created = await exchangeService.createCustomerRequest(id, {
        idempotencyKey: exchangeSubmissionKey.current,
        reason: exchangeReason,
        evidenceImages,
        ...(originalExpired ? { replacementUnitIds: selectedReplacementUnitIds } : { lines }),
      });
      setActiveCase({ type: 'EXCHANGE', ...created });
      setMessage(created.idempotentReplay ? 'Yêu cầu đổi hàng đã được ghi nhận.' : 'Đã ghi nhận yêu cầu đổi hàng.');
    } catch (err) {
      setError(err.message);
    } finally {
      exchangeSubmissionInFlight.current = false;
      setIsSubmittingExchange(false);
    }
  }

  function updateExchangeQuantity(itemId, quantity) {
    setExchangeQuantities((current) => ({ ...current, [itemId]: quantity }));
  }

  function toggleReplacementUnit(unitId, checked) {
    setSelectedReplacementUnitIds((current) => (
      checked ? [...new Set([...current, unitId])] : current.filter((idValue) => idValue !== unitId)
    ));
  }

  if (!order && !error) return <div className="page-center">Đang tải đơn hàng...</div>;
  const originalAfterSalesDeadline = order?.exchangeDeadlineAt || order?.returnDeadlineAt;
  const originalWindowExpired = Boolean(originalAfterSalesDeadline && Date.now() > new Date(originalAfterSalesDeadline).getTime());
  const replacementDeadline = eligibleReplacementUnits.length
    ? new Date(Math.min(...eligibleReplacementUnits.map((unit) => new Date(unit.exchangeDeadlineAt).getTime())))
    : null;
  const afterSalesDeadline = originalWindowExpired && replacementDeadline ? replacementDeadline : originalAfterSalesDeadline;
  const hasExchangeRight = !originalWindowExpired || eligibleReplacementUnits.length > 0;

  return (
    <div className="surface">
      <div className="page-heading">
        <div><span className="eyebrow">Chi tiết đơn mua</span><h1>{order?.orderCode || 'Đơn hàng'}</h1></div>
        <Link className="btn btn-outline-success" to="/orders">Quay lại đơn mua</Link>
      </div>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {order && (
        <>
          <div className="order-status-timeline">
            {['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'].map((status) => (
              <div className={`timeline-step ${order.orderStatus === status ? 'active' : ''}`} key={status}>
                <span></span><strong>{translateOrderStatus(status)}</strong>
              </div>
            ))}
          </div>
          <dl className="row">
            <dt className="col-sm-3">Mã đơn</dt><dd className="col-sm-9">{order.orderCode}</dd>
            <dt className="col-sm-3">Trạng thái</dt><dd className="col-sm-9">{translateOrderStatus(order.orderStatus)}</dd>
            <dt className="col-sm-3">Thanh toán</dt><dd className="col-sm-9">{translatePaymentMethod(order.paymentMethod)} / {translatePaymentStatus(order.paymentStatus)}</dd>
            <dt className="col-sm-3">Địa chỉ giao hàng</dt><dd className="col-sm-9">{order.shippingAddress}</dd>
            <dt className="col-sm-3">Người nhận</dt><dd className="col-sm-9">{order.receiverName || '-'} · {order.receiverPhone || '-'}</dd>
            {order.customerNote && <><dt className="col-sm-3">Ghi chú</dt><dd className="col-sm-9">{order.customerNote}</dd></>}
          </dl>
          <h2>Sản phẩm trong đơn</h2>
          <ul className="order-item-list">
            {(order.details || []).map((item) => (
              <li key={item._id || item.id || item.productId}>
                <span>{item.productNameSnapshot} x {item.quantity}</span>
                <strong>{formatCurrency(item.subtotal)}</strong>
              </li>
            ))}
          </ul>
          <strong className="order-total">Tổng cộng: {formatCurrency(order.totalAmount)}</strong>

          {order.paymentMethod === 'COD' && order.orderStatus === 'Delivered' && order.codDiscrepancyStatus === 'Open' && (
            <div className="alert alert-warning mt-3">
              Đơn đã giao nhưng bằng chứng tiền bạn đã trả cho đơn vị vận chuyển đang được đối soát.
              Hệ thống vẫn ghi nhận yêu cầu đúng hạn nhưng chưa duyệt đổi hàng hoặc hoàn tiền cho đến khi có kết quả.
            </div>
          )}
          {order.paymentMethod === 'ONLINE' && order.paymentStatus === 'Pending' && (
            <div className="mt-3"><Link className="btn btn-success" to={`/orders/${order.id}/payment`}>Thanh toán online</Link></div>
          )}
          {['Pending', 'WaitingForPayment'].includes(order.orderStatus) && ['Unpaid', 'Pending', 'Failed'].includes(order.paymentStatus) && (
            <div className="mt-3"><button className="btn btn-outline-danger" type="button" onClick={cancelOrder}>Hủy đơn hàng</button></div>
          )}

          {activeCase && (
            <div className="alert alert-info mt-4">
              Đơn này đang có một yêu cầu hậu mãi được xử lý.
              {' '}
              <Link to={activeCase.type === 'EXCHANGE' ? `/exchanges/${activeCase.id}` : '/return-refunds'}>
                Xem yêu cầu đang xử lý
              </Link>
            </div>
          )}
          {!activeCase && order.orderStatus === 'Delivered' && !hasExchangeRight && (
            <div className="alert alert-secondary mt-4">
              Đã quá thời hạn 5 ngày. Hạn gửi yêu cầu: {new Date(afterSalesDeadline).toLocaleString('vi-VN')}.
            </div>
          )}
          {!activeCase && order.orderStatus === 'Delivered' && hasExchangeRight && (
            <section className="mt-4">
              <h2>Đổi/Trả hàng</h2>
              {afterSalesDeadline && <p className="text-secondary">Hạn gửi yêu cầu: {new Date(afterSalesDeadline).toLocaleString('vi-VN')}</p>}
              <div className="d-flex flex-wrap gap-2">
                <button className="btn btn-outline-success" type="button" onClick={() => setAfterSalesMode('EXCHANGE')}>Đổi hàng</button>
                {!originalWindowExpired && (
                  <button className="btn btn-outline-danger" type="button" onClick={() => setAfterSalesMode('RETURN')}>Trả hàng/Hoàn tiền</button>
                )}
              </div>
              {originalWindowExpired && (
                <div className="alert alert-info mt-2">
                  Hạn của đơn gốc đã hết. Bạn chỉ có thể đổi lại sản phẩm thay thế đang còn trong cửa sổ 5 ngày riêng của sản phẩm đó.
                </div>
              )}

              {afterSalesMode === 'EXCHANGE' && (
                <form className="mt-3" onSubmit={requestExchange}>
                  <div className="alert alert-info">
                    Chỉ đổi đúng sản phẩm/SKU đã mua. Không có chênh lệch giá hoặc giao dịch tiền trong luồng đổi hàng.
                  </div>
                  <fieldset>
                    <legend className="h5">Chọn sản phẩm cần đổi</legend>
                    {originalWindowExpired ? eligibleReplacementUnits.map((unit) => {
                      const detail = (order.details || []).find((item) => String(item._id || item.id) === String(unit.orderDetailId));
                      return (
                        <label className="form-check mb-2" key={unit.id}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={selectedReplacementUnitIds.includes(unit.id)}
                            onChange={(event) => toggleReplacementUnit(unit.id, event.target.checked)}
                          />
                          <span className="form-check-label">
                            {detail?.productNameSnapshot || 'Sản phẩm thay thế'} · vòng đổi {unit.cycle} · hạn {new Date(unit.exchangeDeadlineAt).toLocaleString('vi-VN')}
                          </span>
                        </label>
                      );
                    }) : (order.details || []).map((item) => {
                      const itemId = item._id || item.id;
                      return (
                        <div className="mb-2" key={itemId}>
                          {Number(item.quantity) === 1 ? (
                            <label className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={Number(exchangeQuantities[itemId] || 0) === 1}
                                onChange={(event) => updateExchangeQuantity(itemId, event.target.checked ? 1 : 0)}
                              />
                              <span className="form-check-label">{item.productNameSnapshot}</span>
                            </label>
                          ) : (
                            <label className="form-label" htmlFor={`exchange-quantity-${itemId}`}>
                              {item.productNameSnapshot} (đã mua {item.quantity})
                              <input
                                id={`exchange-quantity-${itemId}`}
                                className="form-control mt-1"
                                type="number"
                                min="0"
                                max={item.quantity}
                                step="1"
                                value={exchangeQuantities[itemId] || 0}
                                onChange={(event) => updateExchangeQuantity(itemId, event.target.value)}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </fieldset>
                  <label className="form-label" htmlFor="exchangeReason">Lý do đổi hàng</label>
                  <textarea id="exchangeReason" className="form-control" rows="3" value={exchangeReason} onChange={(event) => setExchangeReason(event.target.value)} required />
                  <label className="form-label mt-3" htmlFor="exchangeEvidence">Ảnh bằng chứng</label>
                  <input id="exchangeEvidence" className="form-control" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setExchangeEvidenceFiles(Array.from(event.target.files || []).slice(0, 5))} required />
                  <div className="form-text">Tối đa 5 ảnh JPG, PNG hoặc WebP; mỗi ảnh không quá 5 MB.</div>
                  <button className="btn btn-success mt-3" type="submit" disabled={isSubmittingExchange}>
                    {isSubmittingExchange ? 'Đang gửi...' : 'Gửi yêu cầu đổi hàng'}
                  </button>
                  <span className="visually-hidden" aria-live="polite">{isSubmittingExchange ? 'Yêu cầu đang được xử lý, vui lòng chờ.' : message}</span>
                </form>
              )}

              {afterSalesMode === 'RETURN' && (
                <form className="mt-3" onSubmit={requestReturnRefund}>
                  <div className="alert alert-warning">Trả hàng áp dụng cho toàn bộ đơn. Số tiền do hệ thống xác định từ đơn hàng; bạn không cần nhập.</div>
                  <label className="form-label" htmlFor="returnReason">Lý do trả hàng</label>
                  <textarea id="returnReason" className="form-control" rows="3" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} required />
                  <label className="form-label mt-3" htmlFor="returnEvidence">Ảnh bằng chứng</label>
                  <input id="returnEvidence" className="form-control" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setReturnEvidenceFiles(Array.from(event.target.files || []).slice(0, 5))} required />
                  <div className="form-text">Tối đa 5 ảnh JPG, PNG hoặc WebP; mỗi ảnh không quá 5 MB.</div>
                  <button className="btn btn-outline-danger mt-3" type="submit" disabled={isSubmittingReturn}>
                    {isSubmittingReturn ? 'Đang gửi...' : 'Gửi yêu cầu trả hàng'}
                  </button>
                  <span className="visually-hidden" aria-live="polite">{isSubmittingReturn ? 'Yêu cầu đang được xử lý.' : message}</span>
                </form>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
