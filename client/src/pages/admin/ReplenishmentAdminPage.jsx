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
    if (!decisionReason) { setError('Admin decision reason is required.'); return; }
    setSubmitting((current) => ({ ...current, [`decision-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      await replenishmentService.updateAdminStatus(request.id, { status, decisionReason });
      setMessage(`${translateRequestStatus(status)} request for ${request.productName}.`);
      await loadRequests();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`decision-${request.id}`]: false }));
    }
  }

  async function decideShortClosure(request, status) {
    const values = inputs[request.id] || {};
    const reason = String(values.shortClosureDecisionReason || '').trim();
    if (!reason) { setError('Short-closure decision reason is required.'); return; }
    setSubmitting((current) => ({ ...current, [`short-${request.id}`]: true }));
    setError(''); setMessage('');
    try {
      await replenishmentService.decideShortClosure(request.id, { status, reason });
      setMessage(`${translateRequestStatus(status)} short closure for ${request.productName}.`);
      await loadRequests();
    } catch (err) { setError(err.message); } finally {
      setSubmitting((current) => ({ ...current, [`short-${request.id}`]: false }));
    }
  }

  return <div className="surface">
    <h1>Replenishment decisions</h1>
    <p className="text-muted">Approve or reject only the requested quantity. Admin does not edit delivery or receipt evidence.</p>
    {error && <div className="alert alert-danger">{error}</div>}
    {message && <div className="alert alert-success">{message}</div>}
    <div className="table-responsive"><table className="table"><thead><tr><th>Product</th><th>Requested / approved</th><th>Status</th><th>Decision</th></tr></thead><tbody>
      {requests.map((request) => {
        const values = inputs[request.id] || {};
        return <tr key={request.id}><td>{request.productName}</td><td>{request.quantity} / {request.approvedQuantity ?? '-'}</td><td>{translateRequestStatus(request.status)}</td><td className="d-grid gap-1">
          {request.status === 'PendingApproval' && <><input className="form-control form-control-sm" placeholder="Admin decision reason" value={values.decisionReason || ''} onChange={(event) => updateInput(request.id, 'decisionReason', event.target.value)} required /><div className="btn-group"><button className="btn btn-outline-success btn-sm" type="button" disabled={submitting[`decision-${request.id}`]} onClick={() => decide(request, 'Approved')}>Approve exact quantity</button><button className="btn btn-outline-danger btn-sm" type="button" disabled={submitting[`decision-${request.id}`]} onClick={() => decide(request, 'Rejected')}>Reject request</button></div></>}
          {request.status === 'ShortClosurePending' && <><input className="form-control form-control-sm" placeholder="Short-closure decision reason" value={values.shortClosureDecisionReason || ''} onChange={(event) => updateInput(request.id, 'shortClosureDecisionReason', event.target.value)} required /><div className="btn-group"><button className="btn btn-outline-success btn-sm" type="button" disabled={submitting[`short-${request.id}`]} onClick={() => decideShortClosure(request, 'Approved')}>Approve short closure</button><button className="btn btn-outline-danger btn-sm" type="button" disabled={submitting[`short-${request.id}`]} onClick={() => decideShortClosure(request, 'Rejected')}>Reject short closure</button></div></>}
          {!['PendingApproval', 'ShortClosurePending'].includes(request.status) && 'No Admin action available'}
        </td></tr>;
      })}
      {!loading && !requests.length && <tr><td colSpan="4" className="text-center text-muted">No replenishment requests.</td></tr>}
      {loading && <tr><td colSpan="4" className="text-center text-muted">Loading replenishment requests…</td></tr>}
    </tbody></table></div>
  </div>;
}
