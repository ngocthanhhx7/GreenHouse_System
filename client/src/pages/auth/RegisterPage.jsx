import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    address: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await register(form);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <main className="auth-page auth-page--register">
      <div className="auth-page-shell">
        <aside className="auth-brand-panel">
          <img src="/assets/logo/logo.png" alt="" className="auth-brand-logo" />
          <p className="auth-brand-kicker">GreenHome Kitchen</p>
          <h2>Bắt đầu từ một căn bếp xanh.</h2>
          <p>Tạo tài khoản khách hàng để mua sắm thuận tiện và theo dõi đơn hàng của bạn.</p>
        </aside>

        <form className="auth-form-panel" onSubmit={handleSubmit} aria-busy={submitting}>
          <div className="auth-form-heading">
            <p className="auth-eyebrow">Tài khoản GreenHome</p>
            <h1>Đăng ký</h1>
            <p>Tạo tài khoản khách hàng để đặt hàng và theo dõi đơn mua.</p>
          </div>

          <div className="auth-feedback" aria-live="polite">
            {error && <div className="auth-alert" role="alert">{error}</div>}
          </div>

          <div className="auth-field-grid">
            <label htmlFor="register-full-name">
              Họ và tên
              <input id="register-full-name" value={form.fullName} autoComplete="name" onChange={(event) => updateField('fullName', event.target.value)} required disabled={submitting} />
            </label>
            <label htmlFor="register-email">
              Email
              <input id="register-email" type="email" value={form.email} autoComplete="email" onChange={(event) => updateField('email', event.target.value)} required disabled={submitting} />
            </label>
            <label htmlFor="register-phone">
              Số điện thoại
              <input id="register-phone" type="tel" value={form.phone} autoComplete="tel" onChange={(event) => updateField('phone', event.target.value)} required disabled={submitting} />
            </label>
            <label htmlFor="register-password">
              Mật khẩu
              <input id="register-password" type="password" value={form.password} autoComplete="new-password" onChange={(event) => updateField('password', event.target.value)} required disabled={submitting} />
            </label>
            <label className="auth-field--full" htmlFor="register-address">
              Địa chỉ
              <textarea id="register-address" value={form.address} autoComplete="street-address" onChange={(event) => updateField('address', event.target.value)} required disabled={submitting} />
            </label>
          </div>

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Đang tạo tài khoản…' : 'Đăng ký'}
          </button>
          <p className="auth-cross-link">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
        </form>
      </div>
    </main>
  );
}
