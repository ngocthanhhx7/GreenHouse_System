import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { authService } from '../../services/authService.js';
import { safeReturnPath } from '../../utils/authNavigation.js';
import {
  mapAuthFieldErrors,
  validatePasswordResetCompletion,
  validatePasswordResetRequest,
} from '../../utils/passwordResetValidation.js';

const INITIAL_FORM = {
  email: '',
  otp: '',
  password: '',
  confirmPassword: '',
};

const GENERIC_REQUEST_MESSAGE = 'Nếu email tồn tại, mã OTP đặt lại mật khẩu sẽ được gửi đến hộp thư của bạn.';

export default function ForgotPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('request');
  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (phase !== 'reset' || resendSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [phase, resendSeconds]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError('');
  }

  function showRequestError(requestError) {
    const nextFieldErrors = mapAuthFieldErrors(requestError);
    setFieldErrors(nextFieldErrors);
    setError(Object.keys(nextFieldErrors).length ? '' : requestError.message);
  }

  async function requestOtp(event) {
    event.preventDefault();
    if (submitting) return;

    const validation = validatePasswordResetRequest(form);
    setFieldErrors(validation.errors);
    setError('');
    setMessage('');
    if (Object.keys(validation.errors).length) return;

    setSubmitting(true);
    try {
      await authService.requestPasswordReset(validation.values.email);
      setForm((current) => ({ ...current, email: validation.values.email }));
      setPhase('reset');
      setResendSeconds(60);
      setMessage(GENERIC_REQUEST_MESSAGE);
    } catch (requestError) {
      showRequestError(requestError);
    } finally {
      setSubmitting(false);
    }
  }

  async function resendOtp() {
    if (submitting || resendSeconds > 0) return;
    setError('');
    setMessage('');
    setFieldErrors({});
    setSubmitting(true);
    try {
      await authService.requestPasswordReset(form.email);
      setResendSeconds(60);
      setMessage(GENERIC_REQUEST_MESSAGE);
    } catch (requestError) {
      showRequestError(requestError);
    } finally {
      setSubmitting(false);
    }
  }

  function changeEmail() {
    if (submitting) return;
    setPhase('request');
    setResendSeconds(0);
    setForm((current) => ({
      ...current,
      otp: '',
      password: '',
      confirmPassword: '',
    }));
    setFieldErrors({});
    setError('');
    setMessage('');
  }

  async function completeReset(event) {
    event.preventDefault();
    if (submitting) return;

    const validation = validatePasswordResetCompletion(form);
    setFieldErrors(validation.errors);
    setError('');
    setMessage('');
    if (Object.keys(validation.errors).length) return;

    setSubmitting(true);
    try {
      await authService.resetPassword(validation.values);
      navigate('/login', {
        replace: true,
        state: {
          message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
          from: safeReturnPath(location.state?.from, '/'),
        },
      });
    } catch (requestError) {
      showRequestError(requestError);
    } finally {
      setSubmitting(false);
    }
  }

  const isResetPhase = phase === 'reset';

  return (
    <main className="auth-page auth-page--forgot-password">
      <div className="auth-page-shell">
        <aside className="auth-brand-panel">
          <img src="/assets/logo/logo.png" alt="" className="auth-brand-logo" />
          <p className="auth-brand-kicker">GreenHome Kitchen</p>
          <h2>Khôi phục quyền truy cập an toàn.</h2>
          <p>Mã OTP chỉ có hiệu lực trong thời gian ngắn để bảo vệ tài khoản và các đơn hàng của bạn.</p>
        </aside>

        <form
          className="auth-form-panel"
          onSubmit={isResetPhase ? completeReset : requestOtp}
          aria-busy={submitting}
          noValidate
        >
          <div className="auth-form-heading">
            <p className="auth-eyebrow">Bảo mật tài khoản</p>
            <h1>Quên mật khẩu</h1>
            <p>
              {isResetPhase
                ? 'Nhập mã OTP trong email và tạo mật khẩu mới.'
                : 'Nhập email tài khoản để nhận mã OTP đặt lại mật khẩu.'}
            </p>
          </div>

          <div className="auth-feedback" aria-live="polite">
            {message && <div className="auth-success" role="status">{message}</div>}
            {error && <div className="auth-alert" role="alert">{error}</div>}
          </div>

          <div className="auth-fields">
            <label htmlFor="forgot-password-email">
              Email
              <input
                id="forgot-password-email"
                type="email"
                value={form.email}
                autoComplete="email"
                onChange={(event) => updateField('email', event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'forgot-password-email-error' : undefined}
                required
                disabled={submitting || isResetPhase}
              />
              {fieldErrors.email && (
                <span id="forgot-password-email-error" className="auth-field-error" role="alert">
                  {fieldErrors.email}
                </span>
              )}
            </label>

            {isResetPhase && (
              <>
                <label htmlFor="forgot-password-otp">
                  Mã OTP
                  <input
                    id="forgot-password-otp"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength="6"
                    value={form.otp}
                    autoComplete="one-time-code"
                    onChange={(event) => updateField('otp', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.otp)}
                    aria-describedby={fieldErrors.otp ? 'forgot-password-otp-error' : undefined}
                    required
                    disabled={submitting}
                  />
                  {fieldErrors.otp && (
                    <span id="forgot-password-otp-error" className="auth-field-error" role="alert">
                      {fieldErrors.otp}
                    </span>
                  )}
                </label>

                <label htmlFor="forgot-password-new-password">
                  Mật khẩu mới
                  <input
                    id="forgot-password-new-password"
                    type="password"
                    value={form.password}
                    autoComplete="new-password"
                    onChange={(event) => updateField('password', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'forgot-password-new-password-error' : undefined}
                    required
                    disabled={submitting}
                  />
                  {fieldErrors.password && (
                    <span id="forgot-password-new-password-error" className="auth-field-error" role="alert">
                      {fieldErrors.password}
                    </span>
                  )}
                </label>

                <label htmlFor="forgot-password-confirm-password">
                  Xác nhận mật khẩu mới
                  <input
                    id="forgot-password-confirm-password"
                    type="password"
                    value={form.confirmPassword}
                    autoComplete="new-password"
                    onChange={(event) => updateField('confirmPassword', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={fieldErrors.confirmPassword ? 'forgot-password-confirm-password-error' : undefined}
                    required
                    disabled={submitting}
                  />
                  {fieldErrors.confirmPassword && (
                    <span id="forgot-password-confirm-password-error" className="auth-field-error" role="alert">
                      {fieldErrors.confirmPassword}
                    </span>
                  )}
                </label>
              </>
            )}
          </div>

          {isResetPhase && (
            <div className="auth-secondary-actions">
              <button
                className="auth-text-button"
                type="button"
                onClick={resendOtp}
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
            {submitting
              ? 'Đang xử lý…'
              : isResetPhase
                ? 'Đặt lại mật khẩu'
                : 'Gửi mã OTP'}
          </button>

          <p className="auth-cross-link">
            <Link
              to="/login"
              state={{ from: safeReturnPath(location.state?.from, '/') }}
            >
              Quay lại đăng nhập
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
