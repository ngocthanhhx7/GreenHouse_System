import { useEffect, useState } from 'react';

import { resolveMediaUrl } from '../../services/apiClient.js';
import { replenishmentService } from '../../services/replenishmentService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

function EvidenceImages({ images = [], label }) {
  return <div><div className="small fw-semibold">{label}</div><div className="d-flex flex-wrap gap-2 mt-1">
    {images.map((url, index) => <a key={url} href={resolveMediaUrl(url)} target="_blank" rel="noreferrer"><img src={resolveMediaUrl(url)} alt={`${label} ${index + 1}`} width="88" height="72" style={{ objectFit: 'cover', borderRadius: 8 }} /></a>)}
    {!images.length && <span className="text-danger small">Chưa có ảnh dẫn chứng.</span>}
  </div></div>;
}

export default function ReplenishmentAdminPage() {
  const [requests, setRequests] = useState([]);
  const [inputs, setInputs] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadRequests() {
    setLoading(true);
    try {
      const result = await replenishmentService.listAdminRequests();
      setRequests(result.items || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  useEffect(() => { loadRequests(); }, []);

  function updateInput(id, field, value) {
    setInputs((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function decide(request, status) {
    const values = inputs[request.id] || {};
    const decisionReason = String(values.decisionReason || '').trim();
    if (!decisionReason) { setError('Vui lòng nhập lý do phê duyệt hoặc từ chối.'); return; }
    setSubmitting((current) => ({ ...current, [`decision-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      await replenishmentService.updateAdminStatus(request.id, { status, decisionReason });
      setMessage(`Đã ${status === 'Approved' ? 'phê duyệt' : 'từ chối'} yêu cầu bổ sung ${request.productName}.`);
      await loadRequests();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`decision-${request.id}`]: false }));
    }
  }

  async function decideShortClosure(request, status) {
    const values = inputs[request.id] || {};
    const reason = String(values.shortClosureDecisionReason || '').trim();
    if (!reason) { setError('Vui lòng nhập lý do quyết định chốt nhận thiếu.'); return; }
    setSubmitting((current) => ({ ...current, [`short-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      await replenishmentService.decideShortClosure(request.id, { status, reason });
      setMessage(`Đã ${status === 'Approved' ? 'phê duyệt' : 'từ chối'} đề nghị chốt nhận thiếu của ${request.productName}.`);
      await loadRequests();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`short-${request.id}`]: false }));
    }
  }

  return <div className="surface">
    <h1>Duyệt yêu cầu bổ sung hàng</h1>
    <p className="text-muted">Quản trị viên xem ảnh dẫn chứng trước khi phê duyệt hoặc từ chối đúng số lượng đã đề nghị.</p>
    {error && <div className="alert alert-danger">{error}</div>}
    {message && <div className="alert alert-success">{message}</div>}
    <div className="table-responsive"><table className="table"><thead><tr><th>Sản phẩm</th><th>Đề nghị / phê duyệt</th><th>Trạng thái</th><th>Ảnh dẫn chứng và quyết định</th></tr></thead><tbody>
      {requests.map((request) => {
        const values = inputs[request.id] || {};
        return <tr key={request.id}><td>{request.productName}</td><td>{request.quantity} / {request.approvedQuantity ?? '—'}</td><td>{translateRequestStatus(request.status)}</td><td className="d-grid gap-2">
          <EvidenceImages images={request.evidence || []} label="Ảnh dẫn chứng yêu cầu" />
          {request.status === 'ShortClosurePending' && <EvidenceImages images={request.shortClosureEvidence || []} label="Ảnh dẫn chứng chốt nhận thiếu" />}
          {request.status === 'PendingApproval' && <><input className="form-control form-control-sm" placeholder="Lý do quyết định" value={values.decisionReason || ''} onChange={(event) => updateInput(request.id, 'decisionReason', event.target.value)} required /><div className="btn-group"><button className="btn btn-outline-success btn-sm" type="button" disabled={submitting[`decision-${request.id}`]} onClick={() => decide(request, 'Approved')}>Phê duyệt đúng số lượng</button><button className="btn btn-outline-danger btn-sm" type="button" disabled={submitting[`decision-${request.id}`]} onClick={() => decide(request, 'Rejected')}>Từ chối yêu cầu</button></div></>}
          {request.status === 'ShortClosurePending' && <><input className="form-control form-control-sm" placeholder="Lý do quyết định chốt nhận thiếu" value={values.shortClosureDecisionReason || ''} onChange={(event) => updateInput(request.id, 'shortClosureDecisionReason', event.target.value)} required /><div className="btn-group"><button className="btn btn-outline-success btn-sm" type="button" disabled={submitting[`short-${request.id}`]} onClick={() => decideShortClosure(request, 'Approved')}>Phê duyệt chốt nhận thiếu</button><button className="btn btn-outline-danger btn-sm" type="button" disabled={submitting[`short-${request.id}`]} onClick={() => decideShortClosure(request, 'Rejected')}>Từ chối chốt nhận thiếu</button></div></>}
          {!['PendingApproval', 'ShortClosurePending'].includes(request.status) && <span className="text-muted">Không có thao tác quản trị.</span>}
        </td></tr>;
      })}
      {!loading && !requests.length && <tr><td colSpan="4" className="text-center text-muted">Chưa có yêu cầu bổ sung hàng.</td></tr>}
      {loading && <tr><td colSpan="4" className="text-center text-muted">Đang tải yêu cầu bổ sung hàng…</td></tr>}
    </tbody></table></div>
  </div>;
}
