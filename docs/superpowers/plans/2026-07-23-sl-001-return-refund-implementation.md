# SL-001 Return/Refund Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a red-green test cycle and a review checkpoint after each task.

**Goal:** Take `SL-001` from its approved business design through G3 traceability, G4 acceptance tests, G5 implementation, G6 actor acceptance, and G7 release evidence without implementing Exchange or unrelated slices.

**Architecture:** Keep Return/Refund as the owner of the after-sales case, while keeping destination versions, refund obligations, payout evidence, and inventory movements as separate attributable records. The service is the authorization and state-transition boundary; MongoDB transactions group Warehouse receipt, inventory movements, and refund hand-off. Existing COD reconciliation remains an integration seam and is changed only where the SL-001 contract requires it.

**Tech Stack:** Node.js, Express, Mongoose, MongoDB replica set for local transactions, React/Vite, Node test runner.

**Execution status (2026-07-23):** completed and verified locally. See `../reconciliation/SL-001_G3_TRACEABILITY.md` and `../reconciliation/SL-001_HANDOFF.md` for observed evidence and external conditions.

## Global Constraints

- `SL-001` owns whole-order Return/Refund; `SL-002` Exchange remains out of scope.
- Normal Return Refund amount is server-derived from immutable `Order.totalAmount`; Customer and Staff never submit it.
- Customer requests are eligible only for an owned `Delivered` order at or before `DeliveredAt + 5 days`.
- Staff/CSKH decides eligibility; Warehouse receives/classifies goods; Staff reconciles payout; Warehouse never reads destination data.
- No payout before both `Received` and `DestinationVerified`; no completion without verified payout evidence.
- All sensitive destination and payout data is redacted from logs/audit descriptions and protected by role/ownership checks.
- Return evidence is authenticated, owner-bound by a signed claim, limited to 5 files/20 MiB, scanned before storage, and disposed under configured retention rules.
- Existing unrelated changes (`client/package-lock.json`, `docs/presentation/`, `outputs/`) remain untouched.
- Work continues in the current dirty checkout so existing in-progress SL changes are preserved; no reset or broad cleanup is allowed.

---

### Task 1: Freeze G3 scope and traceability

**Files:**
- Create: `docs/superpowers/reconciliation/SL-001_G3_TRACEABILITY.md`
- Reference: `docs/superpowers/specs/2026-07-22-sl-001-return-refund-design.md`
- Reference: `server/src/services/returnRefund.service.js`
- Reference: `server/src/routes/returnRefund.routes.js`
- Reference: `client/src/services/returnRefundService.js`

**Interfaces:**
- Consumes: BD-001 through BD-008, BR-RR-01 through BR-RR-16, AT-001 through AT-018.
- Produces: one row per requirement with exact API, model, service, UI, test, and evidence locations.

- [x] Record the approved scope and explicitly mark Exchange, independent Order/Payment, and independent warehouse modules as handoff dependencies.
- [x] Map every BR-RR requirement to the existing or planned route, controller, service, model, UI, and acceptance test file.
- [x] Mark current behavior as `observed-behavior` where it conflicts with the approved design; do not relabel passing legacy tests as business approval.
- [x] Review the matrix for empty cells and record the exact missing evidence before starting implementation.

### Task 2: Add G4 failing tests for request, deadline, evidence, and actor boundaries

**Files:**
- Modify: `server/src/services/returnRefund.service.test.js`
- Modify: `server/src/models/returnRefundRequest.model.test.js`
- Modify: `server/src/routes/returnRefund.routes.test.js`
- Modify: `client/src/services/returnRefundService.test.js`
- Modify: `client/src/pages/customer/returnRefundUiContract.test.js`

**Interfaces:**
- Consumes: the G3 matrix and existing injected repository/transaction-manager test seams.
- Produces: red tests for AT-001 through AT-010 and server-side role/ownership enforcement.

- [x] Add a test proving an empty evidence list is rejected and a complete request creates exactly one `New` case without an amount.
- [x] Add tests for immutable five-day eligibility and the three-day `ShipByAt` after Staff approval.
- [x] Add tests for duplicate/concurrent submissions, foreign orders, completed/expired cases, and rejection with a Staff reason.
- [x] Add route-source assertions for Customer-owned destination submission, Staff-only destination verification, and Staff-only payout completion.
- [x] Add client contract assertions that Customer/Staff forms neither display nor send `refundAmount` and that repeated submission is disabled/announced.
- [x] Run the focused tests and confirm each new failure is caused by the missing business behavior rather than a test defect.

### Task 3: Implement the Return/Refund persistence contracts

**Files:**
- Create: `server/src/models/refundDestination.model.js`
- Create: `server/src/models/refundPayoutEvidence.model.js`
- Modify: `server/src/models/returnRefundRequest.model.js`
- Modify: `server/src/models/refundPending.model.js`
- Modify: `server/src/models/returnItem.model.js`
- Modify: `server/src/models/inventoryTransaction.model.js`
- Modify: `server/src/models/schemaAlignment.model.test.js`

**Interfaces:**
- Consumes: validated request/decision/inspection/payout inputs.
- Produces: immutable destination versions, append-only payout evidence, explicit request lifecycle fields, and Return inventory transaction types.

- [x] Add request fields for `approvedAt`, immutable `shipByAt`, handoff proof, receipt timestamp, verified destination reference, refund obligation reference, and completion evidence.
- [x] Add destination versions with Customer ownership, confirmation timestamp, verification status, correction lineage, and encrypted-at-rest sensitive values.
- [x] Add payout evidence with one idempotency identity, immutable amount/destination snapshot references, provider/manual reference, outcome, and attributable Staff actor.
- [x] Add `RETURN_IN` and `RETURN_DAMAGED_IN` transaction types without weakening existing inventory invariants.
- [x] Add indexes that prevent duplicate active cases, duplicate destination versions per identity, duplicate payout effects, and duplicate return movements.
- [x] Add model tests for required fields, enums, uniqueness, and sensitive-field exclusion from response serialization.

### Task 4: Implement G5 request, decision, handoff, and destination workflows

**Files:**
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/controller/returnRefund.controller.js`
- Modify: `server/src/routes/returnRefund.routes.js`
- Modify: `server/src/services/returnRefund.service.test.js`
- Modify: `server/src/routes/returnRefund.routes.test.js`

**Interfaces:**
- Consumes: persistence contracts from Task 3 and authenticated role boundaries.
- Produces: `New -> Approved/Rejected`, expiry, Customer handoff proof, destination submission, and Staff verification with idempotent replay.

- [x] Require at least one accepted evidence reference and preserve the fixed `ReturnDeadlineAt`.
- [x] Claim Staff decisions atomically and set `ApprovedAt`/`ShipByAt`; reject Staff-supplied refund amounts.
- [x] Add an idempotent handoff-proof command and an expiry command that never mutates Inventory or creates a Refund.
- [x] Allow destination submission only for the owning Customer after approval; create a new version for corrections and never update an old version in place.
- [x] Allow only Staff to verify/reject a destination; reject Staff attempts to edit the Customer-confirmed values.
- [x] Return masked destination data to Customer/Staff queue, full data only to authorized Staff detail, and no destination data to Warehouse.

### Task 5: Implement atomic Warehouse receipt and refund hand-off

**Files:**
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/services/returnRefund.service.test.js`
- Modify: `server/src/models/inventoryTransaction.model.js`
- Modify: `server/src/models/inventory.model.js`
- Modify: `server/src/models/product.model.js`
- Modify: `server/src/models/schemaAlignment.model.test.js`

**Interfaces:**
- Consumes: an approved request with valid/timely handoff context and complete OrderDetail snapshots.
- Produces: one atomic `Received` outcome, sellable/damaged inventory movements, one `RefundPending` obligation, and retained primary payment facts.

- [x] Require exactly one inspection row for every purchased line and require `ReceivedQuantity = PurchasedQuantity`.
- [x] Enforce non-negative integer quantities and `SellableQuantity + DamagedQuantity = ReceivedQuantity`.
- [x] In one transaction, claim the request, update inventory/product stock, write `RETURN_IN`/`RETURN_DAMAGED_IN`, and create one idempotent `NORMAL_RETURN` obligation.
- [x] Roll back the entire group on stale status, missing line, insufficient data, or injected write failure.
- [x] Ensure replay returns the existing result and creates no duplicate inventory or refund records.

### Task 6: Implement payout evidence and terminal completion

**Files:**
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/controller/returnRefund.controller.js`
- Modify: `server/src/routes/returnRefund.routes.js`
- Modify: `server/src/models/refundPending.model.js`
- Modify: `server/src/models/refundPayoutEvidence.model.js`
- Modify: `server/src/services/returnRefund.service.test.js`
- Modify: `server/src/routes/returnRefund.routes.test.js`

**Interfaces:**
- Consumes: `Received` request, `DestinationVerified` version, and server-derived `Order.totalAmount`.
- Produces: idempotent provider/manual payout evidence and `Refunded -> Completed -> Returned` only after verified success.

- [x] Reject payout attempts unless both receipt and destination verification exist.
- [x] Require exact server-derived amount and immutable destination snapshot; reject mismatches and actor-entered alternate amounts.
- [x] Keep processing, timeout, failed, and unknown outcomes non-terminal; do not automatically create a second payout.
- [x] Permit authorized manual evidence only with processor/reference/time, reconciliation note, and the server-derived stored amount.
- [x] Atomically mark the obligation `Refunded`, request `Completed`, and Order `Returned` once; retain primary Payment/PaymentAttempt as `Paid`.
- [x] Make duplicate payout/completion requests return the existing terminal result without a second effect.

### Task 7: Complete UI and actor acceptance

**Files:**
- Modify: `client/src/pages/customer/OrderDetailPage.jsx`
- Modify: `client/src/pages/customer/ReturnRefundPage.jsx`
- Modify: `client/src/pages/staff/ReturnRefundDetailPage.jsx`
- Modify: `client/src/pages/warehouse/ReturnRefundInspectionPage.jsx`
- Modify: `client/src/services/returnRefundService.js`
- Modify: related client contract tests

**Interfaces:**
- Consumes: finalized API response/state contracts.
- Produces: accessible Customer, Staff, and Warehouse screens that expose only each actor's allowed data and actions.

- [x] Add evidence and destination forms without amount fields; show deadlines and masked status only where allowed.
- [x] Add Staff verification and payout-evidence actions; remove any amount-edit or false-completion control.
- [x] Keep Warehouse screens limited to line quantities/condition evidence and never render destination or payout data.
- [x] Preserve repeated-click feedback and existing-case links.
- [x] Run a three-actor browser happy-path/authorization walkthrough and automated rejection, late-handoff, invalid-destination, partial-inspection, payout-failure/retry cases.

### Task 8: G7 release evidence and handoff package

**Files:**
- Modify: `docs/superpowers/reconciliation/SL-001_G3_TRACEABILITY.md`
- Modify: `docs/superpowers/specs/2026-07-22-sl-001-return-refund-design.md`
- Create: `docs/superpowers/reconciliation/SL-001_HANDOFF.md`

**Interfaces:**
- Consumes: G3 matrix, red/green test evidence, database migration output, and actor walkthrough results.
- Produces: a reviewer-ready handoff for the next member without transferring unresolved business decisions silently.

- [x] Record exact test counts, build result, migration result, and actor walkthrough evidence.
- [x] Mark SL-001 G0–G7 status only from observed evidence; leave cross-slice dependencies explicitly conditional.
- [x] Record changed files, API/state/data contracts, known residual gaps, and safe local setup instructions.
- [x] Verify `git diff --check`, secret exclusion, and unrelated-file preservation before handoff.
