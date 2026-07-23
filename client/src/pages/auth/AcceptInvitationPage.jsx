import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { authService } from '../../services/authService.js';

export default function AcceptInvitationPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    email: params.get('email') || '',
    token: params.get('token') || '',
    fullName: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await authService.acceptInvitation(form);
      navigate('/login', { replace: true, state: { message: 'Lời mời đã được chấp nhận. Vui lòng đăng nhập.' } });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page auth-page--register">
      <div className="auth-page-shell">
        <aside className="auth-brand-panel">
          <img src="/assets/logo/logo.png" alt="" className="auth-brand-logo" />
          <p className="auth-brand-kicker">GreenHome Kitchen</p>
          <h2>Chào mừng bạn đến với đội ngũ GreenHome.</h2>
          <p>Hoàn tất thông tin từ lời mời nội bộ để tạo tài khoản nhân viên.</p>
        </aside>
        <form className="auth-form-panel" onSubmit={submit} aria-busy={busy}>
          <div className="auth-form-heading">
            <p className="auth-eyebrow">Lời mời nội bộ</p>
            <h1>Kích hoạt tài khoản</h1>
            <p>Liên kết mời chỉ dùng một lần và có thời hạn.</p>
          </div>
          {error && <div className="auth-alert" role="alert">{error}</div>}
          <div className="auth-field-grid">
            <label>Email<input type="email" value={form.email} required disabled={busy} onChange={(event) => update('email', event.target.value)} /></label>
            <label>Mã lời mời<input value={form.token} required disabled={busy} onChange={(event) => update('token', event.target.value)} /></label>
            <label>Họ và tên<input value={form.fullName} required disabled={busy} onChange={(event) => update('fullName', event.target.value)} /></label>
            <label>Số điện thoại<input type="tel" value={form.phoneNumber} required disabled={busy} onChange={(event) => update('phoneNumber', event.target.value)} /></label>
            <label>Mật khẩu<input type="password" value={form.password} autoComplete="new-password" required disabled={busy} onChange={(event) => update('password', event.target.value)} /></label>
            <label>Xác nhận mật khẩu<input type="password" value={form.confirmPassword} autoComplete="new-password" required disabled={busy} onChange={(event) => update('confirmPassword', event.target.value)} /></label>
          </div>
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : 'Kích hoạt tài khoản'}</button>
          <p className="auth-cross-link"><Link to="/login">Quay lại đăng nhập</Link></p>
        </form>
      </div>
    </main>
  );
}
