import { useEffect, useState } from 'react';

import { supportService } from '../../services/supportService.js';

export default function SupportPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ subject: '', content: '', orderId: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadRequests() {
    setError('');
    try {
      const result = await supportService.listMyRequests();
      setItems(result.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function submitRequest(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      await supportService.createCustomerRequest({
        subject: form.subject,
        content: form.content,
        orderId: form.orderId || undefined,
      });
      setForm({ subject: '', content: '', orderId: '' });
      setMessage('Support request submitted.');
      loadRequests();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Support</h1>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      <form className="row g-3 mb-4" onSubmit={submitRequest}>
        <div className="col-md-6">
          <label className="form-label" htmlFor="subject">Subject</label>
          <input
            id="subject"
            className="form-control"
            value={form.subject}
            onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
            required
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="orderId">Order ID</label>
          <input
            id="orderId"
            className="form-control"
            value={form.orderId}
            onChange={(event) => setForm((current) => ({ ...current, orderId: event.target.value }))}
          />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="content">Content</label>
          <textarea
            id="content"
            className="form-control"
            rows="3"
            value={form.content}
            onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
            required
          />
        </div>
        <div className="col-12">
          <button className="btn btn-success" type="submit">Submit support request</button>
        </div>
      </form>
      <h2>My Requests</h2>
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Order</th>
              <th>Status</th>
              <th>Response</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.subject}</td>
                <td>{item.orderCode || '-'}</td>
                <td>{item.status}</td>
                <td>{item.response || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
