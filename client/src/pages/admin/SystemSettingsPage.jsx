import { useEffect, useState } from 'react';

import { adminService } from '../../services/adminService.js';

export default function SystemSettingsPage() {
  const [form, setForm] = useState({ lowStockDefaultThreshold: 5, returnWindowDays: 7 });
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
        lowStockDefaultThreshold: Number(form.lowStockDefaultThreshold),
        returnWindowDays: Number(form.returnWindowDays),
      });
      setForm(result);
      setMessage('System settings updated.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>System Settings</h1>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      <form className="row g-3" onSubmit={submitSettings}>
        <div className="col-md-6">
          <label className="form-label" htmlFor="lowStockDefaultThreshold">Low-stock default threshold</label>
          <input
            id="lowStockDefaultThreshold"
            className="form-control"
            type="number"
            min="0"
            value={form.lowStockDefaultThreshold}
            onChange={(event) => setForm((current) => ({ ...current, lowStockDefaultThreshold: event.target.value }))}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="returnWindowDays">Return window days</label>
          <input
            id="returnWindowDays"
            className="form-control"
            type="number"
            min="0"
            value={form.returnWindowDays}
            onChange={(event) => setForm((current) => ({ ...current, returnWindowDays: event.target.value }))}
          />
        </div>
        <div className="col-12">
          <button className="btn btn-success" type="submit">Save settings</button>
        </div>
      </form>
    </div>
  );
}
