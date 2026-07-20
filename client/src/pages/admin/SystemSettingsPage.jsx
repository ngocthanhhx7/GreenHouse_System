import { useEffect, useState } from 'react';

import { adminService } from '../../services/adminService.js';

export default function SystemSettingsPage() {
  const [form, setForm] = useState({ LOW_STOCK_DEFAULT_THRESHOLD: 5, RETURN_WINDOW_DAYS: 7, PAYMENT_TIMEOUT_MINUTES: 15 });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    adminService.getSettings().then(setForm).catch((err) => setError(err.message));
  }, []);

  async function submitSettings(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      const result = await adminService.updateSettings({
        LOW_STOCK_DEFAULT_THRESHOLD: Number(form.LOW_STOCK_DEFAULT_THRESHOLD),
        RETURN_WINDOW_DAYS: Number(form.RETURN_WINDOW_DAYS),
        PAYMENT_TIMEOUT_MINUTES: Number(form.PAYMENT_TIMEOUT_MINUTES),
      });
      setForm(result);
      setMessage('Đã cập nhật cấu hình hệ thống.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Cấu hình hệ thống</h1>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      <form className="row g-3" onSubmit={submitSettings}>
        <div className="col-md-6">
          <label className="form-label" htmlFor="LOW_STOCK_DEFAULT_THRESHOLD">Ngưỡng cảnh báo tồn kho mặc định</label>
          <input
            id="LOW_STOCK_DEFAULT_THRESHOLD"
            className="form-control"
            type="number"
            min="0"
            value={form.LOW_STOCK_DEFAULT_THRESHOLD}
            onChange={(event) => setForm((current) => ({ ...current, LOW_STOCK_DEFAULT_THRESHOLD: event.target.value }))}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="RETURN_WINDOW_DAYS">Số ngày cho phép đổi trả</label>
          <input
            id="RETURN_WINDOW_DAYS"
            className="form-control"
            type="number"
            min="0"
            value={form.RETURN_WINDOW_DAYS}
            onChange={(event) => setForm((current) => ({ ...current, RETURN_WINDOW_DAYS: event.target.value }))}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="PAYMENT_TIMEOUT_MINUTES">Thời gian chờ thanh toán (phút)</label>
          <input id="PAYMENT_TIMEOUT_MINUTES" className="form-control" type="number" min="1" value={form.PAYMENT_TIMEOUT_MINUTES} onChange={(event) => setForm((current) => ({ ...current, PAYMENT_TIMEOUT_MINUTES: event.target.value }))} />
        </div>
        <div className="col-12">
          <button className="btn btn-success" type="submit">Lưu cấu hình</button>
        </div>
      </form>
    </div>
  );
}
