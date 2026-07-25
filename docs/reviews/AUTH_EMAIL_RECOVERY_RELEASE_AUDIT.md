# Auth Email Recovery Release Audit

## Decision

- Slice: Auth Email Recovery UI closure.
- Owner/reviewer: Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`.
- Base: `origin/main` at `13842df`.
- Local result: ready for owner commit and final integration.
- Production deployment, Gmail delivery and production data are not claimed.

## Closed findings

| Finding | Closure evidence |
|---|---|
| Password-reset backend had no client entry point | Login link, public route and two-step page |
| Client had no recovery API adapter | Exact request/reset methods with cookie credentials |
| Client had no password-reset validation | Pure email/OTP/password/confirmation validator and field errors |
| Recovery UI lacked async and resend states | pending lock, accessible feedback, 60-second resend and edit-email |
| Registration verification could regress during Auth polish | source contract, 30 server Auth tests and direct-registration-disabled verifier |
| Responsive behavior was unproven | Playwright E2E on desktop and mobile with no horizontal overflow |

## Gate evidence

- Client targeted: `21/21`.
- Server Auth targeted: `30/30`.
- SL-007 verifier: `15/15`.
- Browser E2E: `2/2`.
- Full server regression: `1078/1078`, 172 suites.
- Full client regression: `315/315`, 76 suites.
- Production client build: pass, 168 modules.
- JavaScript syntax and `git diff --check`: pass.
- Server dependency audit: zero vulnerabilities.
- No migration exists or is required for this client-only closure.

## Warnings and risk assessment

- Vite reports one non-blocking bundle warning: the main JavaScript chunk is
  `733.23 kB`, above the `500 kB` recommendation. The build exits `0`; this is a
  pre-existing performance concern, not an Auth correctness failure.
- Client dependency audit reports three high advisories from the unchanged
  baseline: direct `react-router-dom`, transitive `react-router`, and transitive
  `postcss`. The React Router advisory concerns React Server Components action
  execution; this application is a Vite client SPA and does not use RSC. The
  PostCSS advisory concerns build-time source-map loading from untrusted input;
  production users do not supply build sources. Package manifests and lockfiles
  are unchanged so dependency remediation remains a separately reviewed upgrade.
- One baseline full-suite run under parallel build/test load exposed a timing
  assertion in `domainOutbox.worker.test.js`. The isolated test passed `20/20`
  and full server regression passed when run alone before and after this feature.
  No domain-outbox file is changed.

## Security review

- No token, password, OTP, Gmail credential or reset secret is logged or committed.
- Unknown/Disabled account behavior remains indistinguishable before OTP proof.
- Backend remains authoritative for password policy and credential mutation.
- Reset does not establish a session; successful credential change revokes old
  sessions through the existing server transaction.
- Registration still creates a Customer only after verified OTP consumption.

## Remaining deployment-only actions

- Supply SMTP/Gmail and `RESET_OTP_SECRET` configuration through the deployment
  secret store.
- Run an authenticated target-environment mailbox walkthrough.
- Schedule dependency and bundle-splitting work as separately owned changes.
