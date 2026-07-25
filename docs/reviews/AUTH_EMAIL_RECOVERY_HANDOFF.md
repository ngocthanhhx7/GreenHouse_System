# Auth Email Recovery Handoff

## Status

- Module: Auth / password recovery and mandatory registration verification.
- Implementation and integration owner: Nguyễn Ngọc Thành
  `<thanhnnhe186491@fpt.edu.vn>`.
- Branch: `feature/thanh-auth-email`.
- State: local implementation and verification complete; pending owner commit and
  final integration at the time this handoff was written.

## Delivered behavior

- Login displays `Quên mật khẩu?` and preserves the safe shopping return path.
- `/forgot-password` keeps request and reset steps on one responsive page.
- Request uses a privacy-safe acknowledgement for existing, missing and Disabled
  identities.
- Reset accepts the six-digit OTP, new password and confirmation with
  field-specific Vietnamese errors.
- Resend is locked for sixty seconds; the Guest may return to edit the email.
- Successful reset returns to Login and does not create a session.
- Existing Customer registration remains challenge-first and cannot bypass email
  OTP verification.

## Key files

- Page and route: `client/src/pages/auth/ForgotPasswordPage.jsx`,
  `client/src/pages/auth/LoginPage.jsx`, `client/src/App.jsx`.
- API and validation: `client/src/services/authService.js`,
  `client/src/utils/passwordResetValidation.js`.
- UI styles: `client/src/styles/modules/public-account.css`.
- Tests: Auth service/page/validation unit contracts and
  `client/e2e/auth-email-recovery.spec.js`.
- Traceability and audit:
  `AUTH_EMAIL_RECOVERY_G3_TRACEABILITY.md`,
  `AUTH_EMAIL_RECOVERY_RELEASE_AUDIT.md`.

## Verification

```text
client Auth targeted: 21/21
server Auth targeted: 30/30
SL-007 verifier: 15/15
browser E2E desktop/mobile: 2/2
server: 1078/1078, 172 suites
client: 315/315, 76 suites
client production build: PASS, 168 modules
server npm audit: 0 vulnerabilities
```

## Deployment boundaries

- Configure Gmail SMTP/EmailOutbox and a strong `RESET_OTP_SECRET` outside Git.
- This change includes no database migration or new environment variable.
- SMTP delivery against the target mailbox remains a deployment walkthrough; no
  real secret or production email was used in local verification.
- The Vite chunk-size warning and three baseline client dependency advisories are
  recorded in the release audit.
