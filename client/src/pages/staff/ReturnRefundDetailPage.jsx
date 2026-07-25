import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import AuthenticatedEvidenceList from '../../components/returnRefund/AuthenticatedEvidenceList.jsx';
import { returnRefundService } from '../../services/returnRefundService.js';
import { translateRequestStatus } from '../../utils/formatters.js';
import { createRefundPayoutController, getRefundPayoutUiState } from './refundPayoutController.js';

function localDateTime(value = new Date()) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

function blankPayoutForm() {
  return {
    transferReference: '',
    transferredAt: localDateTime(),
    note: '',
    confirmed: false,
  };
}

function payoutFormErrors(form) {
  const errors = {};
  if (!String(form.transferReference || '').trim()) errors.transferReference = 'Cần mã giao dịch hoặc chứng từ chuyển khoản.';
  if (!form.transferredAt || Number.isNaN(new Date(form.transferredAt).getTime())) errors.transferredAt = 'Cần thời điểm chi trả hợp lệ.';
  const noteLength = String(form.note || '').trim().length;
  if (noteLength < 20 || noteLength > 1000) errors.note = 'Ghi chú đối soát phải có từ 20 đến 1000 ký tự.';
  if (form.confirmed !== true) errors.confirmed = 'Cần xác nhận đã kiểm tra chứng từ trước khi ghi nhận.';
  return errors;
}

function conflictGuidance(error) {
  if (Number(error?.status) === 409) {
    return 'Dữ liệu chi trả đã thay đổi hoặc đang được đối soát. Hệ thống đã tải lại trạng thái mới nhất; hãy kiểm tra lại trước khi thao tác.';
  }
  return error?.message || 'Không thể hoàn tất thao tác chi trả.';
}

export default function ReturnRefundDetailPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({ staffNote: '', destinationReason: '' });
  const [payoutMethod, setPayoutMethod] = useState('Manual');
  const [manualPayout, setManualPayout] = useState(blankPayoutForm);
  const [reconciliation, setReconciliation] = useState({ outcome: 'Unknown', ...blankPayoutForm() });
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controllerRef = useRef(null);

  const loadRequest = useCallback(async (controller = controllerRef.current) => {
    const load = controller?.beginLoad(id);
    if (!load) return null;
    try {
      const result = await returnRefundService.getStaffRequest(id);
      if (!controller.isCurrentLoad(load)) return null;
      setRequest(result);
      setForm((current) => ({ ...current, staffNote: result.staffNote || current.staffNote }));
      return result;
    } catch (err) {
      if (controller.isCurrentLoad(load)) setError(err.message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    const controller = createRefundPayoutController();
    controllerRef.current = controller;
    setRequest(null);
    setError('');
    setMessage('');
    setFieldErrors({});
    setBusy(false);
    setManualPayout(blankPayoutForm());
    setReconciliation({ outcome: 'Unknown', ...blankPayoutForm() });
    loadRequest(controller);
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [id, loadRequest]);

  async function runAction(action, successMessage) {
    const controller = controllerRef.current;
    const command = controller?.beginAction(id);
    if (!controller || !command) return null;
    const isCurrent = () => controllerRef.current === controller
      && controller.isCurrentCommand(command, id);
    let canonicalSuccess = false;
    setBusy(true);
    setError('');
    setMessage('');
    setFieldErrors({});
    try {
      const result = await action();
      const reloaded = await loadRequest(controller);
      if (!isCurrent()) return null;
      if (!reloaded) throw new Error('Không thể tải lại trạng thái chính thức sau thao tác. Vui lòng thử lại với cùng mã lệnh.');
      canonicalSuccess = true;
      setMessage(result?.idempotentReplay ? 'Thao tác này đã được hệ thống ghi nhận trước đó.' : successMessage);
      return result;
    } catch (err) {
      await loadRequest(controller);
      if (isCurrent()) setError(conflictGuidance(err));
      return null;
    } finally {
      if (isCurrent()) {
        controller.settle(command, { succeeded: canonicalSuccess });
        setBusy(false);
      } else {
        controller.settle(command, { succeeded: canonicalSuccess });
      }
    }
  }

  async function runPayoutCommand(command, execute, successMessage, { resetPayout = false } = {}) {
    const controller = controllerRef.current;
    if (!command || !controller) return null;
    const isCurrent = () => controllerRef.current === controller
      && controller.isCurrentCommand(command, id);
    let canonicalSuccess = false;
    setBusy(true);
    setError('');
    setMessage('');
    setFieldErrors({});
    try {
      const result = await execute(command.payload);
      const reloaded = await loadRequest(controller);
      if (!isCurrent()) return null;
      if (!reloaded) throw new Error('Không thể tải lại trạng thái chính thức sau thao tác. Vui lòng thử lại với cùng mã lệnh.');
      canonicalSuccess = true;
      if (resetPayout) setManualPayout(blankPayoutForm());
      setMessage(result?.idempotentReplay ? 'Thao tác này đã được hệ thống ghi nhận trước đó.' : successMessage);
      return result;
    } catch (err) {
      await loadRequest(controller);
      if (isCurrent()) setError(conflictGuidance(err));
      return null;
    } finally {
      if (isCurrent()) {
        controller.settle(command, { succeeded: canonicalSuccess });
        setBusy(false);
      } else {
        controller.settle(command, { succeeded: canonicalSuccess });
      }
    }
  }

  function submitPayOS() {
    const command = controllerRef.current?.beginPayOS(id);
    runPayoutCommand(command, (payload) => returnRefundService.startPayOSPayout(id, payload), 'Đã gửi lệnh chi PayOS. Hệ thống đã khóa thao tác mới cho đến khi có kết quả chính thức.');
  }

  function submitManual(event) {
    event.preventDefault();
    const errors = payoutFormErrors(manualPayout);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Vui lòng kiểm tra đủ chứng từ chuyển khoản thủ công.');
      return;
    }
    const command = controllerRef.current?.beginManual(id, manualPayout);
    runPayoutCommand(command, (payload) => returnRefundService.recordPayoutEvidence(id, payload), 'Đã ghi nhận chứng từ chi trả thủ công theo giá trị hoàn tiền do hệ thống xác định.', { resetPayout: true });
  }

  function submitReconciliation(event) {
    event.preventDefault();
    const errors = payoutFormErrors(reconciliation);
    if (!['Succeeded', 'Failed', 'Unknown'].includes(reconciliation.outcome)) errors.outcome = 'Cần chọn kết quả đối soát hợp lệ.';
    const operationKey = request?.payout?.operationKey;
    if (!operationKey) errors.operationKey = 'Không tìm thấy mã lệnh chi trả cần đối soát.';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Vui lòng hoàn thiện thông tin đối soát cho đúng mã lệnh đang khóa hồ sơ.');
      return;
    }
    const command = controllerRef.current?.beginReconciliation(id, operationKey, reconciliation);
    runPayoutCommand(command, (payload) => returnRefundService.reconcilePayout(id, payload), 'Đã ghi nhận kết quả đối soát cho đúng lệnh chi trả hiện tại.');
  }

  if (!request && !error) return <div className="page-center" role="status">Đang tải yêu cầu...</div>;

  const payoutUi = getRefundPayoutUiState(request, payoutMethod);
  const payout = request?.payout || {};

  return <div className="surface">
    <h1>Chi tiết trả hàng / hoàn tiền</h1>
    {message && <div className="alert alert-success" role="status" aria-live="polite">{message}</div>}
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
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
        <p><strong>Ngân hàng:</strong> {request.destination.bankName}<br /><strong>Số tài khoản để xác minh:</strong> {request.destination.accountNumber || request.destination.maskedAccountNumber}<br /><strong>Chủ tài khoản:</strong> {request.destination.accountHolderName || request.destination.maskedAccountHolder}</p>
        <p><strong>Trạng thái:</strong> {request.destination.status}</p>
        {request.destination.status === 'Submitted' && <div className="d-grid gap-2">
          <label className="form-label" htmlFor="destinationReason">Lý do nếu từ chối</label><input id="destinationReason" className="form-control" value={form.destinationReason} onChange={(event) => setForm((current) => ({ ...current, destinationReason: event.target.value }))} />
          <div className="d-flex gap-2"><button className="btn btn-success" type="button" disabled={busy} onClick={() => runAction(() => returnRefundService.verifyDestination(id, { destinationId: request.destination.id, status: 'Verified' }), 'Đã xác minh thông tin nhận hoàn tiền.')}>Xác minh</button><button className="btn btn-outline-danger" type="button" disabled={busy} onClick={() => runAction(() => returnRefundService.verifyDestination(id, { destinationId: request.destination.id, status: 'Rejected', rejectionReason: form.destinationReason }), 'Đã yêu cầu Customer sửa thông tin.')}>Yêu cầu sửa</button></div>
        </div>}
      </section>}
      {request.payoutIncident && <div className={`alert ${request.payoutIncident.status === 'Open' ? 'alert-danger' : 'alert-secondary'} mt-3`}><strong>Hồ sơ recovery chi trả: {request.payoutIncident.status === 'Open' ? 'Đang mở' : 'Đã xử lý'}</strong><br />Trách nhiệm: {request.payoutIncident.responsibility === 'Customer' ? 'Customer — hệ thống không tự chi lần hai' : 'Shop/đơn vị chi trả — Customer không chịu trách nhiệm'}<br />Lý do: {request.payoutIncident.reportReason}</div>}
      {['Received', 'Completed'].includes(request.status) && request.destination?.status === 'Verified' && <section className="border rounded p-3 mt-3 refund-payout-panel" aria-labelledby="payoutHeading">
        <h2 id="payoutHeading" className="h5">Chi trả hoàn tiền</h2>
        <p className="alert alert-info">Hệ thống tự tính giá trị hoàn tiền từ đơn hàng. Staff không nhập hoặc sửa số tiền.</p>
        {!request.payoutDestinationReady && <div className="alert alert-warning" role="status">Không thể dùng PayOS cho thông tin nhận tiền hiện tại{request.payoutDestinationIssueCode ? ` (${request.payoutDestinationIssueCode})` : ''}. Bạn vẫn có thể ghi nhận chuyển khoản thủ công đã đối soát.</div>}
        {payoutUi.showMethodSelector && <fieldset className="refund-payout-method" disabled={busy}>
          <legend>Phương thức chi trả</legend>
          <div className="d-flex flex-wrap gap-3">
            <label><input type="radio" name="payoutMethod" value="PayOS" checked={payoutMethod === 'PayOS'} onChange={() => setPayoutMethod('PayOS')} disabled={payout.canStartPayOS !== true} /> PayOS trực tuyến</label>
            <label><input type="radio" name="payoutMethod" value="Manual" checked={payoutMethod === 'Manual'} onChange={() => setPayoutMethod('Manual')} disabled={payout.canRecordManualSuccess !== true} /> Chuyển khoản thủ công</label>
          </div>
        </fieldset>}
        {payoutUi.showPayOS && <div className="refund-payout-action mt-3">
          <p>Hãy xác nhận trước khi gửi một lệnh PayOS. Sau khi gửi, chỉ có thể đối soát chính lệnh này.</p>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={submitPayOS}>Xác nhận gửi lệnh chi PayOS</button>
        </div>}
        {payoutUi.showManual && <form className="refund-payout-form mt-3" onSubmit={submitManual}>
          <fieldset disabled={busy}>
            <legend>Ghi nhận chuyển khoản thủ công</legend>
            <div className="refund-payout-grid">
              <div><label className="form-label" htmlFor="manualTransferReference">Mã giao dịch / chứng từ</label><input id="manualTransferReference" className="form-control" value={manualPayout.transferReference} onChange={(event) => setManualPayout((current) => ({ ...current, transferReference: event.target.value }))} aria-invalid={Boolean(fieldErrors.transferReference)} required />{fieldErrors.transferReference && <small className="text-danger">{fieldErrors.transferReference}</small>}</div>
              <div><label className="form-label" htmlFor="manualTransferredAt">Thời điểm chi trả</label><input id="manualTransferredAt" className="form-control" type="datetime-local" value={manualPayout.transferredAt} onChange={(event) => setManualPayout((current) => ({ ...current, transferredAt: event.target.value }))} aria-invalid={Boolean(fieldErrors.transferredAt)} required />{fieldErrors.transferredAt && <small className="text-danger">{fieldErrors.transferredAt}</small>}</div>
            </div>
            <label className="form-label mt-2" htmlFor="manualPayoutNote">Ghi chú đối soát</label><textarea id="manualPayoutNote" className="form-control" minLength="20" maxLength="1000" value={manualPayout.note} onChange={(event) => setManualPayout((current) => ({ ...current, note: event.target.value }))} aria-invalid={Boolean(fieldErrors.note)} required />{fieldErrors.note && <small className="text-danger">{fieldErrors.note}</small>}
            <label className="form-check mt-3"><input className="form-check-input" type="checkbox" checked={manualPayout.confirmed} onChange={(event) => setManualPayout((current) => ({ ...current, confirmed: event.target.checked }))} aria-invalid={Boolean(fieldErrors.confirmed)} /> <span className="form-check-label">Tôi xác nhận đã kiểm tra chứng từ chuyển khoản và thông tin nhận tiền đã xác minh.</span></label>{fieldErrors.confirmed && <small className="text-danger d-block">{fieldErrors.confirmed}</small>}
            <button className="btn btn-success mt-3" type="submit">Ghi nhận chi trả thủ công</button>
          </fieldset>
        </form>}
        {payoutUi.showReconciliation && <form className="refund-payout-form mt-3" onSubmit={submitReconciliation}>
          <fieldset disabled={busy}>
            <legend>Đối soát lệnh chi trả đang chờ</legend>
            <p className="mb-2">Mã lệnh đang khóa hồ sơ: <code>{payout.operationKey}</code></p>
            <div className="refund-payout-grid"><div><label className="form-label" htmlFor="reconciliationOutcome">Kết quả</label><select id="reconciliationOutcome" className="form-select" value={reconciliation.outcome} onChange={(event) => setReconciliation((current) => ({ ...current, outcome: event.target.value }))}><option value="Succeeded">Đã chi thành công</option><option value="Failed">Chi thất bại</option><option value="Unknown">Chưa xác định</option></select></div><div><label className="form-label" htmlFor="reconciliationReference">Mã giao dịch / chứng từ</label><input id="reconciliationReference" className="form-control" value={reconciliation.transferReference} onChange={(event) => setReconciliation((current) => ({ ...current, transferReference: event.target.value }))} required /></div><div><label className="form-label" htmlFor="reconciliationAt">Thời điểm đối soát</label><input id="reconciliationAt" className="form-control" type="datetime-local" value={reconciliation.transferredAt} onChange={(event) => setReconciliation((current) => ({ ...current, transferredAt: event.target.value }))} required /></div></div>
            <label className="form-label mt-2" htmlFor="reconciliationNote">Ghi chú đối soát</label><textarea id="reconciliationNote" className="form-control" minLength="20" maxLength="1000" value={reconciliation.note} onChange={(event) => setReconciliation((current) => ({ ...current, note: event.target.value }))} required />
            <label className="form-check mt-3"><input className="form-check-input" type="checkbox" checked={reconciliation.confirmed} onChange={(event) => setReconciliation((current) => ({ ...current, confirmed: event.target.checked }))} /> <span className="form-check-label">Tôi xác nhận kết quả đối soát này thuộc đúng mã lệnh ở trên.</span></label>
            {(fieldErrors.operationKey || fieldErrors.outcome || fieldErrors.transferReference || fieldErrors.transferredAt || fieldErrors.note || fieldErrors.confirmed) && <small className="text-danger d-block mt-2">{fieldErrors.operationKey || fieldErrors.outcome || fieldErrors.transferReference || fieldErrors.transferredAt || fieldErrors.note || fieldErrors.confirmed}</small>}
            <button className="btn btn-outline-primary mt-3" type="submit">Ghi nhận kết quả đối soát</button>
          </fieldset>
        </form>}
        {payoutUi.readOnly && <div className="alert alert-success mb-0" role="status">Chi trả đã hoàn tất; hồ sơ chỉ còn ở chế độ xem.</div>}
        {!payoutUi.showMethodSelector && !payoutUi.showReconciliation && !payoutUi.readOnly && <div className="alert alert-secondary mb-0" role="status">Chưa có hành động chi trả được server cho phép ở trạng thái hiện tại.</div>}
      </section>}
      {request.status === 'Received' && request.destination?.status !== 'Verified' && <div className="alert alert-warning mt-3">Chưa thể chi trả: cần thông tin nhận hoàn tiền đã được xác minh.</div>}
      {request.status === 'Completed' && <div className="alert alert-success mt-3">Hồ sơ đã hoàn tất từ bằng chứng chi trả được xác minh.</div>}
    </>}
  </div>;
}
