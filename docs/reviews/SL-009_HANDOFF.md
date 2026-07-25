# SL-009 Handoff

**Slice:** Notification, Audit, Reporting, and Configuration
**Branch:** `feature/sl-009-notification-audit-reporting-config`
**Reviewer/integration owner:** Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`

## Delivered

- Nguyễn Quang Huy: canonical Notification channel policy, logical tuple
  deduplication, retained inbox lifecycle, authorized target resolution, role
  boundaries, bell/dropdown/list/detail UI, and canonical event consumption.
- Lê Vũ Cường: definition-backed Admin reports and atomic versioned System
  Settings with future-only timeout and low-stock reevaluation semantics.
- Nguyễn Ngọc Thành: immutable attributed Audit, canonical DomainOutbox
  producer, bounded EmailOutbox delivery, source-seam integration, migration,
  regression, review, and release evidence.

Protected Order, Payment, expiry, Fulfillment, Exchange, Return/Refund, Review,
and Support seams now preserve recoverable cross-cutting handoff. Review
moderation and Staff Support replies/results produce minimum-safe customer
events; internal Support assignment events remain in-app only. Full Review or
Support text is never copied into Notification or email payloads.

## Operational commands

From `server`:

```powershell
npm test
npm run migrate:sl009
npm run migrate:sl009:apply
npm run verify:sl009
```

`migrate:sl009` is dry-run by default. Before apply, back up the target database,
confirm the exact environment/database, and run MongoDB as a replica set or
mongos because protected writes require transactions. Never apply against a
standalone MongoDB topology.

From `client`:

```powershell
npm test
npm run build
```

No secret or `.env` value is introduced by this handoff. Existing SMTP and
provider credentials remain deployment-local.

## Post-deploy checks

1. Run the SL-009 dry-run and resolve any fail-closed ambiguity.
2. Apply once, run `verify:sl009`, then rerun apply and confirm zero business
   writes.
3. Verify Customer Review moderation and Staff Support response produce one
   in-app item and one email tuple.
4. Verify Staff/Warehouse operational events create in-app only.
5. Verify foreign notification IDs and stale target links return the generic
   unavailable response.
6. Verify Admin Audit filters/cursors, all report period modes, Settings CAS,
   and low-stock override precedence.
7. Confirm the Email worker terminalizes the fifth failed attempt and records
   safe delivery evidence without changing the source business state.

## Known non-blocking observation

The production build reports one Vite large-chunk warning (main JavaScript
approximately 699 kB before gzip). Functional build and tests pass; code
splitting is a later performance task, not an SL-009 correctness blocker.

## Evidence

- [G3 traceability](SL-009_G3_TRACEABILITY.md)
- [Release audit](SL-009_RELEASE_AUDIT.md)
- [Implementation plan](SL-009_IMPLEMENTATION_PLAN.md)
