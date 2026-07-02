import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, getDashboardPath } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      const result = await login(form);
      navigate(getDashboardPath(result.user.role.roleName), { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Đăng nhập</h1>
        <p className="text-secondary">Truy cập tài khoản GreenHome Kitchen của bạn.</p>
        {error && <div className="alert alert-danger">{error}</div>}
        <label className="form-label">
          Email
          <input
            className="form-control"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
        </label>
        <label className="form-label">
          Mật khẩu
          <input
            className="form-control"
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
        </label>
        <button className="btn btn-success w-100" type="submit">
          Đăng nhập
        </button>
        <p className="text-center mt-3 mb-0">
          Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
        </p>
      </form>
    </div>
  );
}
