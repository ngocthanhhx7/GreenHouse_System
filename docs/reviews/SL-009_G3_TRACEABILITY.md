# SL-009 G3 Traceability

**Slice:** Notification, Audit, Reporting, and Configuration
**Business rules:** BR-094 through BR-105
**Acceptance criteria:** AT-175 through AT-204
**Integration owner/reviewer:** Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`

## Actor and authority closure

| Actor | Implemented authority | Enforced denial |
|---|---|---|
| Guest | Approved identity/security email only | No inbox, Audit, Reports, or Settings |
| Customer | Own inbox, read, archive, and currently authorized customer target | No foreign inbox/target or administrative data |
| Staff | Own operational inbox and owning-slice target | No Admin Audit/Reports/Settings |
| WarehouseManager | Own warehouse inbox and owning-slice target | No global Settings or Staff/Admin mutation |
| Admin | Own inbox, immutable Audit read, Reports read, allowlisted Settings update | No foreign notification body or operational-role bypass |
| System/payOS/Carrier/EmailService | Attributed integration evidence through verified adapters | No User impersonation |

Notification target metadata is never an authorization grant. The target resolver
calls the current owning-slice read boundary and returns one generic unavailable
result when role, ownership, target, or state is no longer valid.

## State and data invariants

- Domain state, mandatory Audit, and canonical `DomainOutbox` handoff share one
  MongoDB transaction. Mandatory write failure rolls back the command.
- Logical Notification uniqueness is business event + recipient identity + type
  + channel. In-app state is monotonic `Unread -> Read -> Archived`; there is no
  delete route.
- Email delivery is bounded to five claimed attempts, retains append-only
  attempt evidence, uses lease-token finalization, and terminalizes as `Failed`.
- Audit is append-only, privacy-allowlisted, attributable to real User/System/
  external actors, and Admin-read-only with stable timestamp/audit-ID cursor.
- Reports use Asia/Ho_Chi_Minh half-open periods, immutable completed-sale and
  refund clocks, and separately labelled current snapshots.
- Settings accept only `PAYMENT_TIMEOUT_MINUTES` and
  `LOW_STOCK_DEFAULT_THRESHOLD`; one versioned batch, Audit, and reevaluation
  outbox commit atomically. `RETURN_WINDOW_DAYS` is unsupported.

## Requirement-to-code-to-test mapping

| Acceptance | Production evidence | Automated evidence |
|---|---|---|
| AT-175 | `domainEventProducer.service.js`; canonical producers in Order, Payment, expiry, Fulfillment, Exchange, Return/Refund | producer, Order, Payment, expiry, Fulfillment, Exchange, Return rollback/replay tests |
| AT-176 | canonical event hash; tuple-unique Notification; canonical outbox consumer | `sl009.notification.acceptance.test.js`, `domainEventProducer.service.test.js`, `notificationOutbox.service.test.js` |
| AT-177 | `notificationPolicy.service.js`; approved event/channel matrix; Packed excluded | Notification acceptance/service/producer-contract tests |
| AT-178 | `notificationContract.js`; safe template/display allowlist; Received naming | Notification/Email model, acceptance, and rendering tests |
| AT-179 | Notification model/service/routes/controllers and account inbox UI | model/service/controller/route tests and `notificationUiContract.test.js` |
| AT-180 | `notificationTargetResolver.service.js`; current actor/owner/state recheck | target-resolver service tests and notification UI contract |
| AT-181 | active-recipient resolution, exact recipient/broadcast selector, role policy | Notification service/producer tests and Email delivery tests |
| AT-182 | canonical DomainOutbox and Email payload sanitizers reject private fields | DomainOutbox model, Audit serializer, Email sanitizer tests |
| AT-183–185 | canonical immutable attributed `AuditLog` model and legacy adapter | Audit model/logger/service tests |
| AT-186–188 | denied/failed/external/delivery evidence and recursive privacy serializer | Audit serializer/logger, Email worker, domain command failure tests |
| AT-189 | Admin-only bounded filters and `(timestamp, auditId)` cursor paging | Audit service/controller/routes tests |
| AT-190 | Vietnam current-month/default/all-time half-open range | `report.sl009.acceptance.test.js` |
| AT-191–193 | immutable completed sale/refund facts; late collection; negative Net | report acceptance tests |
| AT-194 | event-time Order measures and separate current backlog | report acceptance tests |
| AT-195 | immutable product line snapshots, inactive history, deterministic ties | report acceptance tests |
| AT-196 | current/new/ordering/completed-sale Customer populations | report acceptance tests |
| AT-197 | attributable Staff workload/durations, Disabled retention, no ranking | report acceptance tests |
| AT-198 | Inventory dimensions/alerts snapshot and signed movement period | report acceptance and Admin report UI tests |
| AT-199–200 | exact Settings allowlist, complete batch/range/reason validation | `systemSetting.service.test.js` |
| AT-201 | future-only payment timeout snapshot in Order transaction | `order.service.test.js` |
| AT-202–203 | Product override precedence and idempotent low-stock reevaluation | System Setting and low-stock lifecycle tests |
| AT-204 | version/CAS/idempotency and state+Audit+outbox all-or-none | `systemSetting.persistence.test.js` |

## Migration and compatibility

`migrateSl009CrossCutting.js` provides preflight, dry-run-by-default, explicit
apply, and verifier modes. It canonicalizes only unambiguous legacy
Notification, Audit, EmailOutbox, DomainOutbox, and Settings facts; ambiguous
logical identities fail closed. A second clean apply produces zero business
writes. Legacy SL-008 source events remain source evidence; only canonical
notification envelopes (`payloadSchemaVersion: 1`) are consumed for delivery.

## Verification evidence — 2026-07-25

- Full server regression: `1052/1052` PASS across 170 suites.
- Full client regression: `258/258` PASS.
- Production client build: PASS (`156` modules).
- SL-009 migration tests: `7/7` PASS, including optimistic concurrent-write
  conflict detection.
- Domain producer + DomainOutbox + Email focused tests: `23/23` PASS.
- SL-008 Review/Support + Notification integration: `58/58` PASS.
- Return/Refund: `42/42` PASS; Exchange/Fulfillment: `73/73` PASS.
- `git diff --check`: PASS.
