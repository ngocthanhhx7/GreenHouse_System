import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import OrderProgress from '../../components/order/OrderProgress.jsx';
import OperationalEvidenceUploader from '../../components/common/OperationalEvidenceUploader.jsx';
import { resolveMediaUrl } from '../../services/apiClient.js';
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

const DELIVERY_FAILURE_REASONS = [
  ['CUSTOMER_UNREACHABLE', 'Không liên hệ được khách hàng'],
  ['CUSTOMER_REFUSED', 'Khách hàng từ chối nhận'],
  ['ADDRESS_UNDELIVERABLE', 'Địa chỉ không thể giao'],
  ['OTHER_DELIVERY_FAILURE', 'Lý do không giao khác'],
];
const DELIVERY_OUTCOMES_REQUIRING_REASON = new Set(['ATTEMPT_FAILED', 'RETURNED_TO_SHOP']);

function blankHandoff() {
  return {
    carrierName: '',
    trackingReference: '',
    handedOffAt: toLocalDateTimeValue(),
    evidenceReference: '',
    note: '',
  };
}

function blankEvent() {
  return {
    eventType: 'DELIVERED',
    source: 'STAFF_EVIDENCE',
    occurredAt: toLocalDateTimeValue(),
    evidenceReferences: [],
    codCollectionResult: '',
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
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  useEffect(() => { loadOrder(); }, [id]);

  async function runAction(action, successMessage, onSuccess) {
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
      const reloaded = await loadOrder();
      if (reloaded) onSuccess?.(result);
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

  const manualCodAllowed = fulfillment.capabilities?.manualCodReconciliation === true;

  async function submitShipmentEvent() {
    const validationErrors = {};
    if (!shipmentEvent.occurredAt) {
      validationErrors.occurredAt = 'Vui lòng chọn thời điểm xảy ra.';
    }
    if (!shipmentEvent.evidenceReferences.length) {
      validationErrors.evidenceReferences = 'Vui lòng tải ít nhất 1 ảnh dẫn chứng.';
    }
    if (
      manualCodAllowed
      && order.paymentMethod === 'COD'
      && shipmentEvent.eventType === 'DELIVERED'
      && !shipmentEvent.codCollectionResult
    ) {
      validationErrors.codCollectionResult = 'Vui lòng chọn kết quả thu COD.';
    }
    if (
      DELIVERY_OUTCOMES_REQUIRING_REASON.has(shipmentEvent.eventType)
      && !shipmentEvent.reason
    ) {
      validationErrors.reason = 'Vui lòng chọn lý do không giao được.';
    }
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setError('Vui lòng kiểm tra các trường kết quả giao hàng.');
      return;
    }

    const command = `event:${shipment.id}:${shipmentEvent.eventType}`;
    await runAction(
      () => staffOrderService.recordShipmentEvent(shipment.id, {
        ...shipmentEvent,
        evidenceReferences: shipmentEvent.evidenceReferences.slice(0, 5),
        eventKey: idempotencyKey(command),
        occurredAt: new Date(shipmentEvent.occurredAt).toISOString(),
      }),
      'Đã ghi nhận kết quả giao hàng và chứng cứ.',
      () => {
        commandKeys.current.delete(command);
        setShipmentEvent(blankEvent());
      },
    );
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
            <div className="col-md-6"><strong>Địa chỉ nhận hàng:</strong> {order.shippingAddress}</div>
            <div className="col-md-3"><strong>Phí vận chuyển:</strong> {formatCurrency(order.shippingFee)}</div>
            <div className="col-md-3"><strong>Đã quyết toán nghĩa vụ tài chính:</strong> {String(order.moneyObligationsSettled ?? true)}</div>
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
                Lượt xuất kho {order.stockExportRequest.cycleId || 'ban đầu'}: {order.stockExportRequest.status}
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
                  ['carrierName', 'Tên đơn vị vận chuyển', 'text'],
                  ['trackingReference', 'Mã vận đơn', 'text'],
                  ['handedOffAt', 'Thời gian bàn giao', 'datetime-local'],
                  ['evidenceReference', 'Mã dẫn chứng', 'text'],
                ].map(([field, label, type]) => (
                  <label className="col-md-6" key={field}>
                    <span className="form-label">{label}</span>
                    <input className={`form-control ${fieldErrors[field] ? 'is-invalid' : ''}`} type={type} value={handoff[field]} onChange={(event) => setHandoff({ ...handoff, [field]: event.target.value })} required />
                    {fieldErrors[field] && <span className="invalid-feedback">{fieldErrors[field]}</span>}
                  </label>
                ))}
                <label className="col-12">
                  <span className="form-label">Ghi chú bàn giao (không bắt buộc)</span>
                  <textarea
                    className="form-control"
                    maxLength={1000}
                    value={handoff.note}
                    onChange={(event) => setHandoff({ ...handoff, note: event.target.value })}
                  />
                </label>
              </div>
              <button className="btn btn-success mt-3" type="button" disabled={submitting} onClick={submitHandoff}>
                Xác nhận bàn giao và bắt đầu giao hàng
              </button>
            </section>
          )}

          {shipment && (
            <section className="border rounded p-3 mt-4">
              <h2 className="h5">Lịch sử giao hàng</h2>
              <p><strong>{shipment.carrierName}</strong> · {shipment.trackingReference}</p>
              {shipment.note && <p className="text-secondary">Ghi chú bàn giao: {shipment.note}</p>}
              <ul>{shipmentHistory.map((entry) => (
                <li className="mb-2" key={entry.id}>
                  <span>{entry.eventType} · {entry.occurredAt}{entry.reason ? ` · ${entry.reason}` : ''}</span>
                  {entry.evidenceReferences?.length > 0 && (
                    <div className="d-flex flex-wrap gap-2 mt-1">
                      {entry.evidenceReferences.map((url, index) => (
                        <a href={resolveMediaUrl(url)} key={url} target="_blank" rel="noreferrer">
                          <img
                            src={resolveMediaUrl(url)}
                            alt={`Dẫn chứng đã lưu ${index + 1}`}
                            width="88"
                            height="72"
                            style={{ objectFit: 'cover', borderRadius: 8 }}
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}</ul>
              {order.orderStatus === 'Shipped' && (
                <div className="row g-2">
                <label className="col-md-6">Kết quả giao hàng
                  <select className="form-select" value={shipmentEvent.eventType} onChange={(event) => setShipmentEvent({
                    ...shipmentEvent,
                    eventType: event.target.value,
                    codCollectionResult: event.target.value === 'DELIVERED' ? shipmentEvent.codCollectionResult : '',
                    reason: DELIVERY_OUTCOMES_REQUIRING_REASON.has(event.target.value)
                      ? shipmentEvent.reason
                      : '',
                  })}>
                    <option value="ATTEMPT_FAILED">Thử giao thất bại</option>
                    <option value="RESCHEDULED">Hẹn lại lịch giao</option>
                    <option value="DELIVERED">Giao thành công</option>
                    <option value="RETURNED_TO_SHOP">Không thể giao · hàng đã hoàn về</option>
                    <option value="LOST">Thất lạc</option>
                    <option value="DAMAGED">Hư hỏng</option>
                    <option value="CORRECTION">Đính chính chứng cứ</option>
                    <option value="DISPUTED">Tranh chấp kết quả</option>
                  </select>
                </label>
                <label className="col-md-6">Thời điểm xảy ra
                  <input className={`form-control ${fieldErrors.occurredAt ? 'is-invalid' : ''}`} type="datetime-local" value={shipmentEvent.occurredAt} onChange={(event) => setShipmentEvent({ ...shipmentEvent, occurredAt: event.target.value })} />
                  {fieldErrors.occurredAt && <span className="invalid-feedback">{fieldErrors.occurredAt}</span>}
                </label>
                {manualCodAllowed && order.paymentMethod === 'COD' && shipmentEvent.eventType === 'DELIVERED' && (
                  <label className="col-md-6">Kết quả đối soát COD
                    <select className={`form-select ${fieldErrors.codCollectionResult ? 'is-invalid' : ''}`} value={shipmentEvent.codCollectionResult} onChange={(event) => setShipmentEvent({ ...shipmentEvent, codCollectionResult: event.target.value })}>
                      <option value="">Chọn kết quả thu tiền</option>
                      <option value="COLLECTED">Đã thu đủ COD</option>
                      <option value="NOT_COLLECTED">Chưa thu được COD</option>
                    </select>
                    {fieldErrors.codCollectionResult && <span className="invalid-feedback">{fieldErrors.codCollectionResult}</span>}
                    <span className="form-text">Số tiền do hệ thống suy ra từ COD dự kiến, nhân viên không nhập thủ công.</span>
                  </label>
                )}
                <div className="col-12">
                  <OperationalEvidenceUploader
                    images={shipmentEvent.evidenceReferences}
                    onChange={(nextUrls) => setShipmentEvent({
                      ...shipmentEvent,
                      evidenceReferences: nextUrls.slice(0, 5),
                    })}
                    label="Ảnh dẫn chứng giao hàng / COD (tối đa 5 ảnh)"
                    disabled={submitting}
                  />
                  {fieldErrors.evidenceReferences && <div className="text-danger small mt-1">{fieldErrors.evidenceReferences}</div>}
                </div>
                {DELIVERY_OUTCOMES_REQUIRING_REASON.has(shipmentEvent.eventType) ? (
                  <label className="col-md-6">Lý do không giao được
                    <select className={`form-select ${fieldErrors.reason ? 'is-invalid' : ''}`} value={shipmentEvent.reason} onChange={(event) => setShipmentEvent({ ...shipmentEvent, reason: event.target.value })}>
                      <option value="">Chọn lý do</option>
                      {DELIVERY_FAILURE_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    {fieldErrors.reason && <span className="invalid-feedback">{fieldErrors.reason}</span>}
                  </label>
                ) : (
                  <label className="col-md-6">Ghi chú
                    <input className={`form-control ${fieldErrors.reason ? 'is-invalid' : ''}`} value={shipmentEvent.reason} onChange={(event) => setShipmentEvent({ ...shipmentEvent, reason: event.target.value })} />
                    {fieldErrors.reason && <span className="invalid-feedback">{fieldErrors.reason}</span>}
                  </label>
                )}
                <label className="col-md-6">Sự kiện được thay thế (đính chính / tranh chấp)
                  <input className="form-control" value={shipmentEvent.replacesEventId} onChange={(event) => setShipmentEvent({ ...shipmentEvent, replacesEventId: event.target.value })} />
                </label>
                </div>
              )}
              {order.orderStatus === 'Shipped' && (
                <button className="btn btn-outline-success mt-3" type="button" disabled={submitting} onClick={submitShipmentEvent}>Ghi nhận kết quả</button>
              )}
              {order.orderStatus === 'Delivered' && (
                <div className="alert alert-success mt-3 mb-0">
                  <strong>Đơn hàng đã giao thành công.</strong> Customer hiện có thể xem trạng thái Đã giao trong lịch sử mua hàng.
                </div>
              )}
            </section>
          )}

          <section className="border rounded p-3 mt-4">
            <h2 className="h5">Phiên bản địa chỉ giao hàng</h2>
            <p>Bằng chứng ĐVVC / chấp nhận từ ĐVVC là bắt buộc sau khi đã bàn giao.</p>
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
              'Đã thêm địa chỉ giao hàng mới.',
            )}>Thêm đính chính địa chỉ</button>
          </section>

          {order.paymentMethod === 'COD' && (
            <div className={`alert mt-4 ${order.codDiscrepancyStatus === 'Open' ? 'alert-warning' : 'alert-secondary'}`}>
              <strong>Số tiền COD dự kiến:</strong> {formatCurrency(order.codExpectedAmount)}
              {' · '}<strong>Số tiền đã thu từ khách:</strong> {formatCurrency(order.customerCollectedAmount)}
              {' · '}<strong>Số tiền ĐVVC đã đối soát:</strong> {formatCurrency(order.carrierSettlementAmount)}
              <div>Trạng thái lệch tiền COD: {order.codDiscrepancyStatus}; Trạng thái đối soát: {order.settlementReconciliationStatus}</div>
              {order.codRecoveryReceiptId && <div>Mã phiếu nhận hàng hoàn COD: {order.codRecoveryReceiptId}</div>}
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
              <h2 className="h5">Xử lý kết thúc giao hàng thất bại</h2>
              <select className="form-select" value={resolutionIncidentId} onChange={(event) => setResolutionIncidentId(event.target.value)}>
                <option value="">Chọn sự cố giao hàng</option>
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
