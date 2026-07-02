import { useEffect, useState } from 'react';

import { supportService } from '../../services/supportService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

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
      setMessage('Đã gửi yêu cầu hỗ trợ.');
      loadRequests();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Hỗ trợ khách hàng</span>
          <h1>Gửi yêu cầu hỗ trợ</h1>
        </div>
      </div>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      <form className="row g-3 mb-4" onSubmit={submitRequest}>
        <div className="col-md-6">
          <label className="form-label" htmlFor="subject">Chủ đề</label>
          <input
            id="subject"
            className="form-control"
            value={form.subject}
            onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
            required
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="orderId">Mã đơn hàng (nếu có)</label>
          <input
            id="orderId"
            className="form-control"
            value={form.orderId}
            onChange={(event) => setForm((current) => ({ ...current, orderId: event.target.value }))}
          />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="content">Nội dung</label>
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
          <button className="btn btn-success" type="submit">Gửi yêu cầu</button>
        </div>
      </form>
      <h2>Yêu cầu của tôi</h2>
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Chủ đề</th>
              <th>Đơn hàng</th>
              <th>Trạng thái</th>
              <th>Phản hồi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.subject}</td>
                <td>{item.orderCode || '-'}</td>
                <td>{translateRequestStatus(item.status)}</td>
                <td>{item.response || '-'}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan="4" className="text-center text-muted">Chưa có yêu cầu hỗ trợ.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
