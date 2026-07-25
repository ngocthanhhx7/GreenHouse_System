import { useEffect, useRef, useState } from 'react';

import { adminService } from '../../services/adminService.js';

const defaults = { PAYMENT_TIMEOUT_MINUTES: 15, LOW_STOCK_DEFAULT_THRESHOLD: 5 };

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function SystemSettingsPage() {
  const [values, setValues] = useState(defaults);
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [effectiveAt, setEffectiveAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const commandKeyRef = useRef(null);

  function resetCommandKey() {
    commandKeyRef.current = null;
  }

  function updateValue(key, value) {
    resetCommandKey();
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateReason(value) {
    resetCommandKey();
    setReason(value);
  }

  useEffect(() => {
    adminService.getSettings().then((result) => {
      setValues(result.current.values);
      setExpectedVersion(result.current.version);
      setEffectiveAt(result.current.effectiveAt);
      setHistory(result.history || []);
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  async function submitSettings(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    const paymentTimeout = Number(values.PAYMENT_TIMEOUT_MINUTES);
    const lowStock = Number(values.LOW_STOCK_DEFAULT_THRESHOLD);
    if (!Number.isInteger(paymentTimeout) || paymentTimeout < 5 || paymentTimeout > 60) {
      setError('Thời gian chờ thanh toán phải là số nguyên từ 5 đến 60 phút.'); return;
    }
    if (!Number.isInteger(lowStock) || lowStock < 0) {
      setError('Ngưỡng tồn kho phải là số nguyên không âm.'); return;
    }
    if (!reason.trim()) { setError('Vui lòng nhập lý do cập nhật.'); return; }
    setSaving(true);
    try {
      commandKeyRef.current ||= newIdempotencyKey();
      const result = await adminService.updateSettings({
        expectedVersion,
        reason: reason.trim(),
        values: { PAYMENT_TIMEOUT_MINUTES: paymentTimeout, LOW_STOCK_DEFAULT_THRESHOLD: lowStock },
      }, commandKeyRef.current);
      setValues(result.current.values);
      setExpectedVersion(result.current.version);
      setEffectiveAt(result.current.effectiveAt);
      setHistory(result.history || []);
      setReason('');
      setMessage(result.replay ? 'Yêu cầu trước đó đã được xác nhận lại.' : 'Đã cập nhật cấu hình hệ thống.');
      resetCommandKey();
    } catch (err) {
      if (err.errorCode === 'SETTINGS_VERSION_STALE' && err.data?.current) {
        setValues(err.data.current.values);
        setExpectedVersion(err.data.current.version);
        setEffectiveAt(err.data.current.effectiveAt);
        resetCommandKey();
      }
      setError(/stale|conflict/i.test(err.message) ? 'Cấu hình đã thay đổi. Dữ liệu hiện tại đã được nạp; hãy kiểm tra và gửi lại.' : err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="surface">
      <h1>Cấu hình hệ thống</h1>
      <p className="text-muted">Phiên bản hiện tại: {expectedVersion}{effectiveAt ? ` · hiệu lực ${new Date(effectiveAt).toLocaleString('vi-VN')}` : ' · giá trị mặc định'}</p>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      <form className="row g-3" onSubmit={submitSettings}>
        <div className="col-md-6">
          <label className="form-label" htmlFor="LOW_STOCK_DEFAULT_THRESHOLD">Ngưỡng cảnh báo tồn kho mặc định</label>
          <input id="LOW_STOCK_DEFAULT_THRESHOLD" className="form-control" type="number" min="0" step="1" disabled={loading || saving} value={values.LOW_STOCK_DEFAULT_THRESHOLD} onChange={(event) => updateValue('LOW_STOCK_DEFAULT_THRESHOLD', event.target.value)} />
          <small className="form-text text-muted">Đây là ngưỡng toàn cục. Ngưỡng ghi đè riêng của sản phẩm luôn thắng; sản phẩm không ghi đè sẽ được đánh giá lại qua hàng đợi an toàn.</small>
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="PAYMENT_TIMEOUT_MINUTES">Thời gian chờ thanh toán (phút)</label>
          <input id="PAYMENT_TIMEOUT_MINUTES" className="form-control" type="number" min="5" max="60" step="1" disabled={loading || saving} value={values.PAYMENT_TIMEOUT_MINUTES} onChange={(event) => updateValue('PAYMENT_TIMEOUT_MINUTES', event.target.value)} />
          <small className="form-text text-muted">Mặc định 15 phút. Thay đổi chỉ áp dụng cho đơn ONLINE tạo sau thời điểm phiên bản có hiệu lực; thời hạn của đơn cũ không đổi.</small>
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="settings-reason">Lý do cập nhật</label>
          <textarea id="settings-reason" className="form-control" maxLength="300" required disabled={loading || saving} value={reason} onChange={(event) => updateReason(event.target.value)} />
        </div>
        <div className="col-12">
          <button className="btn btn-success" type="submit" disabled={loading || saving}>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
        </div>
      </form>
      <section className="mt-4" aria-label="Lịch sử phiên bản cấu hình">
        <h2 className="h5">Lịch sử phiên bản</h2>
        <p className="text-muted">Lịch sử giữ tối đa 20 phiên bản gần nhất và không ghi đè phiên bản cũ.</p>
        <ul className="mb-0">{history.map((item) => (
          <li key={item.version}>
            <strong>v{item.version}</strong> · {new Date(item.effectiveAt).toLocaleString('vi-VN')} · {item.reason}
            <span className="d-block text-muted">Thanh toán ONLINE: {item.values.PAYMENT_TIMEOUT_MINUTES} phút · Ngưỡng tồn kho toàn cục: {item.values.LOW_STOCK_DEFAULT_THRESHOLD}</span>
          </li>
        ))}</ul>
      </section>
    </div>
  );
}
