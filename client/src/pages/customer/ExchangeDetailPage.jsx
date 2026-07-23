import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import AuthenticatedEvidenceList from '../../components/returnRefund/AuthenticatedEvidenceList.jsx';
import { exchangeService } from '../../services/exchangeService.js';
import {
  translateExchangeStatus,
  translateShipmentDirection,
  translateShipmentStatus,
  translateShippingPayer,
} from '../../utils/afterSalesLabels.js';
import {
  getExchangeWorkflowActions,
  getExchangeWorkflowMessage,
} from '../../utils/exchangeUiState.js';

function key(prefix) {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() || Date.now()}`;
}

export default function ExchangeDetailPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [proofReference, setProofReference] = useState('');
  const [disputeShipmentId, setDisputeShipmentId] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState('');
  const [disputeNote, setDisputeNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const handoffKey = useRef(key('exchange-handoff'));
  const cancelKey = useRef(key('exchange-cancel'));
  const choiceKey = useRef(key('exchange-choice'));
  const disputeKey = useRef(key('exchange-dispute'));

  function load() {
    exchangeService.getCustomerRequest(id).then(setRequest).catch((err) => setError(err.message));
  }

  useEffect(load, [id]);

  async function submitHandoff(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const result = await exchangeService.recordHandoffProof(id, {
        idempotencyKey: handoffKey.current,
        proofReference,
        handoffAt: new Date().toISOString(),
      });
      setRequest(result);
      setMessage(result.idempotentReplay ? 'Bằng chứng bàn giao đã được ghi nhận trước đó.' : 'Đã ghi nhận bàn giao hàng.');
    } catch (err) { setError(err.message); }
  }

  async function cancel() {
    setError(''); setMessage('');
    try {
      const result = await exchangeService.cancelRequest(id, { idempotencyKey: cancelKey.current });
      setRequest(result);
      setMessage('Đã hủy yêu cầu đổi hàng trước khi bàn giao.');
    } catch (err) { setError(err.message); }
  }

  async function choose(choice) {
    setError(''); setMessage('');
    try {
      const result = await exchangeService.chooseStockOption(id, {
        idempotencyKey: choiceKey.current,
        choice,
      });
      setRequest(result);
      choiceKey.current = key('exchange-choice');
      setMessage(choice === 'WAIT' ? 'Đã chọn chờ đúng sản phẩm.' : 'Đã chuyển sang quy trình trả hàng/hoàn tiền.');
    } catch (err) { setError(err.message); }
  }

  async function reportDispute(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const deliveredEvent = [...(request.shipmentEvents || [])].reverse().find((item) => (
        String(item.shipmentId) === String(disputeShipmentId) && item.eventType === 'DELIVERED'
      ));
      if (!deliveredEvent) throw new Error('Không tìm thấy sự kiện giao hàng cần khiếu nại.');
      const result = await exchangeService.reportShipmentDispute(id, disputeShipmentId, {
        idempotencyKey: disputeKey.current,
        replacesEventId: deliveredEvent._id,
        occurredAt: new Date().toISOString(),
        evidenceReference: disputeEvidence,
        note: disputeNote,
      });
      setRequest(result.request);
      disputeKey.current = key('exchange-dispute');
      setMessage('Đã ghi nhận khiếu nại thời điểm giao hàng, không xóa bằng chứng gốc.');
    } catch (err) { setError(err.message); }
  }

  if (!request && !error) return <div className="page-center">Đang tải yêu cầu đổi hàng...</div>;
  const workflowActions = getExchangeWorkflowActions(request);
  const workflowMessage = getExchangeWorkflowMessage(request);
  return (
    <div className="surface">
      <div className="page-heading"><h1>Chi tiết đổi hàng</h1><Link className="btn btn-outline-success" to="/exchanges">Danh sách</Link></div>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {request && (
        <>
          <dl className="row">
            <dt className="col-sm-4">Mã yêu cầu</dt><dd className="col-sm-8">{request.requestCode}</dd>
            <dt className="col-sm-4">Trạng thái</dt><dd className="col-sm-8">{translateExchangeStatus(request.status)}</dd>
            <dt className="col-sm-4">Lý do</dt><dd className="col-sm-8">{request.reason}</dd>
            <dt className="col-sm-4">Hạn gửi yêu cầu</dt><dd className="col-sm-8">{new Date(request.deadlineAt).toLocaleString('vi-VN')}</dd>
            <dt className="col-sm-4">Bên chịu phí vận chuyển</dt><dd className="col-sm-8">{translateShippingPayer(request.shippingPayer)}</dd>
            <dt className="col-sm-4">Hạn bàn giao</dt><dd className="col-sm-8">{request.shipByAt ? new Date(request.shipByAt).toLocaleString('vi-VN') : 'Chưa có'}</dd>
          </dl>
          {request.holdReason && <div className="alert alert-warning">{request.holdReason}</div>}
          {request.decisionReason && <div className="alert alert-info">Kết quả Staff: {request.decisionReason}</div>}
          <h2>Sản phẩm đổi</h2>
          <ul>{(request.lines || []).map((line) => <li key={line._id}>{line.productNameSnapshot} — {line.requestedQuantity}</li>)}</ul>
          <AuthenticatedEvidenceList urls={request.evidenceImages} fetchEvidence={exchangeService.fetchEvidence} />

          {request.status === 'ApprovedAwaitingShipment' && (
            <form className="mt-3" onSubmit={submitHandoff}>
              <label className="form-label" htmlFor="exchangeHandoff">Mã vận đơn/bằng chứng bàn giao</label>
              <input id="exchangeHandoff" className="form-control" value={proofReference} onChange={(event) => setProofReference(event.target.value)} required />
              <button className="btn btn-success mt-2" type="submit">Ghi nhận đã bàn giao</button>
              <button className="btn btn-outline-danger mt-2 ms-2" type="button" onClick={cancel}>Hủy trước khi bàn giao</button>
            </form>
          )}
          {['Submitted', 'AwaitingExactStockChoice', 'WaitingForExactStock'].includes(request.status) && (
            <button className="btn btn-outline-danger mt-2" type="button" onClick={cancel}>Hủy yêu cầu</button>
          )}
          {workflowMessage && <div className="alert alert-warning mt-3">{workflowMessage}</div>}
          {workflowActions.canWaitOrConvert && (
            <div className="mt-3">
              <button className="btn btn-outline-success me-2" type="button" onClick={() => choose('WAIT')}>Chờ đúng sản phẩm</button>
              <button className="btn btn-outline-danger" type="button" onClick={() => choose('CONVERT_TO_RETURN')}>Chuyển sang trả hàng/hoàn tiền</button>
            </div>
          )}
          <section className="mt-4">
            <h2>Kết quả kiểm hàng</h2>
            {(request.inspections || []).length
              ? <ul>{request.inspections.map((inspection) => <li key={inspection._id}>Chấp nhận {inspection.acceptedSellableQuantity + inspection.acceptedDamagedQuantity}, từ chối {inspection.rejectedQuantity}</li>)}</ul>
              : <p className="text-muted">Chưa có kết quả kiểm hàng.</p>}
          </section>
          <section className="mt-4">
            <h2>Vận chuyển</h2>
            {(request.shipments || []).length
              ? <ul>{request.shipments.map((shipment) => <li key={shipment._id}>{translateShipmentDirection(shipment.direction)}: {shipment.trackingCode} — {translateShipmentStatus(shipment.status)}</li>)}</ul>
              : <p className="text-muted">Chưa có chuyến hàng ra.</p>}
          </section>
          {(request.shipments || []).some((shipment) => shipment.status === 'Delivered') && (
            <form className="mt-4" onSubmit={reportDispute}>
              <h2>Khiếu nại thời điểm giao hàng</h2>
              <div className="alert alert-info">Bằng chứng giao hàng gốc vẫn được giữ; Staff chỉ có thể đính chính bằng một sự kiện có truy vết.</div>
              <label className="form-label" htmlFor="disputeShipment">Chuyến hàng đã giao</label>
              <select id="disputeShipment" className="form-select" value={disputeShipmentId} onChange={(event) => setDisputeShipmentId(event.target.value)} required>
                <option value="">Chọn chuyến hàng</option>
                {request.shipments.filter((shipment) => shipment.status === 'Delivered')
                  .map((shipment) => <option key={shipment._id} value={shipment._id}>{shipment.trackingCode}</option>)}
              </select>
              <label className="form-label mt-2" htmlFor="disputeEvidence">Mã/link bằng chứng</label>
              <input id="disputeEvidence" className="form-control" value={disputeEvidence} onChange={(event) => setDisputeEvidence(event.target.value)} required />
              <label className="form-label mt-2" htmlFor="disputeNote">Nội dung khiếu nại</label>
              <textarea id="disputeNote" className="form-control" value={disputeNote} onChange={(event) => setDisputeNote(event.target.value)} required />
              <button className="btn btn-outline-danger mt-2" type="submit">Gửi khiếu nại có truy vết</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
