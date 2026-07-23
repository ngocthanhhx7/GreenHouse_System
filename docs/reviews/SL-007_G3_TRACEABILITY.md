# SL-007 G3 Traceability

## Actor and authorization matrix

| Actor | Allowed boundary | Denied boundary | Evidence |
|---|---|---|---|
| Guest | Request/complete verified Customer registration, login, password recovery, accept an internal invitation | Protected APIs, role/status selection, registration address, session creation before proof | auth/invitation routes, registration/password-reset services and tests |
| Customer | Own profile, password, avatar and maximum-ten structured addresses | Foreign profile/address, account administration, role/status/email changes | profile/address routes and services, role matrix, AT-144–148 tests |
| Staff | Own security/profile plus previously approved Staff operations | Customer address/credential input, account governance, Warehouse/Admin actions | central role matrix, route contracts and full regression |
| WarehouseManager | Own security/profile plus physical-stock operations | Customer address/credential input, account governance and Staff/Admin actions | central role matrix, route contracts and full regression |
| Admin | Minimum account metadata, Staff/Warehouse invitations, guarded status and internal-role commands | Password/OTP/token access, profile/address editing, impersonation, hard delete, Customer conversion, Admin creation/assignment | admin account routes/service/UI and AT-133–135 tests |
| System / Email delivery | Enforce session/RBAC/state/ownership; persist audit/outbox; deliver authorized messages | Invent approval, expose secrets, restore revoked sessions or roll back committed business state because email failed | session/auth middleware, AuditLog, DomainOutbox/EmailOutbox and tests |

## Business-rule traceability

| Decision / requirement | Implementation | Acceptance evidence |
|---|---|---|
| BD-075 / BR-071 separate pre-account state | `registrationChallenge.model.js`, `internalInvitation.model.js`, `user.model.js` | AT-125–131 model/service tests |
| BD-076 / BR-072 verified Customer registration | `registration.service.js`, auth controller/routes, `RegisterPage.jsx` | AT-125–128 including OTP bounds, transaction rollback and durable completion replay |
| BD-077 / BR-073 internal invitation | `internalInvitation.service.js`, Admin/accept routes and pages | AT-129–131 including expiry replacement, resend race, revoke and attributed audit |
| BD-078 / BR-074 fixed single-role authority | `roleMatrix.js`, auth/authorize middleware, admin role transfer | AT-132–133 route, middleware and service tests |
| BD-079 / BR-075 least-privilege Admin governance | `adminAccount.service.js`, controller/routes, `AccountManagementPage.jsx` | AT-133–135 and forbidden-command tests |
| BD-080 / BR-076 privacy-safe login throttling | `loginThrottle.service.js`, `security.middleware.js`, auth service | AT-136–138 login/throttle tests and shared public-auth abuse-budget test |
| BD-081 / BR-077 revocable cookie session | `userSession.model.js`, `session.service.js`, auth middleware, CSRF middleware, cookie helpers | AT-139–141 session/cookie/CSRF tests and client no-bearer tests |
| BD-082 / BR-078 session revocation | session service integrated with logout, password, status and role operations | AT-135, AT-140–143 transaction and revocation tests |
| BD-083 / BR-079 one password/reset policy | `passwordPolicy.js`, registration/invitation/profile/password-reset services | policy and AT-126/130/142/143 tests |
| BD-084 / BR-080 self-owned profile/avatar | User canonical fields, profile service/routes/page and managed upload boundary | AT-144–146 model/service/route/UI tests |
| BD-085 / BR-081 Customer address book | `userAddress.model.js`, transaction-aware address service, profile routes/UI | AT-147–149 ownership, ten-address, atomic default and rollback tests |
| BD-086 / BR-082 continuity on disable and role transfer | concrete cross-slice assignment adapters, shared `assignmentEpoch` write-conflict fence and durable `ACCOUNT_DISABLED` outbox handoff | AT-149 assignment/session/outbox tests plus exact six-producer interleaving regression |

## Security and data invariants

- A persisted User is exactly `Active` or `Disabled` and has one recognized role.
- Protected requests require a current server-side session cookie; bearer/localStorage authority is rejected.
- Password change/reset, role transfer and disable revoke every server session in the same transaction.
- Registration OTP is latest-only, ten minutes, five attempts, sixty-second resend cooldown and stored only as HMAC evidence.
- Internal invitation is one exact Staff/Warehouse role, expires after 24 hours, and never stores an Admin-selected password.
- Admin status/role commands use scoped SHA-256 fingerprints and unique AuditLog identities for restart/concurrent replay.
- A non-empty Customer address book has exactly one default; default switching is atomic.
- Every address mutation serializes through the owning User so capacity and default invariants survive concurrent writes.
- Role transfer and active-assignment producers from SL-001, SL-002, SL-003, SL-005 and SL-008 write the same User fence in one Mongo transaction.
- Password writes use a credential version and every session records the credential version that authenticated it.
- Audit/outbox data contains no password, raw OTP, invitation token, session secret or full address.

## Migration and gate evidence

- Migration: `server/src/scripts/migrateAccountAuthRbac.js`.
- Sixteen explicit repeat-safe indexes cover sessions, atomic login throttling, registration/invitation TTL, idempotency and single-live identity, plus one-default-address authority.
- Unique-conflict preflight runs before legacy User or UserSession mutation.
- Disposable local `rs0` evidence:
  - first apply: one legacy User and one legacy UserSession migrated and 16 indexes created;
  - second apply: zero User/session writes and zero index creates;
  - no required index missing;
  - duplicate live-registration preflight blocked before User/session mutation and index creation;
  - legacy phone and credential fields remained unchanged when a conflict existed.
- Focused SL-007 regression: `122/122`, 23 suites.
- Full server regression: `686/686`, 119 suites.
- Full client regression: `177/177`, 51 suites.
- `verify:sl007-account-auth-rbac`: `15/15` checks passed.
- Client production build: pass; the pre-existing Vite chunk-size warning remains.

This evidence proves local release readiness. It does not claim production migration or deployment.
