# SL-009 Release Audit

**Date:** 2026-07-25
**Slice:** Notification, Audit, Reporting, and Configuration
**Baseline:** merged SL-008 `main`
**Reviewer:** Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`

## Ownership review

Commit authors match the documented owner:

- Notification: Nguyễn Quang Huy `<quanghuyn267@gmail.com>`.
- Reports/Settings: Lê Vũ Cường `<levucuong0319@gmail.com>`.
- Audit/DomainOutbox/Email/migration/integration: Nguyễn Ngọc Thành
  `<thanhnnhe186491@fpt.edu.vn>`.

## Closed discrepancies

| Baseline gap | Release result |
|---|---|
| Best-effort or post-commit mandatory side effects | State, mandatory Audit, and canonical outbox share one transaction |
| Weak outbox identity/payload | Canonical immutable identity/hash, safe schema, bounded claim/retry |
| Notification delete and weak uniqueness | Tuple uniqueness and retained Unread/Read/Archived lifecycle |
| Email retry was unbounded/incomplete | Five-attempt terminal policy, append-only evidence, lease fencing |
| Audit lacked attribution/privacy/cursor contract | Real actor/source, safe serializer, append-only Admin cursor API |
| Mutable-current-state reporting | Vietnam event-time measures plus labelled current snapshots |
| Generic sequential Settings | Exact allowlist, version/CAS/idempotency, atomic Audit/outbox |
| Legacy Return window setting | Removed from active SL-009 configuration contract |
| SL-008 source events lacked delivery-ready recipient facts | Production adapters emit canonical minimum-safe Review/Support delivery envelopes |

## Review findings and disposition

- Return/Refund Audit and Notification calls outside their state transaction
  were moved into the transaction. An injected outbox failure proves rollback.
- Legacy Notification-shaped source rows are not claimed accidentally:
  delivery consumes only canonical `payloadSchemaVersion: 1` rows.
- Review/Support integration preserves SL-008 exact command/outbox acceptance
  and never adds message/review content to delivery payloads.
- Existing legacy drains exclude canonical rows where event types overlap.
- No `.env`, secret, runtime upload, generated output, `docs/superpowers`, or
  `docs/ui-prompts` file is included.

## Gates

- Requirement → code → test traceability: PASS.
- Server regression: `1052/1052` PASS across 170 suites.
- Client regression: `258/258` PASS.
- Production client build: PASS.
- Migration repeat-safety/fail-closed tests: `7/7` PASS, including optimistic
  concurrent-write conflict detection.
- Actor/RBAC/privacy boundaries: PASS through server/client acceptance.
- `git diff --check`: PASS.
- Remaining build warning: non-blocking large JavaScript chunk; documented in
  handoff.

SL-009 is ready for final branch commit, review, `--no-ff` merge, push, and
feature-branch deletion.
