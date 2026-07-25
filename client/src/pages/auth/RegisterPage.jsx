import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { safeReturnPath } from '../../utils/authNavigation.js';

const INITIAL_FORM = {
  fullName: '',
  email: '',
  phoneNumber: '',
  otp: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { requestRegistrationChallenge, completeRegistration } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [challengeSent, setChallengeSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    if (!challengeSent || resendSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [challengeSent, resendSeconds]);

  async function sendChallenge(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await requestRegistrationChallenge(form.email);
      setChallengeSent(true);
      setResendSeconds(60);
      setMessage('Mã xác minh đã được gửi nếu email đủ điều kiện. Kiểm tra hộp thư để tiếp tục.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function resendChallenge() {
    if (submitting || resendSeconds > 0) return;
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await requestRegistrationChallenge(form.email);
      setResendSeconds(60);
      setMessage('Đã yêu cầu gửi mã xác minh mới. Vui lòng kiểm tra hộp thư.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function changeEmail() {
    if (submitting) return;
    setChallengeSent(false);
    setResendSeconds(0);
    setForm((current) => ({ ...current, otp: '' }));
    setError('');
    setMessage('');
  }

  async function complete(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await completeRegistration({
        email: form.email,
        otp: form.otp,
        fullName: form.fullName,
        phoneNumber: form.phoneNumber,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      navigate('/login', {
        replace: true,
        state: {
          message: 'Đăng ký thành công. Vui lòng đăng nhập.',
          from: safeReturnPath(location.state?.from, '/'),
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page--register">
      <div className="auth-page-shell">
        <aside className="auth-brand-panel">
          <img src="/assets/logo/logo.png" alt="" className="auth-brand-logo" />
          <p className="auth-brand-kicker">GreenHome Kitchen</p>
          <h2>Bắt đầu từ một căn bếp xanh.</h2>
          <p>Tạo tài khoản khách hàng qua email xác minh để mua sắm thuận tiện và theo dõi đơn hàng.</p>
        </aside>

        <form className="auth-form-panel" onSubmit={challengeSent ? complete : sendChallenge} aria-busy={submitting}>
          <div className="auth-form-heading">
            <p className="auth-eyebrow">Tài khoản GreenHome</p>
            <h1>Đăng ký</h1>
            <p>{challengeSent ? 'Nhập mã OTP trong email và hoàn tất thông tin tài khoản.' : 'Nhận mã xác minh qua email trước khi tạo tài khoản.'}</p>
          </div>

          <div className="auth-feedback" aria-live="polite">
            {message && <div className="auth-success" role="status">{message}</div>}
            {error && <div className="auth-alert" role="alert">{error}</div>}
          </div>

          <div className="auth-field-grid">
            <label htmlFor="register-email">
              Email
              <input id="register-email" type="email" value={form.email} autoComplete="email" onChange={(event) => updateField('email', event.target.value)} required disabled={submitting || challengeSent} />
            </label>
            {challengeSent && (
              <>
                <label htmlFor="register-otp">
                  Mã OTP
                  <input id="register-otp" inputMode="numeric" pattern="\d{6}" maxLength="6" value={form.otp} onChange={(event) => updateField('otp', event.target.value)} required disabled={submitting} />
                </label>
                <label htmlFor="register-full-name">
                  Họ và tên
                  <input id="register-full-name" value={form.fullName} autoComplete="name" onChange={(event) => updateField('fullName', event.target.value)} required disabled={submitting} />
                </label>
                <label htmlFor="register-phone">
                  Số điện thoại
                  <input id="register-phone" type="tel" value={form.phoneNumber} autoComplete="tel" onChange={(event) => updateField('phoneNumber', event.target.value)} required disabled={submitting} />
                </label>
                <label htmlFor="register-password">
                  Mật khẩu
                  <input id="register-password" type="password" value={form.password} autoComplete="new-password" onChange={(event) => updateField('password', event.target.value)} required disabled={submitting} />
                </label>
                <label htmlFor="register-confirm-password">
                  Xác nhận mật khẩu
                  <input id="register-confirm-password" type="password" value={form.confirmPassword} autoComplete="new-password" onChange={(event) => updateField('confirmPassword', event.target.value)} required disabled={submitting} />
                </label>
              </>
            )}
          </div>

          {challengeSent && (
            <div className="auth-secondary-actions">
              <button
                className="auth-text-button"
                type="button"
                onClick={resendChallenge}
                disabled={submitting || resendSeconds > 0}
              >
                {resendSeconds > 0 ? `Gửi lại mã sau ${resendSeconds}s` : 'Gửi lại mã'}
              </button>
              <button
                className="auth-text-button"
                type="button"
                onClick={changeEmail}
                disabled={submitting}
              >
                Thay đổi email
              </button>
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Đang xử lý…' : challengeSent ? 'Hoàn tất đăng ký' : 'Gửi mã xác minh'}
          </button>
          <p className="auth-cross-link">
            Đã có tài khoản?{' '}
            <Link
              to="/login"
              state={{ from: safeReturnPath(location.state?.from, '/') }}
            >
              Đăng nhập
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
