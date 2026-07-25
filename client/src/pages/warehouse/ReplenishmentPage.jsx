import { useEffect, useState } from 'react';

import OperationalEvidenceUploader from '../../components/common/OperationalEvidenceUploader.jsx';
import { inventoryService } from '../../services/inventoryService.js';
import { replenishmentService } from '../../services/replenishmentService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

function commandKey(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

export default function ReplenishmentPage() {
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ inventoryId: '', quantity: 20, reason: '', evidence: [], requestKey: '' });
  const [requestInputs, setRequestInputs] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [inventoryData, requestData] = await Promise.all([
        inventoryService.listLowStock(),
        replenishmentService.listWarehouseRequests(),
      ]);
      setInventory(inventoryData.items || []);
      setRequests(requestData.items || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  function updateRequestInput(id, field, value) {
    setRequestInputs((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function createRequest(event) {
    event.preventDefault();
    if (!form.evidence.length) { setError('Vui lòng tải ít nhất 1 ảnh dẫn chứng cho yêu cầu bổ sung hàng.'); return; }
    const key = form.requestKey || commandKey(`replenishment-${form.inventoryId}`);
    if (!form.requestKey) setForm((current) => ({ ...current, requestKey: key }));
    setSubmitting((current) => ({ ...current, create: true }));
    setError(''); setMessage('');
    try {
      const result = await replenishmentService.createWarehouseRequest({
        inventoryId: form.inventoryId,
        quantity: Number(form.quantity),
        reason: form.reason,
        evidence: form.evidence,
        idempotencyKey: key,
      });
      setForm((current) => ({ ...current, reason: '', evidence: [], requestKey: '' }));
      setMessage(result.replay
        ? 'Yêu cầu trùng đã trả về phiếu bổ sung được tạo trước đó.'
        : 'Đã tạo yêu cầu bổ sung hàng.');
      await loadData();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, create: false }));
    }
  }

  async function receiveRequest(request) {
    const values = requestInputs[request.id] || {};
    const deliveredQuantity = Number(values.deliveredQuantity);
    const acceptedSellableQuantity = Number(values.acceptedSellableQuantity);
    const rejectedQuantity = Number(values.rejectedQuantity);
    if (deliveredQuantity !== acceptedSellableQuantity + rejectedQuantity) {
      setError('Số lượng giao phải bằng tổng số lượng chấp nhận và từ chối.'); return;
    }
    if (rejectedQuantity > 0 && !String(values.rejectedReason || '').trim()) {
      setError('Vui lòng nhập lý do khi có sản phẩm bị từ chối.'); return;
    }
    if (!(values.receiptEvidence || []).length) {
      setError('Vui lòng tải ít nhất 1 ảnh dẫn chứng nhận hàng.'); return;
    }
    const key = values.receiptKey || commandKey(`receipt-${request.id}`);
    if (!values.receiptKey) updateRequestInput(request.id, 'receiptKey', key);
    setSubmitting((current) => ({ ...current, [`receipt-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      const result = await replenishmentService.receiveWarehouseRequest(request.id, {
        supplierReference: values.supplierReference,
        deliveryReference: values.deliveryReference,
        deliveredQuantity,
        acceptedSellableQuantity,
        rejectedQuantity,
        rejectedReason: values.rejectedReason,
        evidence: values.receiptEvidence,
        idempotencyKey: key,
      });
      setRequestInputs((current) => ({
        ...current,
        [request.id]: { ...current[request.id], receiptKey: '', receiptEvidence: [] },
      }));
      setMessage(result.replay
        ? 'Lần ghi nhận trùng đã trả về phiếu nhận hàng trước đó.'
        : `Đã ghi nhận hàng về cho ${request.productName}.`);
      await loadData();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`receipt-${request.id}`]: false }));
    }
  }

  async function withdrawRequest(request) {
    const values = requestInputs[request.id] || {};
    if (!String(values.withdrawReason || '').trim()) { setError('Vui lòng nhập lý do rút yêu cầu.'); return; }
    setSubmitting((current) => ({ ...current, [`withdraw-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      await replenishmentService.withdrawWarehouseRequest(request.id, { reason: values.withdrawReason });
      setMessage('Đã rút yêu cầu bổ sung đang chờ duyệt.');
      await loadData();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`withdraw-${request.id}`]: false }));
    }
  }

  async function requestShortClosure(request) {
    const values = requestInputs[request.id] || {};
    if (!String(values.shortClosureReason || '').trim() || !(values.shortClosureEvidence || []).length) {
      setError('Vui lòng nhập lý do và tải ảnh dẫn chứng chốt nhận thiếu.'); return;
    }
    setSubmitting((current) => ({ ...current, [`short-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      await replenishmentService.requestShortClosure(request.id, {
        reason: values.shortClosureReason,
        evidence: values.shortClosureEvidence,
      });
      setRequestInputs((current) => ({
        ...current,
        [request.id]: { ...current[request.id], shortClosureReason: '', shortClosureEvidence: [] },
      }));
      setMessage('Đã gửi đề nghị chốt nhận thiếu để quản trị viên quyết định.');
      await loadData();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`short-${request.id}`]: false }));
    }
  }

  async function correctReceipt(request) {
    const values = requestInputs[request.id] || {};
    const correction = Number(values.acceptedQuantityCorrection);
    if (!Number.isInteger(correction) || correction === 0
      || !String(values.correctionReason || '').trim()
      || !(values.correctionEvidence || []).length) {
      setError('Vui lòng nhập số lượng điều chỉnh khác 0, lý do và ảnh dẫn chứng.'); return;
    }
    const key = values.correctionKey || commandKey(`correction-${request.id}`);
    if (!values.correctionKey) updateRequestInput(request.id, 'correctionKey', key);
    setSubmitting((current) => ({ ...current, [`correction-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      const result = await replenishmentService.correctReceipt(request.id, {
        correctionOf: values.correctionOf,
        acceptedQuantityCorrection: correction,
        reason: values.correctionReason,
        evidence: values.correctionEvidence,
        idempotencyKey: key,
      });
      setRequestInputs((current) => ({
        ...current,
        [request.id]: { ...current[request.id], correctionKey: '', correctionEvidence: [] },
      }));
      setMessage(result.replay
        ? 'Lần điều chỉnh trùng đã trả về phiếu điều chỉnh trước đó.'
        : 'Đã ghi nhận điều chỉnh phiếu nhận bằng một biến động bù trừ.');
      await loadData();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`correction-${request.id}`]: false }));
    }
  }

  return <div className="surface">
    <h1>Bổ sung hàng</h1>
    {error && <div className="alert alert-danger">{error}</div>}
    {message && <div className="alert alert-success">{message}</div>}
    <form className="admin-form compact" onSubmit={createRequest}>
      <select className="form-select" value={form.inventoryId} onChange={(event) => setForm((current) => ({ ...current, inventoryId: event.target.value }))} required><option value="">Chọn sản phẩm sắp hết</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.productName} ({item.availableQuantity} khả dụng / ngưỡng {item.effectiveThreshold ?? item.lowStockThreshold})</option>)}</select>
      <input className="form-control" type="number" min="1" aria-label="Số lượng cần bổ sung" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required />
      <input className="form-control" placeholder="Lý do yêu cầu" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required />
      <OperationalEvidenceUploader images={form.evidence} onChange={(images) => setForm((current) => ({ ...current, evidence: images }))} label="Ảnh dẫn chứng yêu cầu" disabled={submitting.create} />
      <button className="btn btn-success" type="submit" disabled={submitting.create}>{submitting.create ? 'Đang gửi…' : 'Tạo yêu cầu'}</button>
    </form>
    <div className="table-responsive mt-4"><table className="table"><thead><tr><th>Sản phẩm</th><th>Được duyệt / đã nhận</th><th>Trạng thái</th><th>Thao tác kho</th></tr></thead><tbody>
      {requests.map((request) => {
        const values = requestInputs[request.id] || {};
        const canReceive = ['Approved', 'PartiallyReceived'].includes(request.status);
        return <tr key={request.id}><td>{request.productName}</td><td>{request.approvedQuantity ?? request.quantity} / {request.netAcceptedQuantity ?? request.receivedQuantity ?? 0}</td><td>{translateRequestStatus(request.status)}</td><td className="d-grid gap-2">
          {request.status === 'PendingApproval' && <><input className="form-control form-control-sm" placeholder="Lý do rút yêu cầu" value={values.withdrawReason || ''} onChange={(event) => updateRequestInput(request.id, 'withdrawReason', event.target.value)} /><button className="btn btn-outline-secondary btn-sm" type="button" disabled={submitting[`withdraw-${request.id}`]} onClick={() => withdrawRequest(request)}>{submitting[`withdraw-${request.id}`] ? 'Đang rút…' : 'Rút yêu cầu'}</button></>}
          {canReceive && <div className="d-grid gap-1 border rounded p-2"><strong>Ghi nhận hàng về</strong><input className="form-control form-control-sm" placeholder="Mã nhà cung cấp" value={values.supplierReference || ''} onChange={(event) => updateRequestInput(request.id, 'supplierReference', event.target.value)} required /><input className="form-control form-control-sm" placeholder="Mã phiếu giao" value={values.deliveryReference || ''} onChange={(event) => updateRequestInput(request.id, 'deliveryReference', event.target.value)} required /><input className="form-control form-control-sm" type="number" min="0" placeholder="Số lượng giao" value={values.deliveredQuantity || ''} onChange={(event) => updateRequestInput(request.id, 'deliveredQuantity', event.target.value)} required /><input className="form-control form-control-sm" type="number" min="0" placeholder="Số lượng chấp nhận để bán" value={values.acceptedSellableQuantity || ''} onChange={(event) => updateRequestInput(request.id, 'acceptedSellableQuantity', event.target.value)} required /><input className="form-control form-control-sm" type="number" min="0" placeholder="Số lượng từ chối" value={values.rejectedQuantity || ''} onChange={(event) => updateRequestInput(request.id, 'rejectedQuantity', event.target.value)} required /><input className="form-control form-control-sm" placeholder="Lý do từ chối (khi có)" value={values.rejectedReason || ''} onChange={(event) => updateRequestInput(request.id, 'rejectedReason', event.target.value)} /><OperationalEvidenceUploader images={values.receiptEvidence || []} onChange={(images) => updateRequestInput(request.id, 'receiptEvidence', images)} label="Ảnh nhận hàng" disabled={submitting[`receipt-${request.id}`]} /><button className="btn btn-outline-success btn-sm" type="button" disabled={submitting[`receipt-${request.id}`]} onClick={() => receiveRequest(request)}>{submitting[`receipt-${request.id}`] ? 'Đang ghi nhận…' : 'Ghi nhận hàng về'}</button></div>}
          {canReceive && <div className="d-grid gap-1 border rounded p-2"><strong>Đề nghị chốt nhận thiếu</strong><input className="form-control form-control-sm" placeholder="Lý do chốt nhận thiếu" value={values.shortClosureReason || ''} onChange={(event) => updateRequestInput(request.id, 'shortClosureReason', event.target.value)} /><OperationalEvidenceUploader images={values.shortClosureEvidence || []} onChange={(images) => updateRequestInput(request.id, 'shortClosureEvidence', images)} label="Ảnh chốt nhận thiếu" disabled={submitting[`short-${request.id}`]} /><button className="btn btn-outline-warning btn-sm" type="button" disabled={submitting[`short-${request.id}`]} onClick={() => requestShortClosure(request)}>{submitting[`short-${request.id}`] ? 'Đang gửi…' : 'Gửi đề nghị chốt nhận thiếu'}</button></div>}
          {['Approved', 'PartiallyReceived', 'Completed', 'ClosedShort'].includes(request.status) && <div className="d-grid gap-1 border rounded p-2"><strong>Điều chỉnh phiếu nhận</strong><input className="form-control form-control-sm" placeholder="Mã phiếu nhận gốc" value={values.correctionOf || ''} onChange={(event) => updateRequestInput(request.id, 'correctionOf', event.target.value)} /><input className="form-control form-control-sm" type="number" placeholder="Số lượng điều chỉnh (+/-)" value={values.acceptedQuantityCorrection || ''} onChange={(event) => updateRequestInput(request.id, 'acceptedQuantityCorrection', event.target.value)} /><input className="form-control form-control-sm" placeholder="Lý do điều chỉnh" value={values.correctionReason || ''} onChange={(event) => updateRequestInput(request.id, 'correctionReason', event.target.value)} /><OperationalEvidenceUploader images={values.correctionEvidence || []} onChange={(images) => updateRequestInput(request.id, 'correctionEvidence', images)} label="Ảnh điều chỉnh" disabled={submitting[`correction-${request.id}`]} /><button className="btn btn-outline-primary btn-sm" type="button" disabled={submitting[`correction-${request.id}`]} onClick={() => correctReceipt(request)}>{submitting[`correction-${request.id}`] ? 'Đang ghi nhận…' : 'Ghi nhận điều chỉnh'}</button></div>}
        </td></tr>;
      })}
      {!loading && !requests.length && <tr><td colSpan="4" className="text-center text-muted">Chưa có yêu cầu bổ sung hàng.</td></tr>}
      {loading && <tr><td colSpan="4" className="text-center text-muted">Đang tải yêu cầu bổ sung hàng…</td></tr>}
    </tbody></table></div>
  </div>;
}
