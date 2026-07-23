import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import AuthenticatedEvidenceList from '../../components/returnRefund/AuthenticatedEvidenceList.jsx';
import { returnRefundService } from '../../services/returnRefundService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

function localDateTime(value = new Date()) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

export default function ReturnRefundDetailPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({ staffNote: '', destinationReason: '', providerReference: '', occurredAt: localDateTime(), reconciliationNote: '', incidentReason: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadRequest() {
    setError('');
    try {
      const result = await returnRefundService.getStaffRequest(id);
      setRequest(result);
      setForm((current) => ({ ...current, staffNote: result.staffNote || current.staffNote }));
    } catch (err) { setError(err.message); }
  }

  useEffect(() => { loadRequest(); }, [id]);

  async function runAction(action, successMessage) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(); await loadRequest(); setMessage(successMessage); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (!request && !error) return <div className="page-center">Đang tải yêu cầu...</div>;

  return <div className="surface">
    <h1>Chi tiết trả hàng / hoàn tiền</h1>
    {message && <div className="alert alert-success" aria-live="polite">{message}</div>}
    {error && <div className="alert alert-danger">{error}</div>}
    {request && <>
      <dl className="row">
        <dt className="col-sm-3">Đơn hàng</dt><dd className="col-sm-9">{request.orderCode}</dd>
        <dt className="col-sm-3">Trạng thái</dt><dd className="col-sm-9">{translateRequestStatus(request.status)}</dd>
        <dt className="col-sm-3">Lý do</dt><dd className="col-sm-9">{request.reason}</dd>
        {request.shipByAt && <><dt className="col-sm-3">Hạn bàn giao</dt><dd className="col-sm-9">{new Date(request.shipByAt).toLocaleString('vi-VN')}</dd></>}
        {request.handoffAt && <><dt className="col-sm-3">Bằng chứng bàn giao</dt><dd className="col-sm-9">{request.handoffProofReference} · {new Date(request.handoffAt).toLocaleString('vi-VN')}</dd></>}
      </dl>
      <h2>Sản phẩm trong đơn</h2>
      <ul className="order-item-list">{(request.details || []).map((item) => <li key={item._id || item.productId}><span>{item.productNameSnapshot} x {item.quantity}</span></li>)}</ul>
      <AuthenticatedEvidenceList urls={request.evidenceImages} />
      {request.status === 'AwaitingCODReconciliation' && <div className="alert alert-warning mt-3">{request.holdReason || 'Yêu cầu đang chờ đối soát COD.'}</div>}
      {['New', 'Pending'].includes(request.status) && <div className="row g-3 mt-1">
        <div className="col-12"><label className="form-label" htmlFor="staffNote">Lý do quyết định</label><input id="staffNote" className="form-control" value={form.staffNote} onChange={(event) => setForm((current) => ({ ...current, staffNote: event.target.value }))} required /></div>
        <div className="col-12 d-flex gap-2"><button className="btn btn-success" type="button" disabled={busy} onClick={() => runAction(() => returnRefundService.decideRequest(id, { status: 'Approved', staffNote: form.staffNote }), 'Đã duyệt yêu cầu và mở hạn bàn giao 3 ngày.')}>Duyệt trả hàng</button><button className="btn btn-outline-danger" type="button" disabled={busy} onClick={() => runAction(() => returnRefundService.decideRequest(id, { status: 'Rejected', staffNote: form.staffNote }), 'Đã từ chối yêu cầu.')}>Từ chối</button></div>
      </div>}
      {request.status === 'Approved' && <div className="alert alert-warning mt-3">Đang chờ Customer bàn giao và kho nhận đủ hàng.</div>}
      {request.status === 'Approved' && !request.handoffAt && request.shipByAt && Date.now() > new Date(request.shipByAt).getTime() && <button className="btn btn-outline-danger" type="button" disabled={busy} onClick={() => runAction(() => returnRefundService.expireRequest(id), 'Đã đóng yêu cầu quá hạn bàn giao.')}>Đóng yêu cầu quá hạn</button>}
      {request.destination && <section className="border rounded p-3 mt-3">
        <h2 className="h5">Thông tin nhận hoàn tiền để xác minh</h2>
        <p>
          <strong>Ngân hàng:</strong> {request.destination.bankName}<br />
          {request.destination.bankBin && <><strong>Mã BIN:</strong> {request.destination.bankBin}<br /></>}
          <strong>Số tài khoản để xác minh:</strong> {request.destination.accountNumber || request.destination.maskedAccountNumber}<br />
          <strong>Chủ tài khoản:</strong> {request.destination.accountHolderName || request.destination.maskedAccountHolder}
        </p>
        <p><strong>Trạng thái:</strong> {request.destination.status}</p>
        {request.destination.status === 'Submitted' && <div className="d-grid gap-2">
          <label className="form-label" htmlFor="destinationReason">Lý do nếu từ chối</label><input id="destinationReason" className="form-control" value={form.destinationReason} onChange={(event) => setForm((current) => ({ ...current, destinationReason: event.target.value }))} />
          <div className="d-flex gap-2"><button className="btn btn-success" type="button" disabled={busy} onClick={() => runAction(() => returnRefundService.verifyDestination(id, { destinationId: request.destination.id, status: 'Verified' }), 'Đã xác minh thông tin nhận hoàn tiền.')}>Xác minh</button><button className="btn btn-outline-danger" type="button" disabled={busy} onClick={() => runAction(() => returnRefundService.verifyDestination(id, { destinationId: request.destination.id, status: 'Rejected', rejectionReason: form.destinationReason }), 'Đã yêu cầu Customer sửa thông tin.')}>Yêu cầu sửa</button></div>
        </div>}
      </section>}
      {request.payoutIncident && <div className={`alert ${request.payoutIncident.status === 'Open' ? 'alert-danger' : 'alert-secondary'} mt-3`}>
        <strong>Hồ sơ recovery chi trả: {request.payoutIncident.status === 'Open' ? 'Đang mở' : 'Đã xử lý'}</strong><br />
        Trách nhiệm: {request.payoutIncident.responsibility === 'Customer' ? 'Customer — hệ thống không tự chi lần hai' : 'Shop/đơn vị chi trả — Customer không chịu trách nhiệm'}<br />
        Lý do: {request.payoutIncident.reportReason}
      </div>}
      {request.status === 'Received' && request.destination?.status === 'Verified' && <section className="border rounded p-3 mt-3">
        <h2 className="h5">Chi trả online qua PayOS</h2>
        {(!['Processing', 'Unknown'].includes(request.payoutStatus) || request.payoutIncident?.responsibility === 'ShopOrProvider') && <button className="btn btn-primary" type="button" disabled={busy || !request.destination.bankBin} onClick={() => runAction(
          () => returnRefundService.startPayOSPayout(id, {
            idempotencyKey: `payos:${id}:${request.payoutEvidence?.id || 'initial'}`,
            recoveryIncidentId: request.payoutIncident?.status === 'Open' ? request.payoutIncident.id : undefined,
          }),
          'Đã gửi lệnh chi PayOS; hãy đối soát đến khi có kết quả cuối.',
        )}>{request.payoutIncident?.status === 'Open' ? 'Chi lại qua PayOS theo hồ sơ recovery' : 'Gửi lệnh chi PayOS'}</button>}
        {!request.destination.bankBin && <div className="alert alert-warning mt-2">Không có mã BIN đã xác minh; chỉ có thể dùng quy trình chuyển khoản thủ công.</div>}
        {['Processing', 'Unknown'].includes(request.payoutStatus) && <button className="btn btn-outline-primary" type="button" disabled={busy} onClick={() => runAction(
          () => returnRefundService.reconcilePayOSPayout(id),
          'Đã đối soát trạng thái lệnh chi PayOS.',
        )}>Đối soát lại PayOS</button>}
      </section>}
      {request.status === 'Received' && request.destination?.status === 'Verified' && (!['Processing', 'Unknown'].includes(request.payoutStatus) || request.payoutIncident?.responsibility === 'ShopOrProvider') && <form className="border rounded p-3 mt-3" onSubmit={(event) => {
        event.preventDefault();
        runAction(() => returnRefundService.recordPayoutEvidence(id, {
          idempotencyKey: `manual-payout:${id}:${form.providerReference}`,
          method: 'MANUAL',
          providerReference: form.providerReference,
          status: 'Succeeded',
          occurredAt: form.occurredAt,
          reconciliationNote: form.reconciliationNote,
          recoveryIncidentId: request.payoutIncident?.status === 'Open' ? request.payoutIncident.id : undefined,
        }), 'Đã xác minh chứng từ chi trả và hoàn tất hồ sơ.');
      }}>
        <h2 className="h5">Ghi nhận chứng từ chi trả đã đối soát</h2>
        <div className="alert alert-info">Hệ thống tự tính giá trị cố định từ đơn hàng; CSKH không nhập hoặc sửa giá trị hoàn.</div>
        <label className="form-label" htmlFor="providerReference">Mã giao dịch / chứng từ</label><input id="providerReference" className="form-control" value={form.providerReference} onChange={(event) => setForm((current) => ({ ...current, providerReference: event.target.value }))} required />
        <label className="form-label mt-2" htmlFor="occurredAt">Thời điểm chi trả</label><input id="occurredAt" className="form-control" type="datetime-local" value={form.occurredAt} onChange={(event) => setForm((current) => ({ ...current, occurredAt: event.target.value }))} required />
        <label className="form-label mt-2" htmlFor="reconciliationNote">Ghi chú đối soát</label><textarea id="reconciliationNote" className="form-control" value={form.reconciliationNote} onChange={(event) => setForm((current) => ({ ...current, reconciliationNote: event.target.value }))} required />
        <button className="btn btn-success mt-3" type="submit" disabled={busy}>Xác nhận chứng từ chi trả</button>
      </form>}
      {request.status === 'Received' && request.destination?.status !== 'Verified' && <div className="alert alert-warning mt-3">Chưa thể chi trả: cần thông tin nhận hoàn tiền đã được xác minh.</div>}
      {request.status === 'Completed' && <div className="alert alert-success mt-3">Hồ sơ đã hoàn tất từ bằng chứng chi trả được xác minh.</div>}
      {request.status === 'Completed' && request.payoutEvidence?.status === 'Succeeded' && request.payoutIncident?.status !== 'Open' && <section className="border rounded p-3 mt-3">
        <h2 className="h5">Báo cáo chi trả sai đích</h2>
        <label className="form-label" htmlFor="incidentReason">Kết quả đối soát / lý do</label>
        <textarea id="incidentReason" className="form-control" value={form.incidentReason} onChange={(event) => setForm((current) => ({ ...current, incidentReason: event.target.value }))} required />
        <div className="d-flex flex-wrap gap-2 mt-2">
          <button className="btn btn-outline-warning" type="button" disabled={busy || !form.incidentReason.trim()} onClick={() => runAction(() => returnRefundService.reportPayoutIncident(id, {
            idempotencyKey: `incident:customer:${request.payoutEvidence.id}`,
            cause: 'CUSTOMER_CONFIRMED_DESTINATION',
            reason: form.incidentReason,
          }), 'Đã mở hồ sơ hỗ trợ; hệ thống không tự chi lần hai.')}>Customer đã xác nhận sai tài khoản</button>
          <button className="btn btn-outline-danger" type="button" disabled={busy || !form.incidentReason.trim()} onClick={() => runAction(() => returnRefundService.reportPayoutIncident(id, {
            idempotencyKey: `incident:internal:${request.payoutEvidence.id}`,
            cause: 'STAFF_SYSTEM_PROVIDER_MISMATCH',
            reason: form.incidentReason,
          }), 'Đã mở lại hồ sơ; Customer không chịu trách nhiệm.')}>Shop/PayOS chuyển sai đích</button>
        </div>
      </section>}
    </>}
  </div>;
}
