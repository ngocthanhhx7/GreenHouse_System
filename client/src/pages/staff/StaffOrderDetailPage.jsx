import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import OrderProgress from '../../components/order/OrderProgress.jsx';
import { staffOrderService } from '../../services/staffOrderService.js';
import {
  formatCurrency,
  translateOrderStatus,
  translatePaymentMethod,
  translatePaymentStatus,
} from '../../utils/formatters.js';

function toLocalDateTimeValue(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function blankHandoff() {
  return {
    carrierName: '',
    trackingReference: '',
    handedOffAt: toLocalDateTimeValue(),
    evidenceReference: '',
  };
}

function blankEvent() {
  return {
    eventType: 'DELIVERED',
    source: 'STAFF_EVIDENCE',
    occurredAt: toLocalDateTimeValue(),
    evidenceReference: '',
    reason: '',
    replacesEventId: '',
  };
}

function blankCodEvidence() {
  return {
    customerCollectedAmount: '',
    collectionTiming: 'AT_DELIVERY',
    occurredAt: toLocalDateTimeValue(),
    evidenceReference: '',
  };
}

function validateHandoffDraft(draft) {
  const errors = {};
  if (!draft.carrierName.trim()) errors.carrierName = 'Vui lòng nhập đơn vị vận chuyển.';
  if (!draft.trackingReference.trim()) errors.trackingReference = 'Vui lòng nhập mã vận đơn.';
  if (!draft.evidenceReference.trim()) errors.evidenceReference = 'Vui lòng nhập bằng chứng bàn giao.';
  if (!draft.handedOffAt || Number.isNaN(new Date(draft.handedOffAt).getTime())) {
    errors.handedOffAt = 'Vui lòng chọn thời điểm bàn giao hợp lệ.';
  }
  return errors;
}

function validateShipmentEventDraft(draft) {
  const errors = {};
  if (!draft.evidenceReference.trim()) errors.evidenceReference = 'Vui lòng nhập bằng chứng giao hàng.';
  if (!draft.occurredAt || Number.isNaN(new Date(draft.occurredAt).getTime())) {
    errors.occurredAt = 'Vui lòng chọn thời điểm sự kiện hợp lệ.';
  }
  if (['CORRECTION', 'DISPUTED'].includes(draft.eventType) && !draft.replacesEventId.trim()) {
    errors.replacesEventId = 'Vui lòng chọn sự kiện cần thay thế.';
  }
  return errors;
}

function validateCodEvidenceDraft(draft, expectedAmount, { allowPartial = false } = {}) {
  const errors = {};
  if (!draft.evidenceReference.trim()) errors.codEvidenceReference = 'Vui lòng nhập bằng chứng thu COD.';
  if (!draft.occurredAt || Number.isNaN(new Date(draft.occurredAt).getTime())) {
    errors.codEvidenceOccurredAt = 'Vui lòng chọn thời điểm thu COD hợp lệ.';
  }
  if (!['AT_DELIVERY', 'AFTER_DELIVERY'].includes(draft.collectionTiming)) {
    errors.codEvidenceTiming = 'Vui lòng chọn thời điểm thu COD hợp lệ.';
  }
  if (allowPartial) {
    const amount = Number(draft.customerCollectedAmount);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount >= expectedAmount) {
      errors.customerCollectedAmount = 'Số tiền thực nhận phải là số nguyên từ 0 đến dưới CODExpectedAmount.';
    }
  }
  return errors;
}

function translateFulfillmentEventType(eventType) {
  const labels = {
    HANDOFF: 'Đã bàn giao cho đơn vị vận chuyển',
    ATTEMPT_FAILED: 'Giao không thành công',
    RESCHEDULED: 'Đã hẹn giao lại',
    DELIVERED: 'Đã giao thành công',
    RETURNED_TO_SHOP: 'Đã hoàn về cửa hàng',
    LOST: 'Thất lạc',
    DAMAGED: 'Hư hỏng',
    CORRECTION: 'Điều chỉnh bằng chứng',
    DISPUTED: 'Tranh chấp bằng chứng',
  };
  return labels[eventType] || eventType;
}

export default function StaffOrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [fulfillment, setFulfillment] = useState({ cycles: [], incidents: [] });
  const [checklist, setChecklist] = useState([]);
  const [handoff, setHandoff] = useState(blankHandoff);
  const [shipmentEvent, setShipmentEvent] = useState(blankEvent);
  const [codEvidence, setCodEvidence] = useState(blankCodEvidence);
  const [destination, setDestination] = useState({
    receiverName: '',
    receiverPhone: '',
    shippingAddress: '',
    customerConfirmationReference: '',
    carrierAcceptanceReference: '',
  });
  const [resolutionIncidentId, setResolutionIncidentId] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [destinationReference, setDestinationReference] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const commandKeys = useRef(new Map());

  function idempotencyKey(command) {
    if (!commandKeys.current.has(command)) {
      const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      commandKeys.current.set(command, `staff-${command}-${random}`);
    }
    return commandKeys.current.get(command);
  }

  async function loadOrder() {
    setError('');
    try {
      const [loadedOrder, loadedFulfillment] = await Promise.all([
        staffOrderService.getOrder(id),
        staffOrderService.getFulfillment(id),
      ]);
      setOrder(loadedOrder);
      setFulfillment(loadedFulfillment || { cycles: [], incidents: [] });
      setChecklist((loadedOrder.details || []).map((item) => ({
        orderDetailId: item._id || item.id,
        quantity: Number(item.quantity),
        checked: false,
      })));
      setDestination((current) => ({
        ...current,
        receiverName: current.receiverName || loadedOrder.receiverName || '',
        receiverPhone: current.receiverPhone || loadedOrder.receiverPhone || '',
        shippingAddress: current.shippingAddress || loadedOrder.shippingAddress || '',
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadOrder(); }, [id]);

  async function runAction(action, successMessage) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setMessage('');
    setFieldErrors({});
    setSubmitting(true);
    try {
      const result = await action();
      setMessage(result?.idempotentReplay
        ? 'AlreadyProcessed: thao tác này đã được ghi nhận trước đó.'
        : successMessage);
      await loadOrder();
      return result;
    } catch (err) {
      setError(err.message);
      setFieldErrors(Object.fromEntries((err.errors || []).map((entry) => [entry.field, entry.message])));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
    return null;
  }

  const activeCycle = fulfillment.cycles?.at(-1);
  const shipment = activeCycle?.shipment;
  const shipmentHistory = activeCycle?.events || [];
  const allItemsChecked = checklist.length > 0 && checklist.every((line) => line.checked);

  function submitPacking() {
    return runAction(
      () => staffOrderService.confirmPacking(order.id, {
        checklist: checklist.map((line) => ({
          ...line,
          checkedQuantity: line.checked ? line.quantity : 0,
        })),
        idempotencyKey: idempotencyKey(`packing:${activeCycle?.id || order.id}`),
      }),
      'Đã đóng gói đủ sản phẩm; đơn hàng chuyển sang Đã đóng gói.',
    );
  }

  function submitHandoff() {
    const errors = validateHandoffDraft(handoff);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Vui lòng kiểm tra đầy đủ thông tin bàn giao.');
      return;
    }
    return runAction(
      () => staffOrderService.createShipment(order.id, {
        ...handoff,
        handedOffAt: new Date(handoff.handedOffAt).toISOString(),
        idempotencyKey: idempotencyKey(`handoff:${activeCycle?.id || order.id}`),
      }),
      'Đã bàn giao cho đơn vị vận chuyển; đơn hàng chuyển sang Đang giao.',
    );
  }

  async function submitShipmentEvent() {
    const errors = validateShipmentEventDraft(shipmentEvent);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Vui lòng kiểm tra thời gian và bằng chứng giao hàng.');
      return;
    }
    const result = await runAction(
      () => staffOrderService.recordShipmentEvent(shipment.id, {
        ...shipmentEvent,
        eventKey: idempotencyKey(
          `event:${shipment.id}:${shipmentEvent.eventType}:${shipmentEvent.occurredAt}`,
        ),
        occurredAt: new Date(shipmentEvent.occurredAt).toISOString(),
      }),
      shipmentEvent.eventType === 'DELIVERED'
        ? 'Đã xác nhận giao thành công; đơn hàng chuyển sang Đã giao.'
        : 'Đã thêm sự kiện vào lịch sử vận chuyển.',
    );
    if (result) setShipmentEvent(blankEvent());
  }

  function submitFullCodCollection() {
    const expectedAmount = Number(order.codExpectedAmount);
    const errors = validateCodEvidenceDraft(codEvidence, expectedAmount);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount < 0) {
      errors.codExpectedAmount = 'Đơn hàng chưa có CODExpectedAmount hợp lệ.';
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Vui lòng kiểm tra bằng chứng và thời điểm thu đủ COD.');
      return;
    }
    return runAction(
      () => staffOrderService.markCodCollected(order.id, {
        customerCollectedAmount: expectedAmount,
        collectionTiming: codEvidence.collectionTiming,
        occurredAt: new Date(codEvidence.occurredAt).toISOString(),
        evidenceReference: codEvidence.evidenceReference.trim(),
        idempotencyKey: idempotencyKey(`cod-full:${order.id}`),
      }),
      'Đã ghi nhận Staff thu đủ COD; Payment chuyển sang Paid.',
    ).then((result) => {
      if (result) setCodEvidence(blankCodEvidence());
      return result;
    });
  }

  function submitPartialCodCollection() {
    const expectedAmount = Number(order.codExpectedAmount);
    const errors = validateCodEvidenceDraft(codEvidence, expectedAmount, { allowPartial: true });
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount < 1) {
      errors.codExpectedAmount = 'Đơn hàng chưa có CODExpectedAmount hợp lệ.';
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Vui lòng kiểm tra số tiền thực nhận và bằng chứng thu COD.');
      return;
    }
    const observedAmount = Number(codEvidence.customerCollectedAmount);
    return runAction(
      () => staffOrderService.markCodCollected(order.id, {
        customerCollectedAmount: observedAmount,
        collectionTiming: codEvidence.collectionTiming,
        occurredAt: new Date(codEvidence.occurredAt).toISOString(),
        evidenceReference: codEvidence.evidenceReference.trim(),
        idempotencyKey: idempotencyKey(`cod-observed:${order.id}`),
      }),
      'Đã ghi nhận số tiền COD thực nhận; đơn hàng vẫn Unpaid và đã mở đối soát.',
    ).then((result) => {
      if (result) setCodEvidence(blankCodEvidence());
      return result;
    });
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
              <span className="eyebrow">Xử lý fulfillment</span>
              <h1>{order.orderCode}</h1>
              <p className="text-secondary mb-0">
                {translatePaymentMethod(order.paymentMethod)} / {translatePaymentStatus(order.paymentStatus)} / {translateOrderStatus(order.orderStatus)}
              </p>
            </div>
            <Link className="btn btn-outline-success" to={`/staff/orders/${order.id}/invoice`}>In hóa đơn</Link>
          </div>

          <OrderProgress status={order.orderStatus} />

          <div className="row g-3">
            <div className="col-md-6"><strong>Checkout address:</strong> {order.shippingAddress}</div>
            <div className="col-md-3"><strong>ShippingFee:</strong> {formatCurrency(order.shippingFee)}</div>
            <div className="col-md-3"><strong>MoneyObligationsSettled:</strong> {String(order.moneyObligationsSettled ?? true)}</div>
          </div>

          <div className="action-row mt-3">
            {order.orderStatus === 'Pending' && (
              <button className="btn btn-success" type="button" disabled={submitting} onClick={() => runAction(
                () => staffOrderService.confirmOrder(order.id, { idempotencyKey: idempotencyKey(`confirm:${order.id}`) }),
                'Đã xác nhận đơn và tạo phiếu xuất kho ban đầu.',
              )}>Xác nhận đơn</button>
            )}
            {order.stockExportRequest && (
              <span className="badge text-bg-info align-self-center">
                Export cycle {order.stockExportRequest.cycleId || 'initial'}: {order.stockExportRequest.status}
              </span>
            )}
          </div>

          {order.orderStatus === 'Confirmed' && order.stockExportRequest?.status === 'Completed' && (
            <section className="border rounded p-3 mt-4">
              <h2 className="h5">Kiểm tra và xác nhận đóng gói <small className="text-secondary">· PackingRecord</small></h2>
              <p className="text-secondary">
                Chỉ khi toàn bộ sản phẩm được kiểm tra đủ số lượng, đơn hàng mới chuyển sang Đã đóng gói.
              </p>
              {checklist.map((line, index) => (
                <label className="d-flex gap-2 align-items-center mb-2" key={line.orderDetailId}>
                  <input
                    type="checkbox"
                    checked={line.checked}
                    onChange={(event) => setChecklist((current) => current.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, checked: event.target.checked } : item
                    )))}
                  />
                  <span>{order.details[index]?.productNameSnapshot} · {line.quantity}</span>
                </label>
              ))}
              {!allItemsChecked && (
                <div className="alert alert-warning mt-3 mb-2">
                  Vui lòng kiểm tra đủ tất cả sản phẩm trước khi xác nhận đóng gói.
                </div>
              )}
              <button
                className="btn btn-success"
                type="button"
                disabled={submitting || !allItemsChecked}
                onClick={submitPacking}
              >
                Xác nhận đóng gói
              </button>
            </section>
          )}

          {order.orderStatus === 'Packed' && (
            <section className="border rounded p-3 mt-4">
              <h2 className="h5">Bàn giao cho đơn vị vận chuyển</h2>
              <p className="text-secondary">
                Ghi nhận đủ mã vận đơn, thời điểm và bằng chứng để chuyển đơn sang Đang giao.
              </p>
              <div className="row g-2">
                {[
                  ['carrierName', 'Đơn vị vận chuyển', 'text'],
                  ['trackingReference', 'Mã vận đơn', 'text'],
                  ['handedOffAt', 'Thời điểm bàn giao', 'datetime-local'],
                  ['evidenceReference', 'Bằng chứng bàn giao', 'text'],
                ].map(([field, label, type]) => (
                  <label className="col-md-6" key={field}>
                    <span className="form-label">{label}</span>
                    <input className={`form-control ${fieldErrors[field] ? 'is-invalid' : ''}`} type={type} value={handoff[field]} onChange={(event) => setHandoff({ ...handoff, [field]: event.target.value })} required />
                    {fieldErrors[field] && <span className="invalid-feedback">{fieldErrors[field]}</span>}
                  </label>
                ))}
              </div>
              <button className="btn btn-success mt-3" type="button" disabled={submitting} onClick={submitHandoff}>
                Xác nhận bàn giao và bắt đầu giao hàng
              </button>
            </section>
          )}

          {shipment && (
            <section className="border rounded p-3 mt-4">
              <h2 className="h5">Lịch sử vận chuyển</h2>
              <p><strong>{shipment.carrierName}</strong> · Mã vận đơn {shipment.trackingReference}</p>
              <ul>{shipmentHistory.map((entry) => (
                <li key={entry.id}>
                  {translateFulfillmentEventType(entry.eventType)}
                  {' · '}
                  {new Date(entry.occurredAt).toLocaleString('vi-VN')}
                </li>
              ))}</ul>

              {order.orderStatus === 'Shipped' && (
                <>
                  <h3 className="h6 mt-4">Ghi nhận sự kiện giao hàng</h3>
                  <div className="row g-2">
                    <label className="col-md-4">Loại sự kiện
                      <select className="form-select" value={shipmentEvent.eventType} onChange={(event) => setShipmentEvent({ ...shipmentEvent, eventType: event.target.value })}>
                        <option value="DELIVERED">Giao thành công</option>
                        <option value="ATTEMPT_FAILED">Giao không thành công</option>
                        <option value="RESCHEDULED">Hẹn giao lại</option>
                        <option value="RETURNED_TO_SHOP">Hoàn về cửa hàng</option>
                        <option value="LOST">Thất lạc</option>
                        <option value="DAMAGED">Hư hỏng</option>
                        <option value="CORRECTION">Điều chỉnh bằng chứng</option>
                        <option value="DISPUTED">Tranh chấp bằng chứng</option>
                      </select>
                    </label>
                    <label className="col-md-4">Thời điểm xảy ra
                      <input className={`form-control ${fieldErrors.occurredAt ? 'is-invalid' : ''}`} type="datetime-local" value={shipmentEvent.occurredAt} onChange={(event) => setShipmentEvent({ ...shipmentEvent, occurredAt: event.target.value })} required />
                      {fieldErrors.occurredAt && <span className="invalid-feedback">{fieldErrors.occurredAt}</span>}
                    </label>
                    <label className="col-md-4">Bằng chứng giao hàng
                      <input className={`form-control ${fieldErrors.evidenceReference ? 'is-invalid' : ''}`} value={shipmentEvent.evidenceReference} onChange={(event) => setShipmentEvent({ ...shipmentEvent, evidenceReference: event.target.value })} required />
                      {fieldErrors.evidenceReference && <span className="invalid-feedback">{fieldErrors.evidenceReference}</span>}
                    </label>
                    <label className="col-md-6">Ghi chú
                      <input className="form-control" value={shipmentEvent.reason} onChange={(event) => setShipmentEvent({ ...shipmentEvent, reason: event.target.value })} />
                    </label>
                    {['CORRECTION', 'DISPUTED'].includes(shipmentEvent.eventType) && (
                      <label className="col-md-6">Mã sự kiện được thay thế
                        <input className={`form-control ${fieldErrors.replacesEventId ? 'is-invalid' : ''}`} value={shipmentEvent.replacesEventId} onChange={(event) => setShipmentEvent({ ...shipmentEvent, replacesEventId: event.target.value })} required />
                        {fieldErrors.replacesEventId && <span className="invalid-feedback">{fieldErrors.replacesEventId}</span>}
                      </label>
                    )}
                  </div>
                  <button className="btn btn-success mt-3" type="button" disabled={submitting} onClick={submitShipmentEvent}>
                    {shipmentEvent.eventType === 'DELIVERED' ? 'Xác nhận đã giao hàng' : 'Ghi nhận sự kiện'}
                  </button>
                </>
              )}

              {order.orderStatus === 'Delivered' && (
                <div className="alert alert-success mt-3 mb-0">
                  <strong>Đơn hàng đã giao thành công.</strong> Customer hiện có thể xem trạng thái Đã giao trong lịch sử mua hàng.
                </div>
              )}
            </section>
          )}

          <section className="border rounded p-3 mt-4">
            <h2 className="h5">Shipment destination version</h2>
            <p>Carrier evidence / carrier accept là bắt buộc sau khi đã bàn giao.</p>
            <div className="row g-2">
              {Object.keys(destination).map((field) => (
                <label className="col-md-6" key={field}>{field}
                  <input className="form-control" value={destination[field]} onChange={(event) => setDestination({ ...destination, [field]: event.target.value })} />
                </label>
              ))}
            </div>
            <button className="btn btn-outline-success mt-3" type="button" disabled={submitting} onClick={() => runAction(
              () => staffOrderService.addDestinationVersion(order.id, {
                ...destination,
                idempotencyKey: idempotencyKey(`destination:${activeCycle?.id || order.id}`),
              }),
              'Đã thêm destination version bất biến.',
            )}>Thêm destination correction</button>
          </section>

          {order.paymentMethod === 'COD' && (
            <div className={`alert mt-4 ${order.codDiscrepancyStatus === 'Open' ? 'alert-warning' : 'alert-secondary'}`}>
              <strong>CODExpectedAmount:</strong> {formatCurrency(order.codExpectedAmount)}
              {' · '}<strong>CustomerCollectedAmount:</strong> {formatCurrency(order.customerCollectedAmount)}
              {' · '}<strong>CarrierSettlementAmount:</strong> {formatCurrency(order.carrierSettlementAmount)}
              <div>codDiscrepancyStatus: {order.codDiscrepancyStatus}; settlementReconciliationStatus: {order.settlementReconciliationStatus}</div>
              {order.codRecoveryReceiptId && <div>codRecoveryReceiptId: {order.codRecoveryReceiptId}</div>}
            </div>
          )}

          {order.paymentMethod === 'COD'
            && order.orderStatus === 'Delivered'
            && order.paymentStatus === 'Unpaid'
            && !order.customerCollectionEvidenceId
            && (
              <section className="border rounded p-3 mt-4">
                <h2 className="h5">Ghi nhận thu COD thủ công</h2>
                <p className="text-secondary mb-3">
                  Staff là người ghi nhận bằng chứng trong phiên bản hiện tại vì hệ thống chưa tích hợp Carrier.
                  CODExpectedAmount do hệ thống cố định; không nhập lại số tiền cho luồng thu đủ.
                </p>
                <div className="row g-2">
                  <label className="col-md-4">
                    <span className="form-label">Thời điểm thu COD</span>
                    <select
                      className={`form-select ${fieldErrors.codEvidenceTiming ? 'is-invalid' : ''}`}
                      value={codEvidence.collectionTiming}
                      onChange={(event) => setCodEvidence({ ...codEvidence, collectionTiming: event.target.value })}
                    >
                      <option value="AT_DELIVERY">Khi giao hàng</option>
                      <option value="AFTER_DELIVERY">Sau khi giao hàng</option>
                    </select>
                    {fieldErrors.codEvidenceTiming && <span className="invalid-feedback">{fieldErrors.codEvidenceTiming}</span>}
                  </label>
                  <label className="col-md-4">
                    <span className="form-label">Thời điểm ghi nhận</span>
                    <input
                      className={`form-control ${fieldErrors.codEvidenceOccurredAt ? 'is-invalid' : ''}`}
                      type="datetime-local"
                      value={codEvidence.occurredAt}
                      onChange={(event) => setCodEvidence({ ...codEvidence, occurredAt: event.target.value })}
                      required
                    />
                    {fieldErrors.codEvidenceOccurredAt && <span className="invalid-feedback">{fieldErrors.codEvidenceOccurredAt}</span>}
                  </label>
                  <label className="col-md-4">
                    <span className="form-label">Bằng chứng thu COD</span>
                    <input
                      className={`form-control ${fieldErrors.codEvidenceReference ? 'is-invalid' : ''}`}
                      value={codEvidence.evidenceReference}
                      onChange={(event) => setCodEvidence({ ...codEvidence, evidenceReference: event.target.value })}
                      placeholder="Ví dụ: staff-pod-001"
                      required
                    />
                    {fieldErrors.codEvidenceReference && <span className="invalid-feedback">{fieldErrors.codEvidenceReference}</span>}
                  </label>
                </div>

                <div className="d-flex flex-wrap gap-2 mt-3">
                  <button
                    className="btn btn-success"
                    type="button"
                    disabled={submitting}
                    onClick={submitFullCodCollection}
                  >
                    Ghi nhận thu đủ COD ({formatCurrency(order.codExpectedAmount)})
                  </button>
                </div>

                <hr />
                <p className="text-secondary">
                  Nếu thu thiếu hoặc không thu, nhập đúng số tiền thực nhận. Hệ thống giữ Payment ở Unpaid và mở CODDiscrepancy để Staff xử lý tiếp.
                </p>
                <div className="row g-2 align-items-end">
                  <label className="col-md-4">
                    <span className="form-label">Số tiền thực nhận khi thu thiếu/không thu</span>
                    <input
                      className={`form-control ${fieldErrors.customerCollectedAmount ? 'is-invalid' : ''}`}
                      type="number"
                      min="0"
                      max={Math.max(0, Number(order.codExpectedAmount) - 1)}
                      step="1"
                      value={codEvidence.customerCollectedAmount}
                      onChange={(event) => setCodEvidence({ ...codEvidence, customerCollectedAmount: event.target.value })}
                    />
                    {fieldErrors.customerCollectedAmount && <span className="invalid-feedback">{fieldErrors.customerCollectedAmount}</span>}
                  </label>
                  <div className="col-md-8">
                    <button
                      className="btn btn-outline-warning"
                      type="button"
                      disabled={submitting}
                      onClick={submitPartialCodCollection}
                    >
                      Ghi nhận thu thiếu/không thu
                    </button>
                  </div>
                </div>
              </section>
            )}

          {fulfillment.incidents?.length > 0 && (
            <section className="border rounded p-3 mt-4">
              <h2 className="h5">DeliveryFailed terminal resolution</h2>
              <select className="form-select" value={resolutionIncidentId} onChange={(event) => setResolutionIncidentId(event.target.value)}>
                <option value="">Chọn delivery incident</option>
                {fulfillment.incidents
                  .filter((incident) => incident.customerChoice === 'TerminalRefund')
                  .map((incident) => <option key={incident.id} value={incident.id}>{incident.incidentType} · {incident.customerChoice || incident.status}</option>)}
              </select>
              <p className="mt-2">FAILED_DELIVERY refund Pending được hệ thống suy ra; ShippingFee không bị khấu trừ.</p>
              <button className="btn btn-outline-danger" type="button" disabled={submitting || !resolutionIncidentId} onClick={() => runAction(
                () => staffOrderService.resolveDeliveryFailure(order.id, {
                  incidentId: resolutionIncidentId,
                  idempotencyKey: idempotencyKey(`delivery-failed:${resolutionIncidentId}`),
                }),
                'Đã ghi nhận DeliveryFailed và nghĩa vụ tiền tương ứng.',
              )}>Hoàn tất delivery failure</button>
            </section>
          )}

          {order.paymentMethod === 'COD' && order.orderStatus === 'Delivered' && order.paymentStatus === 'Unpaid' && order.codDiscrepancyStatus === 'RecoveryInProgress' && order.codRecoveryReceiptId && (
            <div className="row g-2 mt-3 align-items-end">
              <div className="col-md-8">
                <label className="form-label">Mã xác minh đích hoàn</label>
                <input className="form-control" value={destinationReference} onChange={(event) => setDestinationReference(event.target.value)} />
              </div>
              <div className="col-md-4">
                <button className="btn btn-outline-danger" type="button" disabled={submitting} onClick={() => runAction(
                  () => staffOrderService.finalizeCodRecovery(order.id, {
                    goodsRecoveryReceiptId: order.codRecoveryReceiptId,
                    destinationVerified: Boolean(destinationReference),
                    destinationReference,
                  }),
                  'Đã hoàn tất thu hồi COD.',
                )}>Hoàn tất thu hồi COD</button>
              </div>
            </div>
          )}

          {['Pending', 'Confirmed'].includes(order.orderStatus) && (
            <div className="row g-2 mt-3 align-items-end">
              <div className="col-md-8">
                <label className="form-label" htmlFor="staffCancelReason">Lý do hủy đơn</label>
                <input id="staffCancelReason" className="form-control" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required />
              </div>
              <div className="col-md-4">
                <button className="btn btn-outline-danger" type="button" disabled={submitting || !cancelReason.trim()} onClick={() => runAction(
                  () => staffOrderService.cancelOrder(order.id, {
                    cancelReason,
                    idempotencyKey: idempotencyKey(`cancel:${order.id}`),
                  }),
                  'Đã hủy đơn hàng.',
                )}>Hủy đơn</button>
              </div>
            </div>
          )}

          <div className="table-responsive mt-4">
            <table className="table">
              <thead><tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Tạm tính</th></tr></thead>
              <tbody>{(order.details || []).map((item) => (
                <tr key={item._id || item.id}><td>{item.productNameSnapshot}</td><td>{item.quantity}</td><td>{formatCurrency(item.priceSnapshot)}</td><td>{formatCurrency(item.subtotal)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
