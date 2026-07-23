import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, getDashboardPath, isAuthenticated, user } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.role) return;
    navigate(getDashboardPath(user.role), { replace: true });
  }, [getDashboardPath, isAuthenticated, navigate, user]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await login(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page--login">
      <div className="auth-page-shell">
        <aside className="auth-brand-panel">
          <img src="/assets/logo/logo.png" alt="" className="auth-brand-logo" />
          <p className="auth-brand-kicker">GreenHome Kitchen</p>
          <h2>Mọi điều cho căn bếp ấm áp.</h2>
          <p>Đăng nhập để tiếp tục mua sắm và theo dõi những đơn hàng của bạn.</p>
        </aside>

        <form className="auth-form-panel" onSubmit={handleSubmit} aria-busy={submitting}>
          <div className="auth-form-heading">
            <p className="auth-eyebrow">Tài khoản GreenHome</p>
            <h1>Đăng nhập</h1>
            <p>Truy cập tài khoản GreenHome Kitchen của bạn.</p>
          </div>

          <div className="auth-feedback" aria-live="polite">
            {error && <div className="auth-alert" role="alert">{error}</div>}
          </div>

          <div className="auth-fields">
            <label htmlFor="login-email">
              Email
              <input
                id="login-email"
                type="email"
                value={form.email}
                autoComplete="email"
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
                disabled={submitting}
              />
            </label>
            <label htmlFor="login-password">
              Mật khẩu
              <input
                id="login-password"
                type="password"
                value={form.password}
                autoComplete="current-password"
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
                disabled={submitting}
              />
            </label>
          </div>

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
          <p className="auth-cross-link">Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
        </form>
      </div>
    </main>
  );
}
