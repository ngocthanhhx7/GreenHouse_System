import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';
import {
  formatCurrency,
  translateOrderStatus,
  translatePaymentMethod,
  translatePaymentStatus,
} from '../../utils/formatters.js';

function blankHandoff() {
  return {
    carrierName: '',
    trackingReference: '',
    handedOffAt: '',
    evidenceReference: '',
  };
}

function blankEvent() {
  return {
    eventType: 'ATTEMPT_FAILED',
    source: 'STAFF_EVIDENCE',
    occurredAt: '',
    evidenceReference: '',
    reason: '',
    replacesEventId: '',
  };
}

export default function StaffOrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [fulfillment, setFulfillment] = useState({ cycles: [], incidents: [] });
  const [checklist, setChecklist] = useState([]);
  const [handoff, setHandoff] = useState(blankHandoff);
  const [shipmentEvent, setShipmentEvent] = useState(blankEvent);
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
        checked: true,
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
    } catch (err) {
      setError(err.message);
      setFieldErrors(Object.fromEntries((err.errors || []).map((entry) => [entry.field, entry.message])));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const activeCycle = fulfillment.cycles?.at(-1);
  const shipment = activeCycle?.shipment;
  const shipmentHistory = activeCycle?.events || [];

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
              <h2 className="h5">Packing checklist · PackingRecord</h2>
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
              <button className="btn btn-success" type="button" disabled={submitting} onClick={() => runAction(
                () => staffOrderService.confirmPacking(order.id, {
                  checklist,
                  idempotencyKey: idempotencyKey(`packing:${activeCycle?.id || order.id}`),
                }),
                'PackingRecord hoàn tất; không gửi thông báo nội bộ cho Customer.',
              )}>Xác nhận đóng gói chính xác</button>
            </section>
          )}

          {order.orderStatus === 'Packed' && (
            <section className="border rounded p-3 mt-4">
              <h2 className="h5">Bàn giao Carrier</h2>
              <div className="row g-2">
                {[
                  ['carrierName', 'Carrier name', 'text'],
                  ['trackingReference', 'Tracking reference', 'text'],
                  ['handedOffAt', 'Handed off at', 'datetime-local'],
                  ['evidenceReference', 'Evidence reference', 'text'],
                ].map(([field, label, type]) => (
                  <label className="col-md-6" key={field}>
                    <span className="form-label">{label}</span>
                    <input className={`form-control ${fieldErrors[field] ? 'is-invalid' : ''}`} type={type} value={handoff[field]} onChange={(event) => setHandoff({ ...handoff, [field]: event.target.value })} required />
                    {fieldErrors[field] && <span className="invalid-feedback">{fieldErrors[field]}</span>}
                  </label>
                ))}
              </div>
              <button className="btn btn-success mt-3" type="button" disabled={submitting} onClick={() => runAction(
                () => staffOrderService.createShipment(order.id, {
                  ...handoff,
                  handedOffAt: new Date(handoff.handedOffAt).toISOString(),
                  idempotencyKey: idempotencyKey(`handoff:${activeCycle?.id || order.id}`),
                }),
                'Đã ghi nhận bàn giao Carrier và Shipment.',
              )}>Tạo Shipment</button>
            </section>
          )}

          {shipment && (
            <section className="border rounded p-3 mt-4">
              <h2 className="h5">Shipment history</h2>
              <p><strong>{shipment.carrierName}</strong> · {shipment.trackingReference}</p>
              <ul>{shipmentHistory.map((entry) => <li key={entry.id}>{entry.eventType} · {entry.occurredAt}</li>)}</ul>
              <div className="row g-2">
                <label className="col-md-4">Action
                  <select className="form-select" value={shipmentEvent.eventType} onChange={(event) => setShipmentEvent({ ...shipmentEvent, eventType: event.target.value })}>
                    <option value="ATTEMPT_FAILED">AttemptFailed</option>
                    <option value="RESCHEDULED">Rescheduled</option>
                    <option value="DELIVERED">Delivered delivery</option>
                    <option value="RETURNED_TO_SHOP">ReturnedToShop</option>
                    <option value="LOST">Lost</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="CORRECTION">Correction</option>
                    <option value="DISPUTED">Dispute</option>
                  </select>
                </label>
                <label className="col-md-4">Occurred at
                  <input className="form-control" type="datetime-local" value={shipmentEvent.occurredAt} onChange={(event) => setShipmentEvent({ ...shipmentEvent, occurredAt: event.target.value })} />
                </label>
                <label className="col-md-4">Evidence
                  <input className="form-control" value={shipmentEvent.evidenceReference} onChange={(event) => setShipmentEvent({ ...shipmentEvent, evidenceReference: event.target.value })} />
                </label>
                <label className="col-md-6">Reason
                  <input className="form-control" value={shipmentEvent.reason} onChange={(event) => setShipmentEvent({ ...shipmentEvent, reason: event.target.value })} />
                </label>
                <label className="col-md-6">Replaces event (Correction / Dispute)
                  <input className="form-control" value={shipmentEvent.replacesEventId} onChange={(event) => setShipmentEvent({ ...shipmentEvent, replacesEventId: event.target.value })} />
                </label>
              </div>
              <button className="btn btn-outline-success mt-3" type="button" disabled={submitting} onClick={() => runAction(
                () => staffOrderService.recordShipmentEvent(shipment.id, {
                  ...shipmentEvent,
                  eventKey: idempotencyKey(`event:${shipment.id}:${shipmentEvent.eventType}`),
                  occurredAt: new Date(shipmentEvent.occurredAt).toISOString(),
                }),
                'Đã thêm sự kiện vào shipment history.',
              )}>Ghi sự kiện</button>
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
