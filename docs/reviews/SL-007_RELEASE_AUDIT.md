# SL-007 Release Audit

## Decision

- Slice: SL-007 — Account, Authentication, RBAC, Profile and Address
- Owner/reviewer: Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`
- Base: `main` at SL-005 merge `1ece568`
- Result: **READY FOR MERGE**
- Production deployment and production-data migration are not claimed.

## Closed findings

| Finding | Closure evidence |
|---|---|
| Registration created an Active User before email proof | Separate RegistrationChallenge state and atomic verified completion; no registration address/session |
| OTP attempts/outbox were non-atomic | Attempt state commits before distinct error; challenge replacement and email outbox share a transaction |
| Registration, invitation and reset completion leaked account/challenge state | Pre-proof responses use one generic envelope; valid durable replay remains idempotent |
| Completion retry failed after restart | Scoped audit identity and non-secret command fingerprint replay exactly one User/outbox result |
| Invitation lacked actor/audit/transaction | Admin actor propagates through controller/service; create/resend/revoke/accept persist audit and outbox transactionally |
| Expired invitation blocked fresh create until TTL cleanup | Expired pending state is conditionally marked `Expired` and replaced inside one transaction |
| Concurrent resend surfaced duplicate-key 500 | Duplicate-key loser resolves the matching durable audit/invitation or returns typed key-reuse conflict |
| Concurrent challenges/invitations could create two live identities | Partial unique indexes enforce one PendingVerification/PendingAcceptance record per normalized email |
| Production token secret could fall back | Registration, invitation and reset require a dedicated secret of at least 32 characters in production |
| Public OTP endpoints could rotate recipients around per-email limits | Shared public-auth IP abuse budget covers registration, recovery and invitation acceptance |
| Concurrent login attempts could pass a count-then-write throttle | Atomic Mongo throttle buckets admit exactly five email failures and thirty IP attempts per window |
| Malformed percent-encoded cookies could escape Express 4 middleware | Cookie parsing fails closed and an HTTP regression proves the process remains responsive |
| Password reset/self-change and login/reset races could preserve stale credentials | Conditional credential-version writes prevent overwrite; every session is bound to the credential version it verified |
| Admin status/role replay was process-local | AuditLog event identity is scoped by operation/actor/target with SHA-256 command fingerprint and concurrent/restart replay |
| Admin account search accepted raw regex and unbounded pagination | Search is literal, trimmed and length-bounded; page/pageSize use safe positive caps |
| Role transfer raced a newly created cross-slice assignment | Every active assignment producer and role transfer writes the same session-bound User assignment epoch; transaction retry sees either the new role or the active work |
| Disable had no durable reassignment evidence | Immediate revocation and `ACCOUNT_DISABLED` DomainOutbox handoff commit together; impersonation remains forbidden |
| Default address switch could leave zero default | Require/unset/update run in one transaction; rollback and sole-default tests preserve the invariant |
| Address capacity/default checks admitted concurrent writers | Every address mutation takes one transaction-scoped User address-book lock; exact capacity and delete/create races preserve both invariants |
| Password/profile security event delivery was incomplete | Password mutations revoke sessions and enqueue post-commit confirmation without storing secrets |
| Migration omitted declared indexes, credential binding and conflict ordering | 16 explicit indexes plus repeat-safe User/UserSession version backfill; unique-conflict preflight occurs before every mutation |

## Cross-slice consistency

- SL-001/SL-002 return/refund/exchange facts and Customer-owned financial input remain unchanged.
- SL-003 checkout consumes saved/one-time input but keeps the immutable Order address snapshot.
- SL-003/SL-005 reservation, stock-export, damage and replenishment invariants remain green.
- Admin account authority does not grant Staff, Warehouse, Customer or physical-stock authority.
- Assignment adapters inspect only explicit actor references on non-terminal work; historical terminal work does not block transfer.
- Notification consumption remains assigned to Nguyễn Quang Huy; this slice emits only durable handoff/outbox evidence.

## Verification

- Focused SL-007: `122/122`, 23 suites.
- Server: `686/686`, 119 suites.
- Client: `177/177`, 51 suites.
- Static verifier: `15/15`.
- Production build: pass; existing bundle-size warning only.
- Syntax checks: changed security services pass `node --check`.
- `git diff --check`: clean apart from Windows line-ending notices.
- Disposable MongoDB `rs0`: first apply migrated one legacy User, one legacy session and created 16 indexes; second apply made zero writes and created zero indexes.
- A separate `rs0` conflict probe found duplicate live registration identities and made zero User writes, zero session writes and zero index changes.
- Live throttle probe admitted exactly five concurrent email failures and rejected request six.

## Remaining deployment boundaries

- Back up the intended database and run migration dry-run before apply.
- Configure strong `RESET_OTP_SECRET`, production cookie/CSRF origins and Gmail/EmailOutbox variables outside Git.
- Record authenticated browser walkthrough evidence in the target environment.
- Never commit `.env`, secrets, local database files, `docs/superpowers/` or `docs/ui-prompts/`.

## Final review

- Nguyễn Ngọc Thành reviewed the complete feature diff against `origin/main` after all remediation.
- No P0/P1 finding remains. The production-data migration and authenticated deployment walkthrough remain deployment-owner actions.
