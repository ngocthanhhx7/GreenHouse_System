# SL-008 Handoff

## Status

- Slice: Product Review and Customer Support
- Implementation owner: Le Vu Cuong `<levucuong0319@gmail.com>`
- Reviewer/integration owner: Nguyen Ngoc Thanh `<thanhnnhe186491@fpt.edu.vn>`
- Branch: `feature/cuong-support-review`
- State: **local implementation and regression complete; independent final review cleared**

## Delivered behavior

- One durable Review identity per Customer and Product, backed by an owned
  delivered OrderDetail and deterministic fallback evidence.
- Independent Customer publication and Staff moderation states with immutable
  content/publication/moderation histories; no Review delete or Staff content
  edit authority.
- Public Review paging, count and one-decimal mean use one visibility predicate
  and expose only masked, verified, catalog-safe data.
- Seven Support request types with owned Order and Active Product reference
  validation, private denials and selector-driven Customer input.
- Immutable chronological Support messages, first-claim race protection,
  current-active-assignee message/priority/transfer/resolve authority, disabled
  assignee recovery, Customer withdraw and exact 72-hour reopen behavior.
- Every mutation uses header-only idempotency identity, JSON expected version,
  one transaction for aggregate/history/command/audit/outbox and identical
  durable replay.
- SL-007 account disable invokes Support assignee recovery in the same Mongo
  transaction/session before the minimum account-disabled outbox handoff.
- Ticket/message reads use bounded single-query facet paging; Support migration
  uses a required Mongo transaction and rejects unprovable state/history.
- Guest, Customer and Staff projections are allowlisted. Admin and Warehouse
  have no SL-008 route or direct-navigation authority.

## Key files

- Review domain/persistence/service: `server/src/services/review.domain.js`,
  `review.persistence.js`, `review.service.js`.
- Support service: `server/src/services/support.service.js`.
- HTTP boundaries: `server/src/controller/review.controller.js`,
  `support.controller.js`, `server/src/routes/review.routes.js`, and
  `support.routes.js`.
- Persistence: ProductReview, Review history/command, SupportRequest,
  SupportMessage, Support history/command models under `server/src/models`.
- Client: Product Review panel/list and Customer/Staff Review/Support pages,
  `client/src/services/reviewService.js`, and `supportService.js`.
- Acceptance: `server/src/acceptance/sl008.acceptance.test.js` and
  `client/src/acceptance/sl008UiContract.test.js`.
- Migration: `server/src/scripts/migrateSl008ReviewSupport.js` plus the Review
  and Support domain migration modules.
- Detailed evidence: `SL-008_G3_TRACEABILITY.md` and
  `SL-008_RELEASE_AUDIT.md`.

## Migration

From `server`, after backing up the intended replica set or mongos:

```powershell
npm run migrate:sl008 -- --dry-run
npm run migrate:sl008
npm run migrate:sl008
```

The coordinator preflights both Review and Support before either domain writes.
It fails closed on duplicate Review identity/ticket code, ambiguous mutable
legacy conversation history, unprovable ownership/delivery facts, malformed
versions or incompatible indexes. The second successful apply must report zero
business-data writes and zero index changes.

Production migration is not part of this local handoff.

## Verification

```text
focused SL-008 server: 129/129, 21 suites
server: 909/909, 151 suites
client: 248/248, 61 suites
client build: PASS
```

The build retains only the pre-existing Vite large-chunk warning. Migration
unit/contract tests include dry-run, preflight-before-write, safe diagnostics,
and zero-write second-run evidence.

## Downstream contracts

- SL-009 may consume SL-008 DomainOutbox events but must not infer new Review
  or Support state, expose message text, or duplicate command-side effects.
- Nguyen Quang Huy owns Notification consumption/read/retry/report behavior.
- Nguyen Ngoc Thanh retains EmailOutbox/Gmail delivery, Audit and final
  integration ownership.
- Support reads Order/OrderDetail, Product/Category and active Staff facts but
  never mutates Order, Payment, Return, Exchange, Shipment or Inventory.

## Review checklist

- [x] BR-083–093 map to production code and tests.
- [x] AT-150–174 have named server/client evidence.
- [x] Guest/Customer/Staff/Admin/Warehouse actor boundaries are checked.
- [x] Review identity/history/visibility invariants are checked.
- [x] Support assignment/message/privacy/reopen invariants are checked.
- [x] Full server/client regressions and production build pass.
- [x] Repeat-safe migration behavior is executable in tests.
- [x] Initial independent diff review completed; all blocking/important
  findings were remediated with executable regression evidence.
- [x] Final independent remediation review found no Critical, Important, or
  Minor findings and returned a ready-to-merge verdict.
- [ ] Nguyen Ngoc Thanh completes final remediation re-review.
- [ ] Nguyen Ngoc Thanh merges with `--no-ff` and pushes `main`.
- [ ] Deployment owner records target backup, dry-run, apply, zero-write second
  run and authenticated browser walkthrough.

## Customer Review UX relocation - 2026-07-25

- Product Detail now exposes public Reviews only.
- Protected `/reviews` presents pending and completed per-product Review work
  from delivered purchases.
- The focused Review client set passed `54/54`; the production client build
  exited `0` with the existing Vite chunk-size warning.
- This relocation has not received a new full-regression run.
