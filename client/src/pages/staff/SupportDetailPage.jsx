import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { supportService } from '../../services/supportService.js';

export default function SupportDetailPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({ response: '', status: 'Resolved' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadRequest() {
    setError('');
    try {
      const result = await supportService.getStaffRequest(id);
      setRequest(result);
      setForm({ response: result.response || '', status: result.status === 'Resolved' ? 'Resolved' : 'InProgress' });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadRequest();
  }, [id]);

  async function submitResponse(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      const result = await supportService.respondToRequest(id, form);
      setRequest(result);
      setMessage('Support response saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!request && !error) return <div className="page-center">Loading...</div>;

  return (
    <div className="surface">
      <h1>Support Detail</h1>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {request && (
        <>
          <dl className="row">
            <dt className="col-sm-3">Subject</dt>
            <dd className="col-sm-9">{request.subject}</dd>
            <dt className="col-sm-3">Order</dt>
            <dd className="col-sm-9">{request.orderCode || '-'}</dd>
            <dt className="col-sm-3">Status</dt>
            <dd className="col-sm-9">{request.status}</dd>
            <dt className="col-sm-3">Content</dt>
            <dd className="col-sm-9">{request.content}</dd>
          </dl>
          <form className="row g-3" onSubmit={submitResponse}>
            <div className="col-md-4">
              <label className="form-label" htmlFor="supportStatus">Status</label>
              <select
                id="supportStatus"
                className="form-select"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="InProgress">In progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="supportResponse">Response</label>
              <textarea
                id="supportResponse"
                className="form-control"
                rows="3"
                value={form.response}
                onChange={(event) => setForm((current) => ({ ...current, response: event.target.value }))}
                required
              />
            </div>
            <div className="col-12">
              <button className="btn btn-success" type="submit">Save response</button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
