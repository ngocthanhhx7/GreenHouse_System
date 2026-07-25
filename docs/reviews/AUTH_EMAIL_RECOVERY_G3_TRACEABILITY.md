# Auth Email Recovery G3 Traceability

## Scope and owner

- Module: Auth / Email OTP / Password Recovery UI.
- Owner: Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`.
- Branch: `feature/thanh-auth-email`.
- Base: `origin/main` at `13842df`.

## Actor and authorization matrix

| Actor | Allowed | Denied | Evidence |
|---|---|---|---|
| Guest | Request a reset OTP and submit OTP plus a new password | Learn whether an account exists; receive a session automatically | `ForgotPasswordPage.jsx`, `authService.js`, password-reset tests |
| Active account owner | Receive the OTP through EmailOutbox and replace credentials after proof | Reuse, exceed attempt limit, or overwrite a concurrent credential change | `passwordReset.service.js` and tests |
| Unknown or Disabled identity | Receive the same public acknowledgement | Account/status disclosure | anti-enumeration password-reset tests |
| New Customer | Request registration challenge and complete registration with OTP | Direct account creation without OTP | `RegisterPage.jsx`, registration service/tests, SL-007 verifier |

## Requirement to code to test

| Requirement | Code | Verification |
|---|---|---|
| AR-REC-01 Login exposes password recovery | `client/src/pages/auth/LoginPage.jsx`, `client/src/App.jsx` | Auth page contract; browser E2E |
| AR-REC-02 One public two-step recovery page | `client/src/pages/auth/ForgotPasswordPage.jsx` | Auth page contract; desktop/mobile E2E |
| AR-REC-03 Public recovery API adapter | `client/src/services/authService.js` | `authService.test.js` |
| AR-REC-04 Frontend and backend field validation | `passwordResetValidation.js`, Auth request schemas | validation unit tests; route validation tests |
| AR-REC-05 Cooldown and edit-email recovery | `ForgotPasswordPage.jsx` | Auth page contract; browser E2E |
| AR-REC-06 Reset returns to Login without a new session | `ForgotPasswordPage.jsx` | auth-service test; browser E2E |
| AR-REG-01 Customer registration cannot bypass OTP | existing registration service/routes and `RegisterPage.jsx` | registration targeted tests; `direct-registration-disabled` verifier |
| AR-SEC-01 Preserve OTP/session/privacy invariants | existing password-reset service and EmailOutbox | password-reset targeted tests; full server regression |

## Security and data invariants

- Public request and pre-proof completion do not reveal email existence or status.
- OTP remains six digits, latest valid proof only, ten-minute TTL, sixty-second
  cooldown, five-attempt maximum and one-time use.
- OTP is not stored or sent in plaintext persistence; EmailOutbox payload remains
  encrypted according to the existing server contract.
- Password replacement uses credential-version fencing and revokes prior sessions.
- Registration creates no User, address or session before verified OTP completion.
- The client stores no bearer token and creates no authenticated state after reset.

## Verification evidence

- Client Auth targeted: `21/21`, 3 suites.
- Server Auth targeted: `30/30`, 3 suites.
- SL-007 static verifier: `15/15`.
- Browser E2E: `2/2` across desktop `1280x720` and mobile `375x812`.
- Full server: `1078/1078`, 172 suites.
- Full client: `315/315`, 76 suites.
- Production build: `168` modules, exit `0`.
- No migration applies to this client closure.
