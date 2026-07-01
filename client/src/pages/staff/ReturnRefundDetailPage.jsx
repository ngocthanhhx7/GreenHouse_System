import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { returnRefundService } from '../../services/returnRefundService.js';

export default function ReturnRefundDetailPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({ refundAmount: '', staffNote: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadRequest() {
    setError('');
    try {
      const result = await returnRefundService.getStaffRequest(id);
      setRequest(result);
      setForm({ refundAmount: result.order?.totalAmount || '', staffNote: result.staffNote || '' });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadRequest();
  }, [id]);

  async function decide(status) {
    setError('');
    setMessage('');
    try {
      const result = await returnRefundService.decideRequest(id, {
        status,
        refundAmount: status === 'Approved' ? Number(form.refundAmount) : 0,
        staffNote: form.staffNote,
      });
      setRequest(result);
      setMessage(`Return/refund ${status.toLowerCase()}.`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!request && !error) return <div className="page-center">Loading...</div>;

  return (
    <div className="surface">
      <h1>Return & Refund Detail</h1>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {request && (
        <>
          <dl className="row">
            <dt className="col-sm-3">Order</dt>
            <dd className="col-sm-9">{request.orderCode}</dd>
            <dt className="col-sm-3">Status</dt>
            <dd className="col-sm-9">{request.status}</dd>
            <dt className="col-sm-3">Reason</dt>
            <dd className="col-sm-9">{request.reason}</dd>
            <dt className="col-sm-3">Order total</dt>
            <dd className="col-sm-9">${Number(request.order?.totalAmount || 0).toFixed(2)}</dd>
          </dl>
          <h2>Items</h2>
          <ul>
            {(request.details || []).map((item) => (
              <li key={item._id || item.productId}>
                {item.productNameSnapshot} x {item.quantity} - ${Number(item.subtotal || 0).toFixed(2)}
              </li>
            ))}
          </ul>
          {request.status === 'Pending' && (
            <div className="row g-3 mt-1">
              <div className="col-md-4">
                <label className="form-label" htmlFor="refundAmount">Refund amount</label>
                <input
                  id="refundAmount"
                  className="form-control"
                  type="number"
                  min="0"
                  value={form.refundAmount}
                  onChange={(event) => setForm((current) => ({ ...current, refundAmount: event.target.value }))}
                />
              </div>
              <div className="col-md-8">
                <label className="form-label" htmlFor="staffNote">Staff note</label>
                <input
                  id="staffNote"
                  className="form-control"
                  value={form.staffNote}
                  onChange={(event) => setForm((current) => ({ ...current, staffNote: event.target.value }))}
                />
              </div>
              <div className="col-12 d-flex gap-2">
                <button className="btn btn-success" type="button" onClick={() => decide('Approved')}>
                  Approve
                </button>
                <button className="btn btn-outline-danger" type="button" onClick={() => decide('Rejected')}>
                  Reject
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
