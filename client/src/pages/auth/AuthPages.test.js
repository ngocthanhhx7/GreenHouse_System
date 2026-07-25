import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const login = readFileSync(join(process.cwd(), 'src/pages/auth/LoginPage.jsx'), 'utf8');
const register = readFileSync(join(process.cwd(), 'src/pages/auth/RegisterPage.jsx'), 'utf8');
const forgotPasswordPath = join(process.cwd(), 'src/pages/auth/ForgotPasswordPage.jsx');
const forgotPassword = existsSync(forgotPasswordPath) ? readFileSync(forgotPasswordPath, 'utf8') : '';
const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
const protectedRoute = readFileSync(join(process.cwd(), 'src/components/auth/ProtectedRoute.jsx'), 'utf8');
const unauthorized = readFileSync(join(process.cwd(), 'src/pages/errors/UnauthorizedPage.jsx'), 'utf8');
const forbidden = readFileSync(join(process.cwd(), 'src/pages/errors/ForbiddenPage.jsx'), 'utf8');
const styles = readFileSync(join(process.cwd(), 'src/styles/modules/public-account.css'), 'utf8');

describe('public authentication responsive contract', () => {
  it('gives login and registration a distinct, labelled GreenHome auth surface', () => {
    assert.match(login, /className="auth-page auth-page--login"/);
    assert.match(register, /className="auth-page auth-page--register"/);
    assert.match(login, /className="auth-brand-panel"/);
    assert.match(register, /className="auth-brand-panel"/);
    assert.match(login, /className="auth-form-panel"/);
    assert.match(register, /className="auth-form-panel"/);
    assert.match(login, /htmlFor="login-email"/);
    assert.match(login, /htmlFor="login-password"/);
    assert.match(register, /requestRegistrationChallenge/);
    assert.match(register, /htmlFor="register-otp"/);
    assert.doesNotMatch(register, /register-address|name="address"/);
  });

  it('keeps async auth feedback accessible and prevents duplicate submissions', () => {
    for (const page of [login, register]) {
      assert.match(page, /const \[submitting, setSubmitting\] = useState\(false\)/);
      assert.match(page, /aria-live="polite"/);
      assert.match(page, /aria-busy=\{submitting\}/);
      assert.match(page, /disabled=\{submitting\}/);
      assert.match(page, /setSubmitting\(true\)/);
      assert.match(page, /finally \{\s*setSubmitting\(false\);\s*\}/);
    }
  });

  it('preserves a safe shopping return path through login and registration', () => {
    assert.match(login, /useLocation/);
    assert.match(login, /safeRoleReturnPath/);
    assert.match(login, /safeRoleReturnPath\(location\.state\?\.from,\s*user\.role,\s*dashboardPath\)/);
    assert.match(login, /location\.state\?\.from/);
    assert.match(login, /state=\{\{\s*from:/);
    assert.match(register, /useLocation/);
    assert.match(register, /safeReturnPath/);
    assert.match(register, /state:\s*\{\s*message:[\s\S]*?from:/);
  });

  it('sends an unauthenticated protected-route visit to the login form', () => {
    assert.match(protectedRoute, /<Navigate to="\/login" replace state=\{\{ from: location\.pathname \}\} \/>/);
  });

  it('supports OTP resend after 60 seconds and changing the email', () => {
    assert.match(register, /const \[resendSeconds, setResendSeconds\] = useState\(0\)/);
    assert.match(register, /setResendSeconds\(60\)/);
    assert.match(register, /async function resendChallenge/);
    assert.match(register, /Gửi lại mã/);
    assert.match(register, /Thay đổi email/);
    assert.doesNotMatch(register, /challengeId/);
  });

  it('keeps Customer registration challenge-first and impossible to submit without OTP', () => {
    assert.match(register, /onSubmit=\{challengeSent \? complete : sendChallenge\}/);
    assert.match(register, /await requestRegistrationChallenge\(form\.email\)/);
    assert.match(register, /await completeRegistration\(\{[\s\S]*?otp:\s*form\.otp/);
    assert.match(register, /challengeSent && \([\s\S]*?htmlFor="register-otp"/);
  });

  it('links Login to one public two-step password recovery route', () => {
    assert.match(login, /to="\/forgot-password"/);
    assert.match(login, /Quên mật khẩu\?/);
    assert.match(login, /to="\/forgot-password"[\s\S]*?state=\{\{\s*from:\s*safeReturnPath/);
    assert.match(app, /import ForgotPasswordPage from '\.\/pages\/auth\/ForgotPasswordPage\.jsx'/);
    assert.match(app, /<Route path="forgot-password" element=\{<ForgotPasswordPage \/>\} \/>/);
  });

  it('provides accessible request reset resend and field-error states on the recovery page', () => {
    assert.match(forgotPassword, /requestPasswordReset/);
    assert.match(forgotPassword, /resetPassword/);
    assert.match(forgotPassword, /const \[phase, setPhase\] = useState\('request'\)/);
    assert.match(forgotPassword, /const \[resendSeconds, setResendSeconds\] = useState\(0\)/);
    assert.match(forgotPassword, /setResendSeconds\(60\)/);
    assert.match(forgotPassword, /htmlFor="forgot-password-email"/);
    assert.match(forgotPassword, /htmlFor="forgot-password-otp"/);
    assert.match(forgotPassword, /htmlFor="forgot-password-new-password"/);
    assert.match(forgotPassword, /htmlFor="forgot-password-confirm-password"/);
    assert.match(forgotPassword, /aria-live="polite"/);
    assert.match(forgotPassword, /className="auth-field-error"/);
    assert.match(forgotPassword, /Gửi lại mã/);
    assert.match(forgotPassword, /Thay đổi email/);
  });

  it('uses the shared responsive surface instead of the legacy generic auth card', () => {
    assert.match(styles, /\.auth-page(?:\s*,|\s*\{)/);
    assert.match(styles, /\.auth-page-shell\s*\{/);
    assert.match(styles, /\.auth-brand-panel\s*\{/);
    assert.match(styles, /\.auth-form-panel\s*\{/);
    assert.match(styles, /\.auth-form-panel input,\s*\.auth-form-panel textarea\s*\{[\s\S]*?min-height:\s*44px/);
    assert.match(styles, /\.auth-form-panel input:focus-visible,[\s\S]*?\.auth-form-panel textarea:focus-visible/);
    assert.match(styles, /@media \(max-width:\s*760px\)/);
  });

  it('renders calm, standalone access states with the only allowed recovery action', () => {
    assert.match(unauthorized, /className="access-state-page"/);
    assert.match(unauthorized, /className="access-state-card"/);
    assert.match(unauthorized, /aria-hidden="true">🔒/);
    assert.match(unauthorized, /to="\/login"/);
    assert.match(forbidden, /className="access-state-page"/);
    assert.match(forbidden, /className="access-state-card"/);
    assert.match(forbidden, /aria-hidden="true">🛡️/);
    assert.match(forbidden, /to="\/profile"/);
  });
});
