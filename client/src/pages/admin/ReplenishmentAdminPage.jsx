import { useEffect, useState } from 'react';

import { replenishmentService } from '../../services/replenishmentService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRequests(); }, []);

  function updateInput(id, field, value) {
    setInputs((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function decide(request, status) {
    const values = inputs[request.id] || {};
    const decisionReason = String(values.decisionReason || '').trim();
    if (!decisionReason) { setError('Vui lòng nhập lý do quyết định của Admin.'); return; }
    setSubmitting((current) => ({ ...current, [`decision-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      await replenishmentService.updateAdminStatus(request.id, { status, decisionReason });
      setMessage(`${translateRequestStatus(status)} yêu cầu cho sản phẩm ${request.productName}.`);
      await loadRequests();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`decision-${request.id}`]: false }));
    }
  }

  async function decideShortClosure(request, status) {
    const values = inputs[request.id] || {};
    const reason = String(values.shortClosureDecisionReason || '').trim();
    if (!reason) { setError('Vui lòng nhập lý do quyết định kết thúc sớm.'); return; }
    setSubmitting((current) => ({ ...current, [`short-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      await replenishmentService.decideShortClosure(request.id, { status, reason });
      setMessage(`${translateRequestStatus(status)} kết thúc sớm cho sản phẩm ${request.productName}.`);
      await loadRequests();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`short-${request.id}`]: false }));
    }
  }

  return <div className="surface">
    <h1>Quyết định bổ sung hàng hóa</h1>
    <p className="text-muted">Phê duyệt hoặc từ chối đúng số lượng yêu cầu. Admin không chỉnh sửa bằng chứng giao hàng hoặc nhập kho.</p>
    {error && <div className="alert alert-danger">{error}</div>}
    {message && <div className="alert alert-success">{message}</div>}
    <div className="table-responsive"><table className="table"><thead><tr><th>Sản phẩm</th><th>Yêu cầu / Đã duyệt</th><th>Trạng thái</th><th>Quyết định</th></tr></thead><tbody>
      {requests.map((request) => {
        const values = inputs[request.id] || {};
        return <tr key={request.id}><td>{request.productName}</td><td>{request.quantity} / {request.approvedQuantity ?? '-'}</td><td>{translateRequestStatus(request.status)}</td><td className="d-grid gap-1">
          {request.status === 'PendingApproval' && <><input className="form-control form-control-sm" placeholder="Lý do quyết định của Admin" value={values.decisionReason || ''} onChange={(event) => updateInput(request.id, 'decisionReason', event.target.value)} required /><div className="btn-group"><button className="btn btn-outline-success btn-sm" type="button" disabled={submitting[`decision-${request.id}`]} onClick={() => decide(request, 'Approved')}>Duyệt đúng số lượng</button><button className="btn btn-outline-danger btn-sm" type="button" disabled={submitting[`decision-${request.id}`]} onClick={() => decide(request, 'Rejected')}>Từ chối yêu cầu</button></div></>}
          {request.status === 'ShortClosurePending' && <><input className="form-control form-control-sm" placeholder="Lý do quyết định kết thúc sớm" value={values.shortClosureDecisionReason || ''} onChange={(event) => updateInput(request.id, 'shortClosureDecisionReason', event.target.value)} required /><div className="btn-group"><button className="btn btn-outline-success btn-sm" type="button" disabled={submitting[`short-${request.id}`]} onClick={() => decideShortClosure(request, 'Approved')}>Duyệt kết thúc sớm</button><button className="btn btn-outline-danger btn-sm" type="button" disabled={submitting[`short-${request.id}`]} onClick={() => decideShortClosure(request, 'Rejected')}>Từ chối kết thúc sớm</button></div></>}
          {!['PendingApproval', 'ShortClosurePending'].includes(request.status) && 'Không có thao tác khả dụng'}
        </td></tr>;
      })}
      {!loading && !requests.length && <tr><td colSpan="4" className="text-center text-muted">Không có yêu cầu bổ sung hàng hóa.</td></tr>}
      {loading && <tr><td colSpan="4" className="text-center text-muted">Đang tải yêu cầu bổ sung hàng hóa…</td></tr>}
    </tbody></table></div>
  </div>;
}
