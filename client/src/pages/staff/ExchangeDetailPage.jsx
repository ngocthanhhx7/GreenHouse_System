import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import AuthenticatedEvidenceList from '../../components/returnRefund/AuthenticatedEvidenceList.jsx';
import { exchangeService } from '../../services/exchangeService.js';
import {
  translateExchangeStatus,
  translateExchangeResponsibility,
  translateShipmentDirection,
  translateShipmentEventType,
  translateShippingPayer,
} from '../../utils/afterSalesLabels.js';
import {
  getExchangeWorkflowActions,
  getExchangeWorkflowMessage,
} from '../../utils/exchangeUiState.js';

function eventKey() {
  return `staff-shipment:${globalThis.crypto?.randomUUID?.() || Date.now()}`;
}

export default function ExchangeDetailPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [decision, setDecision] = useState('APPROVE');
  const [responsibility, setResponsibility] = useState('SHOP_FAULT');
  const [decisionReason, setDecisionReason] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [shipmentEventType, setShipmentEventType] = useState('DELIVERED');
  const [shipmentOccurredAt, setShipmentOccurredAt] = useState('');
  const [shipmentEvidence, setShipmentEvidence] = useState('');
  const [replacesEventId, setReplacesEventId] = useState('');
  const [resendIncidentShipmentId, setResendIncidentShipmentId] = useState('');
  const [resendCarrier, setResendCarrier] = useState('');
  const [resendTracking, setResendTracking] = useState('');
  const shipmentEventKey = useRef(eventKey());
  const resendKey = useRef(eventKey());
  const retryReservationKey = useRef(eventKey());
  const decisionKey = useRef(eventKey());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    exchangeService.getStaffRequest(id).then(setRequest).catch((err) => setError(err.message));
  }
  useEffect(load, [id]);

  async function submitDecision(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const result = await exchangeService.decideRequest(id, {
        idempotencyKey: decisionKey.current,
        decision,
        responsibility,
        reason: decisionReason,
        payerRationale: decisionReason,
      });
      setRequest(result);
      setMessage(result.status === 'AwaitingExactStockChoice'
        ? 'Đã xác nhận đủ điều kiện nhưng chưa giữ đủ đúng sản phẩm.'
        : 'Đã ghi nhận quyết định.');
    } catch (err) { setError(err.message); }
  }

  async function retryReservation() {
    setError(''); setMessage('');
    try {
      const result = await exchangeService.retryReservation(id, {
        idempotencyKey: retryReservationKey.current,
      });
      setRequest(result);
      retryReservationKey.current = eventKey();
      setMessage(result.status === 'ApprovedAwaitingShipment' ? 'Đã giữ đủ đúng sản phẩm.' : 'Vẫn chưa đủ đúng sản phẩm.');
    } catch (err) { setError(err.message); }
  }

  async function recordShipmentEvent(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const result = await exchangeService.recordStaffShipmentEvent(id, shipmentId, {
        idempotencyKey: shipmentEventKey.current,
        eventType: shipmentEventType,
        occurredAt: new Date(shipmentOccurredAt).toISOString(),
        evidenceReference: shipmentEvidence,
        note: `Staff ghi từ bằng chứng vận chuyển: ${shipmentEvidence}`,
        ...(shipmentEventType === 'CORRECTION' ? { replacesEventId } : {}),
      });
      setRequest(result.request);
      shipmentEventKey.current = eventKey();
      setMessage('Đã ghi sự kiện vận chuyển kèm nguồn và bằng chứng.');
    } catch (err) { setError(err.message); }
  }

  async function resend(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const result = await exchangeService.resendReplacement(id, {
        idempotencyKey: resendKey.current,
        incidentShipmentId: resendIncidentShipmentId,
        carrierName: resendCarrier,
        trackingCode: resendTracking,
        shippedAt: new Date().toISOString(),
      });
      setRequest(result.request);
      resendKey.current = eventKey();
      setMessage(result.shipment ? 'Đã tạo chuyến gửi lại đúng sản phẩm, Shop chịu trách nhiệm.' : 'Chưa đủ đúng sản phẩm; Customer cần chọn chờ hoặc chuyển sang trả hàng.');
    } catch (err) { setError(err.message); }
  }

  if (!request && !error) return <div className="page-center">Đang tải yêu cầu đổi hàng...</div>;
  const workflowActions = getExchangeWorkflowActions(request);
  const workflowMessage = getExchangeWorkflowMessage(request);
  return (
    <div className="surface">
      <div className="page-heading"><h1>Xử lý đổi hàng</h1><Link className="btn btn-outline-success" to="/staff/exchanges">Hàng đợi</Link></div>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {request && (
        <>
          <dl className="row">
            <dt className="col-sm-4">Mã yêu cầu</dt><dd className="col-sm-8">{request.requestCode}</dd>
            <dt className="col-sm-4">Trạng thái</dt><dd className="col-sm-8">{translateExchangeStatus(request.status)}</dd>
            <dt className="col-sm-4">Lý do Customer</dt><dd className="col-sm-8">{request.reason}</dd>
            <dt className="col-sm-4">Trách nhiệm</dt><dd className="col-sm-8">{translateExchangeResponsibility(request.responsibility)}</dd>
            <dt className="col-sm-4">Bên chịu phí vận chuyển</dt><dd className="col-sm-8">{translateShippingPayer(request.shippingPayer)} — thanh toán trực tiếp với đơn vị vận chuyển</dd>
          </dl>
          <AuthenticatedEvidenceList urls={request.evidenceImages} fetchEvidence={exchangeService.fetchEvidence} />
          <h2 className="mt-4">Dòng hàng Customer yêu cầu</h2>
          <ul>{(request.lines || []).map((line) => <li key={line._id}>{line.productNameSnapshot} / {line.productSkuSnapshot} — {line.requestedQuantity}</li>)}</ul>

          {request.status === 'Submitted' && (
            <form className="mt-4" onSubmit={submitDecision}>
              <h2>Quyết định đủ điều kiện</h2>
              <label className="form-label" htmlFor="exchangeDecision">Quyết định</label>
              <select id="exchangeDecision" className="form-select" value={decision} onChange={(event) => setDecision(event.target.value)}>
                <option value="APPROVE">Duyệt nếu giữ đủ đúng sản phẩm</option>
                <option value="REJECT">Từ chối</option>
              </select>
              {decision === 'APPROVE' && (
                <>
                  <label className="form-label mt-2" htmlFor="exchangeResponsibility">Trách nhiệm</label>
                  <select id="exchangeResponsibility" className="form-select" value={responsibility} onChange={(event) => setResponsibility(event.target.value)}>
                    <option value="SHOP_FAULT">Lỗi sản phẩm/Shop giao sai — Shop chịu hai chiều</option>
                    <option value="CUSTOMER_PREFERENCE">Nhu cầu cá nhân được duyệt — Customer chịu hai chiều</option>
                  </select>
                </>
              )}
              <label className="form-label mt-2" htmlFor="exchangeDecisionReason">Lý do quyết định</label>
              <textarea id="exchangeDecisionReason" className="form-control" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} required />
              <button className="btn btn-success mt-2" type="submit">Ghi nhận quyết định</button>
            </form>
          )}
          {workflowMessage && <div className="alert alert-warning mt-3">{workflowMessage}</div>}
          {workflowActions.canRetryReservation && (
            <button className="btn btn-success mt-3" type="button" onClick={retryReservation}>Thử giữ lại đúng sản phẩm</button>
          )}

          {(request.shipments || []).length > 0 && (
            <form className="mt-4" onSubmit={recordShipmentEvent}>
              <h2>Ghi sự kiện vận chuyển từ bằng chứng</h2>
              <label className="form-label" htmlFor="staffShipment">Chuyến hàng</label>
              <select id="staffShipment" className="form-select" value={shipmentId} onChange={(event) => setShipmentId(event.target.value)} required>
                <option value="">Chọn chuyến hàng</option>
                {request.shipments.map((shipment) => <option key={shipment._id} value={shipment._id}>{shipment.trackingCode} — {translateShipmentDirection(shipment.direction)}</option>)}
              </select>
              <label className="form-label mt-2" htmlFor="staffShipmentEvent">Sự kiện</label>
              <select id="staffShipmentEvent" className="form-select" value={shipmentEventType} onChange={(event) => setShipmentEventType(event.target.value)}>
                <option value="DELIVERED">Đã giao</option>
                <option value="LOST">Thất lạc</option>
                <option value="DAMAGED">Hư hỏng khi vận chuyển</option>
                <option value="CORRECTION">Đính chính có truy vết</option>
              </select>
              <label className="form-label mt-2" htmlFor="staffShipmentOccurredAt">Thời điểm trên bằng chứng vận chuyển</label>
              <input
                id="staffShipmentOccurredAt"
                className="form-control"
                type="datetime-local"
                value={shipmentOccurredAt}
                onChange={(event) => setShipmentOccurredAt(event.target.value)}
                required
              />
              {shipmentEventType === 'CORRECTION' && (
                <>
                  <label className="form-label mt-2" htmlFor="replacedShipmentEvent">Sự kiện được đính chính</label>
                  <select id="replacedShipmentEvent" className="form-select" value={replacesEventId} onChange={(event) => setReplacesEventId(event.target.value)} required>
                    <option value="">Chọn sự kiện gốc/khiếu nại</option>
                    {(request.shipmentEvents || []).filter((item) => String(item.shipmentId) === String(shipmentId))
                      .map((item) => <option key={item._id} value={item._id}>{translateShipmentEventType(item.eventType)} — {new Date(item.occurredAt).toLocaleString('vi-VN')}</option>)}
                  </select>
                </>
              )}
              <label className="form-label mt-2" htmlFor="staffShipmentEvidence">Mã/link bằng chứng tracking</label>
              <input id="staffShipmentEvidence" className="form-control" value={shipmentEvidence} onChange={(event) => setShipmentEvidence(event.target.value)} required />
              <button className="btn btn-outline-success mt-2" type="submit">Ghi sự kiện</button>
            </form>
          )}
          {workflowActions.canResend && (
            <form className="mt-4" onSubmit={resend}>
              <h2>Gửi lại do sự cố vận chuyển</h2>
              <div className="alert alert-warning">Giữ nguyên yêu cầu hiện tại; Customer không phải tạo yêu cầu mới hoặc chịu thêm phí.</div>
              <label className="form-label" htmlFor="incidentShipment">Chuyến thay thế gặp sự cố</label>
              <select id="incidentShipment" className="form-select" value={resendIncidentShipmentId} onChange={(event) => setResendIncidentShipmentId(event.target.value)} required>
                <option value="">Chọn chuyến gặp sự cố</option>
                {(request.shipments || []).filter((shipment) => shipment.direction === 'REPLACEMENT_TO_CUSTOMER' && shipment.status === 'Incident')
                  .map((shipment) => <option key={shipment._id} value={shipment._id}>{shipment.trackingCode}</option>)}
              </select>
              <label className="form-label mt-2" htmlFor="resendCarrier">Đơn vị vận chuyển mới</label>
              <input id="resendCarrier" className="form-control" value={resendCarrier} onChange={(event) => setResendCarrier(event.target.value)} required />
              <label className="form-label mt-2" htmlFor="resendTracking">Mã vận đơn mới</label>
              <input id="resendTracking" className="form-control" value={resendTracking} onChange={(event) => setResendTracking(event.target.value)} required />
              <button className="btn btn-success mt-2" type="submit">Gửi lại đúng sản phẩm</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
