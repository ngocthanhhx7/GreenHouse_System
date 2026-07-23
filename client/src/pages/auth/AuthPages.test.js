import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const login = readFileSync(join(process.cwd(), 'src/pages/auth/LoginPage.jsx'), 'utf8');
const register = readFileSync(join(process.cwd(), 'src/pages/auth/RegisterPage.jsx'), 'utf8');
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
