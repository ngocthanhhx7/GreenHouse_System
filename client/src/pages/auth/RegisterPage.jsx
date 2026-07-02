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

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await register(form);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="auth-page">
      <form className="auth-card wide" onSubmit={handleSubmit}>
        <h1>Đăng ký</h1>
        <p className="text-secondary">Tạo tài khoản khách hàng để đặt hàng và theo dõi đơn mua.</p>
        {error && <div className="alert alert-danger">{error}</div>}
        <label className="form-label">
          Họ và tên
          <input className="form-control" value={form.fullName} onChange={(event) => updateField('fullName', event.target.value)} required />
        </label>
        <label className="form-label">
          Email
          <input className="form-control" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} required />
        </label>
        <label className="form-label">
          Số điện thoại
          <input className="form-control" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} required />
        </label>
        <label className="form-label">
          Mật khẩu
          <input className="form-control" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} required />
        </label>
        <label className="form-label">
          Địa chỉ
          <textarea className="form-control" value={form.address} onChange={(event) => updateField('address', event.target.value)} required />
        </label>
        <button className="btn btn-success w-100" type="submit">
          Đăng ký
        </button>
        <p className="text-center mt-3 mb-0">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </form>
    </div>
  );
}
