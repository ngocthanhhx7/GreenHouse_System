# SL-007 Handoff

## Status

- Slice: Account, Authentication, RBAC, Profile and Address
- Implementation/integration owner: Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`
- Branch: `feature/sl-007-account-auth-rbac`
- State: **implementation, local verification and final review complete; ready for merge**

## Delivered behavior

- Two-step Customer registration with a six-digit email OTP; no User/session/address exists before verification.
- Expiring Staff/Warehouse Manager invitation with Admin attribution, resend/revoke and recipient-owned password.
- Privacy-safe login failure handling, bounded email/IP throttling and server-authoritative single-role RBAC.
- Revocable server sessions in protected cookies with CSRF protection, idle/absolute expiry and current User/role/credential-version revalidation.
- One password policy for registration, invitation, self-change and reset; security changes revoke all sessions.
- Active Users own only their profile, password and managed avatar; email/role/status remain read-only.
- Customer-only structured address book with maximum ten entries, a serialized mutation lock and atomic one-default invariant.
- Admin sees minimum metadata and may only invite, disable/reactivate or transfer Staff/Warehouse role under reason/version/assignment guards.
- Disable remains immediate and publishes a durable, non-impersonating handoff; role transfer and all active assignment producers share one User write-conflict fence.
- Admin, registration and invitation commands have durable audit-backed idempotency for restart and concurrent retry.

## Key files

- Auth/session: `server/src/services/auth.service.js`, `session.service.js`, auth/CSRF middleware and cookie helpers.
- Registration/recovery/invitation: `registration.service.js`, `passwordReset.service.js`, `internalInvitation.service.js`.
- Governance: `roleMatrix.js`, `adminAccount.service.js`, `activeAssignment.service.js`.
- Profile/address: `profile.service.js`, `userAddress.service.js`, related routes/models.
- Client: registration/invitation/Admin account pages, auth context/services and cookie-only API client.
- Migration/verifier: `migrateAccountAuthRbac.js`, `verifySl007AccountAuthRbac.js`.
- Detailed evidence: `SL-007_RELEASE_AUDIT.md` and `SL-007_G3_TRACEABILITY.md`.

## Migration

From `server`:

```powershell
npm run migrate:account-auth-rbac -- --dry-run
npm run migrate:account-auth-rbac
```

Run against a replica set/mongos after backup. The migration preflights canonical-phone and unique-index conflicts before writes, removes legacy `phone`/free-form `address`, initializes optimistic and credential versioning, binds legacy sessions to credential version zero and creates 16 explicit repeat-safe indexes.

Disposable `rs0` verification proved one clean apply, a zero-write/zero-index second apply and conflict-before-User/session-mutation behavior. Production execution remains a deployment-owner action.

## Regression

```text
focused SL-007: 122/122 tests, 23 suites
server: 686/686 tests, 119 suites
client: 177/177 tests, 51 suites
SL-007 verifier: 15/15 checks
client build: PASS
```

## Downstream contracts

- SL-004 must preserve authenticated Staff/Warehouse fulfillment boundaries and server-session authority.
- SL-006 must keep Guest catalog public and Customer Cart owner-only; account disable never deletes historical Cart/Order facts.
- SL-008 may use the Support assignment adapter but owns support/review workflow and data.
- SL-009 Notification ownership is Nguyễn Quang Huy. SL-007 emits durable domain events; Huy owns notification consumption/read/retry/report behavior.
- Nguyễn Ngọc Thành continues to own EmailOutbox/Gmail delivery, OTP/password reset, Audit, PayOS and final integration.

## Review checklist

- [x] BD-075–086 / BR-071–082 mapped to code and tests.
- [x] AT-125–149 mapped to named evidence.
- [x] Guest/Customer/Staff/Warehouse/Admin boundaries checked.
- [x] Session, OTP, invitation, address and durable idempotency invariants checked.
- [x] Full server/client regression, verifier and production build pass.
- [x] Migration double-run and conflict preflight verified on disposable `rs0`.
- [x] Nguyễn Ngọc Thành records final review.
- [ ] Nguyễn Ngọc Thành merges `--no-ff`.
- [ ] Deployment owner runs backup, dry-run and production migration.
