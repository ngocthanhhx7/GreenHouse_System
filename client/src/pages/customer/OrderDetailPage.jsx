import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import OrderProgress from '../../components/order/OrderProgress.jsx';
import { exchangeService } from '../../services/exchangeService.js';
import { orderService } from '../../services/orderService.js';
import { returnRefundService } from '../../services/returnRefundService.js';
import {
  formatCurrency,
  translateDeliveryChoice,
  translateDeliveryIncidentStatus,
  translateDeliveryIncidentType,
  translateFulfillmentCycleStatus,
  translateFulfillmentCycleType,
  translateOrderStatus,
  translatePaymentMethod,
  translatePaymentStatus,
} from '../../utils/formatters.js';
import { translateShipmentEventType } from '../../utils/afterSalesLabels.js';
import { translateApiError } from '../../utils/errorMessages.js';
import {
  classifyReplacementExchangeUnits,
  getExchangeSubmissionGuard,
  getOriginalExchangeAction,
  getReturnAction,
} from '../../utils/exchangeUiState.js';

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

const DESTINATION_FIELD_LABELS = {
  receiverName: 'Tên người nhận',
  receiverPhone: 'Số điện thoại',
  shippingAddress: 'Địa chỉ giao hàng',
  customerConfirmationReference: 'Mã xác nhận của khách',
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [fulfillment, setFulfillment] = useState({ cycles: [], incidents: [] });
  const [destinationCorrection, setDestinationCorrection] = useState({
    receiverName: '',
    receiverPhone: '',
    shippingAddress: '',
    customerConfirmationReference: '',
  });
  const [isSubmittingFulfillment, setIsSubmittingFulfillment] = useState(false);
  const [activeCase, setActiveCase] = useState(null);
  const [afterSalesMode, setAfterSalesMode] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnEvidenceFiles, setReturnEvidenceFiles] = useState([]);
  const [exchangeReason, setExchangeReason] = useState('');
  const [exchangeEvidenceFiles, setExchangeEvidenceFiles] = useState([]);
  const [exchangeQuantities, setExchangeQuantities] = useState({});
  const [replacementExchangeUnits, setReplacementExchangeUnits] = useState([]);
  const [deadlineNow, setDeadlineNow] = useState(() => Date.now());
  const [selectedReplacementUnitIds, setSelectedReplacementUnitIds] = useState([]);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [isSubmittingExchange, setIsSubmittingExchange] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const returnSubmissionInFlight = useRef(false);
  const exchangeSubmissionInFlight = useRef(false);
  const exchangeSubmissionKey = useRef(newKey(`exchange:${id}`));
  const cancelIdempotencyKey = useRef(newKey(`cancel:${id}`));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadOrder(signal) {
    setError('');
    try {
      const [loadedOrder, fulfillmentResult, exchangeResult, returnResult] = await Promise.all([
        orderService.getOrder(id),
        orderService.getFulfillment(id),
        exchangeService.listMyRequests(),
        returnRefundService.listMyRequests(),
      ]);
      if (signal?.aborted) return;
      setOrder(loadedOrder);
      setFulfillment(fulfillmentResult || { cycles: [], incidents: [] });
      setDestinationCorrection((current) => ({
        ...current,
        receiverName: current.receiverName || loadedOrder.receiverName || '',
        receiverPhone: current.receiverPhone || loadedOrder.receiverPhone || '',
        shippingAddress: current.shippingAddress || loadedOrder.shippingAddress || '',
      }));
      const exchange = (exchangeResult.items || []).find((item) => (
        String(item.orderId) === String(id) && ACTIVE_EXCHANGE_STATUSES.has(item.status)
      ));
      setReplacementExchangeUnits(
        (exchangeResult.items || []).flatMap((item) => item.units || [])
      );
      const returnRequest = (returnResult.items || []).find((item) => (
        String(item.orderId) === String(id) && ACTIVE_RETURN_STATUSES.has(item.status)
      ));
      setActiveCase(exchange ? { type: 'EXCHANGE', ...exchange } : returnRequest ? { type: 'RETURN', ...returnRequest } : null);
    } catch (err) {
      if (signal?.aborted) return;
      setError(translateApiError(err));
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setOrder(null);
    setError('');
    loadOrder(controller.signal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const currentNow = Date.now();
    const deadlineTimes = [
      order?.exchangeDeadlineAt,
      order?.returnDeadlineAt,
      ...replacementExchangeUnits.map((unit) => unit?.exchangeDeadlineAt),
    ]
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    const crossedWhileLoading = deadlineTimes.some((value) => (
      deadlineNow <= value && currentNow > value
    ));
    if (crossedWhileLoading) {
      setDeadlineNow(currentNow);
      return undefined;
    }
    const deadlines = deadlineTimes.filter((value) => value >= currentNow);
    if (!deadlines.length) return undefined;
    const nextDeadline = Math.min(...deadlines);
    const timer = globalThis.setTimeout(
      () => setDeadlineNow(Date.now()),
      Math.max(0, nextDeadline - currentNow + 1),
    );
    return () => globalThis.clearTimeout(timer);
  }, [deadlineNow, id, order, replacementExchangeUnits]);

  async function cancelOrder(event) {
    event.preventDefault();
    if (!cancelReason.trim()) {
      setError('Vui lòng nhập lý do hủy đơn hàng.');
      return;
    }
    setIsCancelling(true);
    setError('');
    try {
      const cancelledOrder = await orderService.cancelOrder(id, {
        cancelReason,
        idempotencyKey: cancelIdempotencyKey.current,
      });
      setOrder(cancelledOrder);
      setMessage(cancelledOrder.idempotentReplay
        ? 'Yêu cầu hủy đơn đã được ghi nhận trước đó.'
        : 'Đơn hàng đã được hủy.');
      await loadOrder();
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setIsCancelling(false);
    }
  }

  async function submitDestinationCorrection(event) {
    event.preventDefault();
    setIsSubmittingFulfillment(true);
    setError('');
    try {
      const result = await orderService.requestDestinationCorrection(id, {
        ...destinationCorrection,
        idempotencyKey: newKey(`destination-correction:${id}`),
      });
      setMessage(result.idempotentReplay
        ? 'Yêu cầu đính chính địa chỉ đã được ghi nhận trước đó.'
        : 'Đã ghi nhận địa chỉ giao hàng mới; địa chỉ đặt hàng ban đầu được giữ nguyên.');
      await loadOrder();
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setIsSubmittingFulfillment(false);
    }
  }

  async function chooseDeliveryIncident(deliveryIncident, choice) {
    setIsSubmittingFulfillment(true);
    setError('');
    try {
      const result = await orderService.chooseDeliveryIncident(id, deliveryIncident.id, {
        choice,
        idempotencyKey: newKey(`delivery-incident:${deliveryIncident.id}:${choice}`),
      });
      setMessage(result.idempotentReplay
        ? 'Lựa chọn của bạn đã được ghi nhận trước đó.'
        : 'Đã ghi nhận lựa chọn xử lý sự cố giao hàng cho đơn hàng này.');
      await loadOrder();
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setIsSubmittingFulfillment(false);
    }
  }

  function handleAfterSalesConflict(err) {
    const actionHref = err.data?.action?.href;
    const currentCase = err.data?.currentCase;
    if (err.errorCode !== 'AFTER_SALES_CASE_ACTIVE' || !actionHref || !currentCase) return false;
    setActiveCase({
      type: currentCase.type,
      id: currentCase.id,
      status: currentCase.status,
      action: { label: err.data.action.label, href: actionHref },
    });
    return true;
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
      const currentNow = Date.now();
      const currentReturnAction = getReturnAction(order, currentNow);
      setDeadlineNow(currentNow);
      if (currentReturnAction.disabled) throw new Error(currentReturnAction.reason);
      if (!returnEvidenceFiles.length) throw new Error('Vui lòng đính kèm ít nhất một ảnh bằng chứng.');
      const uploaded = await returnRefundService.uploadEvidence(returnEvidenceFiles);
      const evidenceImages = (uploaded.items || []).map((item) => item.url);
      const created = await returnRefundService.createCustomerRequest(id, { reason: returnReason, evidenceImages });
      setActiveCase({ type: 'RETURN', ...created });
      setMessage('Đã ghi nhận yêu cầu trả hàng/hoàn tiền.');
    } catch (err) {
      handleAfterSalesConflict(err);
      setError(translateApiError(err));
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
      const replacementMode = afterSalesMode === 'REPLACEMENT_EXCHANGE';
      const currentNow = Date.now();
      const deadlineGuard = getExchangeSubmissionGuard({
        mode: afterSalesMode,
        order,
        units: replacementExchangeUnits,
        orderId: id,
        selectedReplacementUnitIds,
      }, currentNow);
      setDeadlineNow(currentNow);
      if (!deadlineGuard.allowed) throw new Error(deadlineGuard.reason);
      const lines = replacementMode ? [] : (order.details || [])
        .map((item) => ({
          orderDetailId: item._id || item.id,
          quantity: Number(exchangeQuantities[item._id || item.id] || 0),
        }))
        .filter((item) => item.quantity > 0);
      if (replacementMode && !selectedReplacementUnitIds.length) throw new Error('Vui lòng chọn ít nhất một sản phẩm thay thế còn trong hạn.');
      if (!replacementMode && !lines.length) throw new Error('Vui lòng chọn ít nhất một sản phẩm cần đổi.');
      if (!exchangeEvidenceFiles.length) throw new Error('Vui lòng đính kèm ít nhất một ảnh bằng chứng.');
      const uploaded = await exchangeService.uploadEvidence(exchangeEvidenceFiles);
      const evidenceImages = (uploaded.items || []).map((item) => item.url);
      const created = await exchangeService.createCustomerRequest(id, {
        idempotencyKey: exchangeSubmissionKey.current,
        reason: exchangeReason,
        evidenceImages,
        ...(replacementMode ? { replacementUnitIds: selectedReplacementUnitIds } : { lines }),
      });
      setActiveCase({ type: 'EXCHANGE', ...created });
      setMessage(created.idempotentReplay ? 'Yêu cầu đổi hàng đã được ghi nhận.' : 'Đã ghi nhận yêu cầu đổi hàng.');
    } catch (err) {
      handleAfterSalesConflict(err);
      setError(translateApiError(err));
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
  const originalExchangeAction = getOriginalExchangeAction(order, deadlineNow);
  const returnAction = getReturnAction(order, deadlineNow);
  const currentReplacementExchangeUnits = classifyReplacementExchangeUnits(
    replacementExchangeUnits,
    id,
    deadlineNow
  );
  const eligibleReplacementUnits = currentReplacementExchangeUnits.filter((unit) => unit.eligible);
  const replacementMode = afterSalesMode === 'REPLACEMENT_EXCHANGE';
  const exchangeFormAvailable = replacementMode
    ? eligibleReplacementUnits.length > 0
    : !originalExchangeAction.disabled;

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
          <section className="border rounded p-3 mb-4" aria-labelledby="fulfillment-heading">
            <h2 className="h5" id="fulfillment-heading">Xử lý &amp; Giao hàng</h2>
            <p className="text-secondary">Không có bản đồ hoặc theo dõi trực tiếp; đây là lịch sử bằng chứng đơn vị vận chuyển đã ghi nhận.</p>
            {(fulfillment.cycles || []).map((cycle) => (
              <article className="border-top py-3" key={cycle.id}>
                <h3 className="h6">Lượt giao {cycle.cycleNumber} · {translateFulfillmentCycleType(cycle.cycleType)} · {translateFulfillmentCycleStatus(cycle.status)}</h3>
                {cycle.shipment && (
                  <p>
                    <strong>{cycle.shipment.carrierName}</strong> · Mã vận đơn {cycle.shipment.trackingReference}
                  </p>
                )}
                <h4 className="h6">Lịch sử giao hàng</h4>
                <ul>{(cycle.events || []).map((shipmentEvent) => (
                  <li key={shipmentEvent.id}>{translateShipmentEventType(shipmentEvent.eventType)} · {shipmentEvent.occurredAt}</li>
                ))}</ul>
                <h4 className="h6">Lịch sử địa chỉ giao hàng</h4>
                <ol>{(cycle.destinations || []).map((destinationVersion) => (
                  <li key={destinationVersion.id}>
                    Phiên bản {destinationVersion.version}: {destinationVersion.receiverName}, {destinationVersion.shippingAddress}
                  </li>
                ))}</ol>
              </article>
            ))}
            <p>
              Hạn trả hàng: {order.returnDeadlineAt || '—'} · Hạn đổi hàng: {order.exchangeDeadlineAt || '—'}
            </p>

            {['Confirmed', 'Packed', 'Shipped'].includes(order.orderStatus) && (
              <form className="border-top pt-3" onSubmit={submitDestinationCorrection}>
                <h3 className="h6">Đính chính địa chỉ giao hàng</h3>
                <p>Nhân viên/Đơn vị vận chuyển sẽ xác thực địa chỉ mới; lịch sử địa chỉ trước đó luôn được giữ nguyên.</p>
                <div className="row g-2">
                  {Object.keys(destinationCorrection).map((field) => (
                    <label className="col-md-6" key={field}>{DESTINATION_FIELD_LABELS[field] || field}
                      <input className="form-control" value={destinationCorrection[field]} onChange={(event) => setDestinationCorrection({ ...destinationCorrection, [field]: event.target.value })} required />
                    </label>
                  ))}
                </div>
                <button className="btn btn-outline-success mt-3" type="submit" disabled={isSubmittingFulfillment}>
                  {isSubmittingFulfillment ? 'Đang gửi…' : 'Gửi đính chính địa chỉ'}
                </button>
              </form>
            )}

            {(fulfillment.incidents || []).map((deliveryIncident) => (
              <div className="border-top pt-3 mt-3" key={deliveryIncident.id}>
                <h3 className="h6">Sự cố giao hàng · {translateDeliveryIncidentType(deliveryIncident.incidentType)}</h3>
                <p>{translateDeliveryIncidentStatus(deliveryIncident.status)}</p>
                {deliveryIncident.status === 'AwaitingWarehouseReceipt' && (
                  <p className="text-muted">Đang chờ kho nhận và phân loại đầy đủ kiện hàng trước khi chọn hướng xử lý.</p>
                )}
                {(deliveryIncident.availableChoices || []).length > 0 && (
                  <div className="action-row">
                    {deliveryIncident.availableChoices.includes('Resend') && (
                      <button className="btn btn-outline-success" type="button" disabled={isSubmittingFulfillment} onClick={() => chooseDeliveryIncident(deliveryIncident, 'Resend')}>{translateDeliveryChoice('Resend')}</button>
                    )}
                    {deliveryIncident.availableChoices.includes('Wait') && (
                      <button className="btn btn-outline-secondary" type="button" disabled={isSubmittingFulfillment} onClick={() => chooseDeliveryIncident(deliveryIncident, 'Wait')}>{translateDeliveryChoice('Wait')}</button>
                    )}
                    {deliveryIncident.availableChoices.includes('TerminalRefund') && (
                      <button className="btn btn-outline-danger" type="button" disabled={isSubmittingFulfillment} onClick={() => chooseDeliveryIncident(deliveryIncident, 'TerminalRefund')}>{translateDeliveryChoice('TerminalRefund')}</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
          <OrderProgress status={order.orderStatus} />
          <dl className="row">
            <dt className="col-sm-3">Mã đơn</dt><dd className="col-sm-9">{order.orderCode}</dd>
            <dt className="col-sm-3">Trạng thái</dt><dd className="col-sm-9">{translateOrderStatus(order.orderStatus)}</dd>
            <dt className="col-sm-3">Thanh toán</dt><dd className="col-sm-9">{translatePaymentMethod(order.paymentMethod)} / {translatePaymentStatus(order.paymentStatus)}</dd>
            <dt className="col-sm-3">Địa chỉ giao hàng</dt><dd className="col-sm-9">{order.shippingAddress}</dd>
            <dt className="col-sm-3">Người nhận</dt><dd className="col-sm-9">{order.receiverName || '-'} · {order.receiverPhone || '-'}</dd>
            {order.customerNote && <><dt className="col-sm-3">Ghi chú</dt><dd className="col-sm-9">{order.customerNote}</dd></>}
            {order.cancelReason && <><dt className="col-sm-3">Lý do hủy</dt><dd className="col-sm-9">{order.cancelReason}</dd></>}
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
          {order.orderStatus === 'Pending' && ['Unpaid', 'Pending', 'Failed', 'Paid'].includes(order.paymentStatus) && (
            <form className="mt-3" onSubmit={cancelOrder}>
              <label className="form-label" htmlFor="customerCancelReason">Lý do hủy đơn hàng</label>
              <textarea
                id="customerCancelReason"
                className="form-control"
                rows="2"
                maxLength="500"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                required
              />
              {order.paymentStatus === 'Paid' && (
                <div className="alert alert-warning mt-2">
                  Khoản thanh toán đã xác minh sẽ được giữ nguyên làm bằng chứng và chuyển sang quy trình hoàn tiền.
                </div>
              )}
              <button className="btn btn-outline-danger mt-2" type="submit" disabled={isCancelling}>
                {isCancelling ? 'Đang hủy...' : 'Hủy đơn hàng'}
              </button>
            </form>
          )}

          {activeCase && (
            <div className="alert alert-info mt-4">
              Đơn này đang có một yêu cầu hậu mãi được xử lý.
              {' '}
              <Link to={activeCase.action?.href || (activeCase.type === 'EXCHANGE' ? `/exchanges/${activeCase.id}` : '/return-refunds')}>
                {activeCase.action?.label || 'Xem yêu cầu đang xử lý'}
              </Link>
            </div>
          )}
          {!activeCase && order.orderStatus === 'Delivered' && (
            <section className="mt-4">
              <h2>Đổi/Trả hàng</h2>
              {originalExchangeAction.deadlineAt && (
                <p className="text-secondary">
                  Hạn đổi hàng từ đơn gốc: {new Date(originalExchangeAction.deadlineAt).toLocaleString('vi-VN')}
                </p>
              )}
              <div className="d-flex flex-wrap gap-2">
                <button
                  className="btn btn-outline-success"
                  type="button"
                  disabled={originalExchangeAction.disabled}
                  title={originalExchangeAction.reason}
                  onClick={() => setAfterSalesMode('ORIGINAL_EXCHANGE')}
                >
                  Đổi hàng từ đơn gốc
                </button>
                {currentReplacementExchangeUnits.length > 0 && (
                  <button
                    className="btn btn-outline-success"
                    type="button"
                    disabled={!eligibleReplacementUnits.length}
                    onClick={() => setAfterSalesMode('REPLACEMENT_EXCHANGE')}
                  >
                    Đổi lại hàng thay thế
                  </button>
                )}
                <button
                  className="btn btn-outline-danger"
                  type="button"
                  disabled={returnAction.disabled}
                  title={returnAction.reason}
                  onClick={() => setAfterSalesMode('RETURN')}
                >
                  Trả hàng/Hoàn tiền
                </button>
              </div>
              {originalExchangeAction.disabled && (
                <div className="alert alert-secondary mt-2">{originalExchangeAction.reason}</div>
              )}
              {returnAction.disabled && (
                <div className="alert alert-secondary mt-2">{returnAction.reason}</div>
              )}
              {currentReplacementExchangeUnits.length > 0 && eligibleReplacementUnits.length === 0 && (
                <div
                  id="replacement-expiry-summary"
                  className="alert alert-secondary mt-2"
                  role="status"
                  aria-live="polite"
                >
                  <strong>Không còn sản phẩm thay thế đủ điều kiện đổi lại.</strong>
                  <ul className="mb-0 mt-2">
                    {currentReplacementExchangeUnits.map((unit) => (
                      <li key={`expired-${unit.id}`}>
                        Hạn từng sản phẩm: {unit.exchangeDeadlineAt
                          ? new Date(unit.exchangeDeadlineAt).toLocaleString('vi-VN')
                          : 'Chưa có hạn hợp lệ'} — {unit.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {['ORIGINAL_EXCHANGE', 'REPLACEMENT_EXCHANGE'].includes(afterSalesMode) && exchangeFormAvailable && (
                <form className="mt-3" onSubmit={requestExchange}>
                  <div className="alert alert-info">
                    Chỉ đổi đúng sản phẩm/SKU đã mua. Không có chênh lệch giá hoặc giao dịch tiền trong luồng đổi hàng.
                  </div>
                  <fieldset>
                    <legend className="h5">Chọn sản phẩm cần đổi</legend>
                    {replacementMode ? currentReplacementExchangeUnits.map((unit) => {
                      const detail = (order.details || []).find((item) => String(item._id || item.id) === String(unit.orderDetailId));
                      return (
                        <label className="form-check mb-2" key={unit.id}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            disabled={!unit.eligible}
                            checked={selectedReplacementUnitIds.includes(unit.id)}
                            onChange={(event) => toggleReplacementUnit(unit.id, event.target.checked)}
                          />
                          <span className="form-check-label">
                            {detail?.productNameSnapshot || 'Sản phẩm thay thế'} · vòng đổi {unit.cycle} · hạn {new Date(unit.exchangeDeadlineAt).toLocaleString('vi-VN')}
                            {!unit.eligible && ` · ${unit.reason}`}
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
                              <select
                                id={`exchange-quantity-${itemId}`}
                                className="form-select mt-1"
                                value={exchangeQuantities[itemId] || 0}
                                onChange={(event) => updateExchangeQuantity(itemId, event.target.value)}
                              >
                                <option value="0">Không đổi sản phẩm này</option>
                                {Array.from({ length: Number(item.quantity) }, (_value, index) => index + 1)
                                  .map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
                              </select>
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

              {afterSalesMode === 'RETURN' && !returnAction.disabled && (
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
