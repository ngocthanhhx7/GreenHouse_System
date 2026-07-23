# SL-005 Pre-Landing Review Blockers

## Review metadata

- Slice: `SL-005 Inventory, Damage, Low-Stock, and Replenishment`
- Implementation commit reviewed: `0ee82cfb64a10c60c79b09e0f5ca564724120ef2`
- Branch after synchronization with `origin/main`: `feature/sl-005-inventory-damage-replenishment`
- Review result: **BLOCKED**
- Review mode: read-only production-code review
- Normative sources:
  - `docs/superpowers/specs/2026-07-22-sl-005-inventory-damage-replenishment-design.md`
  - `docs/superpowers/specs/2026-07-23-cr-001-cross-slice-business-closure-v2.md`
  - `docs/superpowers/reconciliation/SL-005_G3_TRACEABILITY.md`
  - `docs/superpowers/reconciliation/SL-005_HANDOFF.md`

## Verified evidence

- Server regression passed: `494/494` tests across `88` suites.
- Client regression passed: `164/164` tests across `49` suites.
- Client production build passed. The existing Vite chunk-size warning remains.
- The reviewed commit uses the expected author identity:
  - `Lê Vũ Cường <levucuong0319@gmail.com>`
- The worktree was clean at the time of the initial review.
- No `.env`, credential, secret, local database, or unrelated local artifact was found in the reviewed diff.
- Route-level RBAC is present for the newly added Staff, WarehouseManager, and Admin endpoints.

Green tests do not close the slice because several normative paths are bypassed or not covered by tests. The blockers below must be resolved before SL-005 can be treated as G6/G7 complete.

## Blocking findings

### B-01 — Receipt correction is neither atomic nor idempotent

**Severity:** P0
**Confidence:** 10/10

**Motivating code**

- `server/src/services/replenishment.service.js:338-378`
  - Reads the request and inventory.
  - Updates Inventory.
  - Updates ReplenishmentRequest.
  - Inserts InventoryTransaction.
  - These writes are sequential and are not enclosed by `transactionManager.withTransaction`.
- `server/src/services/replenishment.service.js:344-345`
  - Requires an idempotency key but never reads an existing correction result by that key.
- `server/src/models/replenishmentReceipt.model.js:30`
  - Defines `correctionOf`, but the correction service does not create a linked correction record.
- Repository-wide inspection shows `ReplenishmentReceipt` is used by its model test and migration index creation, not by the runtime receipt/correction service.

**Why this blocks**

A database or process failure after the Inventory write but before the request/transaction write leaves the aggregate inconsistent. Retrying the same command can change sellable stock again because the idempotency key is only placed on the final transaction insert. Concurrent corrections can also derive the same `currentNet` and overwrite one another.

**Violated requirements**

- BR-058
- AF-005-18
- AF-005-20
- Invariants 14, 15, 18, and 19
- AT-097
- AT-098
- AT-099

**Required test-first remediation**

Add red tests before changing production code:

1. `replenishment.service.test.js`
   - Inject a transaction manager that records all repository calls.
   - Force `updateRequest` or `createTransaction` to throw.
   - Assert Inventory, request totals/status, receipt history, and transaction ledger all remain unchanged.
2. Submit the same correction idempotency key twice.
   - Assert the second call returns `replay: true`.
   - Assert only one compensating receipt and one InventoryTransaction exist.
   - Assert stock changes once.
3. Submit two concurrent corrections against the same request.
   - Assert a conditional state/version claim allows at most one stale calculation to commit.
4. Require a valid original receipt identifier.
   - Assert the correction record references the original through `correctionOf`.
   - Assert the original evidence is unchanged.
5. Correct a `Completed` request downward.
   - Assert the net quantity and status are recomputed to `Approved` or `PartiallyReceived` exactly as the state table specifies.

**Expected implementation boundary**

- Place receipt, compensation, Inventory, request projection, and transaction writes in one Mongo transaction.
- Persist immutable receipt/correction records rather than only embedded `Mixed` history.
- Claim the correction idempotency identity atomically and replay the existing result.
- Use a conditional version/status guard so stale calculations cannot overwrite newer receipt state.

---

### B-02 — Legacy damage paths bypass required evidence, idempotency, and quarantine

**Severity:** P1
**Confidence:** 10/10

**Motivating code**

- `server/src/services/damageReport.service.js:123-124`
  - Chooses the normative contract only when the caller happens to send `evidence` or `idempotencyKey`.
- `server/src/services/damageReport.service.js:196-198`
  - When both fields are omitted, creates a legacy `PendingWarehouseConfirmation` report without evidence, idempotency, or Sellable-to-Quarantined movement.
- `server/src/controller/damageReport.controller.js:32-34`
  - An empty Warehouse decision body is routed to the legacy confirmation command.
- `server/src/services/damageReport.service.js:377-390`
  - Legacy confirmation requires no bounded `confirmedQuantity`, decision reason, or decision evidence and directly applies a stock movement.
- `server/src/services/damageReport.service.test.js:33-57`
  - Existing tests preserve the legacy report/confirm behavior instead of proving it is rejected.

**Why this blocks**

The public Staff and Warehouse routes still expose an alternative business contract that bypasses BR-049 and BR-050. A caller can create or confirm damage without the evidence and idempotency required by the approved slice.

**Violated requirements**

- BR-049
- BR-050
- BR-051
- AF-005-03
- AF-005-04
- AF-005-07
- AT-078 through AT-082
- AT-099

**Required test-first remediation**

1. Route/service test: Staff submits quantity and reason but omits evidence.
   - Expect `400`.
   - Assert no report, quarantine movement, or transaction was created.
2. Route/service test: Staff omits idempotency key.
   - Expect `400` with a field-specific message.
3. Route/service test: Warehouse sends an empty confirm/decision body.
   - Expect `400`.
   - Assert the report and Inventory remain unchanged.
4. Route/service test: Warehouse omits decision reason or evidence.
   - Expect distinct validation errors.
5. Replay the same Staff report key and Warehouse decision key.
   - Assert the existing outcome is returned and no second movement occurs.
6. Replace legacy behavior tests with migration/compatibility tests that prove old records are migrated safely rather than keeping old write commands reachable.

**Expected implementation boundary**

- Remove runtime branching based on whether the client supplied new-contract fields.
- Make evidence, idempotency, and bounded quantities mandatory at the service boundary.
- Keep legacy compatibility in migration/read normalization only, not in current mutation APIs.

---

### B-03 — Damage quarantine rejects the shortage that must enter reconciliation

**Severity:** P1
**Confidence:** 10/10

**Motivating code**

- `server/src/services/damageReport.service.js:59-69`
  - The atomic update requires `stockQuantity - reservedQuantity >= reportedQuantity`.
- `server/src/services/damageReport.service.js:132-148`
  - Service validation permits a report up to SellableQuantity, but the persistent repository rejects it when it consumes units currently covered by reservations.

**Why this blocks**

BR-053 deliberately requires the system to preserve physical truth even when a damage report makes SellableQuantity lower than ReservedQuantity. The current repository condition rejects exactly that case, leaving known damaged units sellable instead of entering `ReconciliationRequired`.

**Violated requirements**

- BR-049
- BR-053
- AF-005-08
- InventoryHealth state transition `Normal -> ReconciliationRequired`
- AT-078
- AT-085
- AT-086

**Required test-first remediation**

1. Inventory: Sellable `10`, Reserved `8`; report damage quantity `4`.
   - Assert report commits.
   - Assert Sellable `6`, Reserved `8`, Quarantined `4`.
   - Assert `inventoryHealth = ReconciliationRequired`.
   - Assert exposed AvailableQuantity is `0`.
2. Assert affected open Orders are recorded.
3. Assert new reservation and stock export are blocked for that Product.
4. Resolve/recount the deficit with evidence.
   - Assert health returns to `Normal` only when Sellable and reservation obligations are reconciled.

**Expected implementation boundary**

- Guard quarantine against current SellableQuantity, not AvailableQuantity.
- Persist the physical quantities and atomically derive InventoryHealth and affected orders.
- Keep reservation/export guards on the resulting health state.

---

### B-04 — Legacy replenishment paths bypass the approved contract and can diverge quantities

**Severity:** P1
**Confidence:** 10/10

**Motivating code**

- `server/src/services/replenishment.service.js:236-280`
  - A request with no `evidence` and no `idempotencyKey` falls through to a legacy create path.
  - That path does not enforce evidence, idempotency, or the one-active-request guard.
- `server/src/services/replenishment.service.js:438-445`
  - Receipt contract is selected from optional field presence.
- `server/src/services/replenishment.service.js:540-590`
  - `receivedQuantity` alone activates the old one-shot receipt path.
- `server/src/services/replenishment.service.js:84-98`
  - Legacy receipt increments only `stockQuantity`, not `sellableQuantity`, and then writes `Product.stockQuantity`.

**Why this blocks**

The same authenticated Warehouse endpoint accepts two incompatible business contracts. The legacy path can create unverified demand, bypass the active-request invariant, and produce `stockQuantity != sellableQuantity`. Because response calculations prefer `sellableQuantity`, a receipt may be recorded while displayed availability does not increase.

**Violated requirements**

- BR-047
- BR-055 through BR-058
- AF-005-11
- AF-005-15 through AF-005-18
- Invariants 1, 11, 13 through 18
- AT-089 through AT-099

**Required test-first remediation**

1. Create request without evidence.
   - Expect `400`; no request created.
2. Create request without idempotency key.
   - Expect `400`; no request created.
3. Create a second active request for the same Product.
   - Expect typed `409`; no duplicate demand.
4. Submit legacy `{ receivedQuantity }`.
   - Expect contract rejection rather than a one-shot receipt.
5. Submit a valid partial receipt.
   - Assert Sellable and legacy compatibility reads remain consistent.
   - Assert Product stock is not independently mutated.
6. Submit accepted `0`, rejected positive.
   - Assert rejected evidence is recorded, Inventory is unchanged, and request remains `Approved`, not incorrectly `PartiallyReceived`.

**Expected implementation boundary**

- Expose one receipt contract only.
- Reject legacy mutation payloads after migration.
- Update only Inventory dimensions and derived projections.
- Record every receipt as append-only evidence with accepted/rejected arithmetic.

---

### B-05 — LowStockAlert has no lifecycle implementation

**Severity:** P1
**Confidence:** 10/10

**Motivating code**

- `server/src/models/lowStockAlert.model.js:3-22`
  - Defines Open/Resolved state and one-open-per-Product index.
- `server/src/services/inventory.service.js:112`
  - Repository only lists LowStockAlert documents.
- `server/src/services/inventory.service.js:307-325`
  - Threshold override changes Inventory but does not evaluate/persist an alert transition.
- `server/src/services/inventory.service.js:356-366`
  - Runtime API only returns stored alerts or synthesizes read-only items in a fallback repository.
- Repository-wide search found no runtime create, update, resolve, or reopen operation for `LowStockAlert`.

**Why this blocks**

The collection remains empty in normal runtime. Quantity and threshold transitions cannot open, refresh, resolve, or reopen an alert, and notification idempotency is not bound to a persisted crossing lifecycle.

**Violated requirements**

- BR-054
- AF-005-10
- LowStockAlert state table
- Invariants 11 and 12
- AT-087
- AT-088
- AT-099

**Required test-first remediation**

1. AvailableQuantity crosses from above threshold to equal/below threshold.
   - Assert one Open alert and one crossing event.
2. Further changes stay below threshold.
   - Assert the same Open alert is refreshed and no duplicate crossing event is emitted.
3. Quantity rises above threshold.
   - Assert alert becomes Resolved with `resolvedAt`.
4. Quantity later crosses below again.
   - Assert a traceable new/reopened lifecycle and exactly one new crossing event.
5. Run concurrent threshold and quantity transitions.
   - Assert the partial unique index and duplicate-key recovery produce one Open alert.
6. Exercise every relevant source:
   - reservation/release
   - export
   - quarantine
   - damage decision/disposition
   - physical count
   - replenishment receipt/correction
   - global default change
   - Product override create/change/remove

**Expected implementation boundary**

- Add one shared `evaluateLowStock` domain service called inside or immediately after each relevant committed transition.
- Persist crossing identity and recover duplicate-key races as replay.
- Queue notification after commit without replaying the inventory event.

---

### B-06 — Migration strands legacy damage and replenishment records

**Severity:** P1
**Confidence:** 10/10

**Motivating code**

- `server/src/scripts/migrateSl005Inventory.js:24-29`
  - Changes `PendingWarehouseConfirmation` to `PendingReview`.
  - Does not create the required quarantine movement or change Inventory quantities.
- `server/src/services/damageReport.service.js:220-222`
  - New decision rejects when `quarantinedQuantity < reportedQuantity`.
- `server/src/scripts/migrateSl005Inventory.js:32-42`
  - Maps `Receiving -> PartiallyReceived` and `Received -> Completed` but leaves legacy `Pending` unchanged.
  - Adds `requestedQuantity`, causing the service to classify the record as V2.
- `server/src/services/replenishment.service.js:147-155`
  - V2 Admin decision atomically matches only `status: PendingApproval`.
- `server/src/services/replenishment.service.js:388-404`
  - A migrated legacy `Pending` record enters the V2 path but cannot be claimed.
- `server/src/models/replenishmentRequest.model.js:93-99`
  - The active Product unique index excludes legacy `Pending`.
- `server/src/scripts/migrateSl005Inventory.js:75-82`
  - Creates unique indexes without first reconciling duplicate active requests.
- `server/src/scripts/migrateSl005Inventory.test.js`
  - Uses pure normalizers and repository fakes; it does not run twice against Mongo or verify legacy record usability/index conflicts.

**Why this blocks**

After migration, a legacy pending damage report has no corresponding quarantine and cannot be decided. A legacy pending replenishment becomes logically pending but cannot be claimed by the V2 decision query. Existing active duplicates can make index creation fail, while legacy `Pending` records can also bypass the intended active uniqueness index.

**Violated requirements**

- Migration repeat safety in the SL Definition of Done
- BR-049 through BR-050
- BR-055 through BR-056
- AF-005-05
- AF-005-11 through AF-005-13
- AT-079 through AT-081
- AT-089 through AT-093
- AT-099

**Required test-first remediation**

Use a disposable replica-set Mongo database:

1. Seed a legacy `PendingWarehouseConfirmation` damage report and its pre-SL-005 Inventory.
   - Run migration twice.
   - Assert one consistent quarantine movement or an explicit auditable migration disposition.
   - Assert Warehouse can decide the migrated report.
2. Seed legacy replenishment statuses `Pending`, `Receiving`, and `Received`.
   - Run migration twice.
   - Assert each maps to a state accepted by current services.
3. Seed duplicate active replenishments for one Product.
   - Assert migration fails before mutation with an actionable report, or deterministically reconciles them according to an approved rule.
4. Run `createIndexes` twice.
   - Assert both runs succeed.
5. Assert counts, statuses, and transaction identities are identical after the second run.

**Expected implementation boundary**

- Add an explicit preflight/data-conflict report.
- Migrate legacy states to the exact new state vocabulary.
- Do not relabel a damage report without reconciling its physical custody quantities.
- Create unique indexes only after records satisfy their constraints.

---

### B-07 — Replenishment transitions are vulnerable to stale read/write races

**Severity:** P1
**Confidence:** 9/10

**Motivating code**

- `server/src/services/replenishment.service.js:292-303`
  - Withdrawal reads `PendingApproval`, then performs an unrestricted update by ID.
- `server/src/services/replenishment.service.js:304-320`
  - Short-closure request reads an open state, then performs an unrestricted update by ID.
- `server/src/services/replenishment.service.js:321-336`
  - Short-closure decision reads `ShortClosurePending`, then performs an unrestricted update by ID.
- `server/src/services/replenishment.service.js:121-125`
  - `updateRequest` uses `findByIdAndUpdate` without an expected-current-state predicate.

**Why this blocks**

Admin approval can commit after Warehouse reads PendingApproval but before Warehouse writes Withdrawn. A receipt can complete after Warehouse reads Approved but before it writes ShortClosurePending. A stale decision can then overwrite a newer valid terminal state.

**Violated requirements**

- BR-055
- BR-056
- BR-058
- AF-005-05
- AF-005-13
- AF-005-14
- State transition invariant
- AT-091 through AT-093
- AT-098
- AT-099

**Required test-first remediation**

1. Race Warehouse withdrawal against Admin approval.
   - Assert exactly one conditional transition wins.
   - Assert the loser returns the current result without changing stock.
2. Race short-closure request against a receipt.
   - Assert no completed/updated receipt state is overwritten.
3. Race short-closure approval against rejection/retry.
   - Assert one terminal decision and explicit replay/current-state feedback.
4. Assert transition filters include the exact expected current status and, where necessary, record version.

**Expected implementation boundary**

- Replace read-then-unrestricted-update with conditional claim repository methods.
- Place grouped state changes in transactions.
- Return typed stale/conflict responses and existing terminal outcomes.

---

### B-08 — Required actor UI is absent or fabricates business evidence

**Severity:** P1
**Confidence:** 10/10

**Motivating code**

- Repository-wide search:
  - `damageReportService` is referenced only by its service module and service test.
  - No Staff or Warehouse page renders damage report creation, withdrawal, queue, decision, or disposition.
- `client/src/pages/warehouse/InventoryListPage.jsx:34-38`
  - Uses a canned fallback reason and evidence.
  - Generates a new timestamp idempotency key for every click.
- `client/src/pages/warehouse/InventoryListPage.jsx:76-99`
  - Offers count and evidence inputs but no required reason input.
- `client/src/pages/warehouse/ReplenishmentPage.jsx:38-43`
  - Generates a new idempotency identity per submission.
- `client/src/pages/warehouse/ReplenishmentPage.jsx:51-63`
  - Hardcodes Supplier, delivery reference, evidence, and full accepted quantity.
- `client/src/pages/admin/ReplenishmentAdminPage.jsx:29-35`
  - Fabricates the Admin decision reason.
- Client service methods for threshold override, withdrawal, short closure, correction, and short-closure decision have no page consumers.

**Why this blocks**

Operational users cannot execute the approved full/partial/reject, short-closure, correction, or threshold workflows. Where actions exist, the UI invents evidence instead of collecting attributable facts. Timestamp keys also prevent a retry from reusing the original command identity.

**Violated requirements**

- UI Contract sections 16.1 through 16.3
- BR-049 through BR-058
- AT-078 through AT-099

**Required test-first remediation**

1. Add source/interaction contract tests for Staff damage create/withdraw and Warehouse damage decision/disposition pages.
2. Add UI tests proving reason/evidence controls are mandatory and no canned fallback is sent.
3. Generate one idempotency key when the form command starts and retain it through retries; rotate only after success.
4. Add Warehouse receipt UI tests for:
   - supplier reference
   - delivery reference
   - delivered/accepted/rejected arithmetic
   - rejected reason
   - evidence
   - partial receipt
5. Add short-closure and correction forms with explicit current totals and replay feedback.
6. Add Admin decision and short-closure tests requiring actor-entered reasons.
7. Disable repeated submission while pending and display server `replay`/stale result distinctly.

---

### B-09 — Product stock remains a second persisted quantity authority

**Severity:** P1
**Confidence:** 9/10

**Motivating code**

- `server/src/models/product.model.js:37-41`
  - Product still persists `stockQuantity`.
- `server/src/services/inventory.service.js:109`
  - Repository writes `Product.stockQuantity`.
- `server/src/services/inventory.service.js:343`
  - Generic adjustment mirrors Inventory to Product.
- `server/src/services/inventory.service.js:439`
  - Stock export mirrors Inventory to Product.
- `server/src/services/replenishment.service.js:94-98`
  - Replenishment repository writes `Product.stockQuantity`.
- `server/src/services/replenishment.service.js:571-575`
  - Legacy receipt updates the Product mirror.
- Existing return/refund integration also contains Product stock mirror writes and must be reconciled at the cross-slice seam.

**Why this blocks**

Rejecting Product-form stock input is useful but does not establish one database authority while operational services continue writing two persisted quantity records. Partial failures and paths that update only one record can diverge Product and Inventory.

**Violated requirements**

- BR-047
- Invariant 1
- AT-075
- AT-076
- CR-001 shared Inventory lineage boundary

**Required test-first remediation**

1. Execute every in-scope quantity movement and assert no Product update repository method is called.
2. Product/public catalog read test:
   - Assert availability is derived from Inventory projection.
3. Failure injection:
   - Assert no dual-write synchronization is required for stock truth.
4. Cross-slice regression:
   - Return, Exchange, export, cancellation release, and replenishment must all append linked Inventory transactions without Product stock writes.

**Expected implementation boundary**

- Remove operational writes to `Product.stockQuantity`.
- Migrate consumers to Inventory-derived availability.
- If a temporary compatibility projection must remain, make it explicitly non-authoritative, rebuildable, and outside the transaction truth contract; obtain Business Approver approval before retaining it.

---

### B-10 — Traceability and acceptance evidence overclaim closure

**Severity:** P2
**Confidence:** 10/10

**Motivating code**

- `server/src/services/sl005.acceptance.test.js:132`
  - One physical-count test.
- `server/src/services/sl005.acceptance.test.js:154`
  - One damage happy/partial/idempotency test.
- `server/src/services/sl005.acceptance.test.js:186`
  - One replenishment approval/partial-receipt test.
- `docs/member-plans/05_LE_VU_CUONG_PLAN.md:320-330`
  - Claims AT-075 through AT-099 and BR-047 through BR-058 are complete.

**Why this blocks**

The acceptance file contains three broad happy-path tests, while the tracked documentation claims twenty-five acceptance examples and all normative rules are closed. Route authorization, migration/index behavior, alert lifecycle, transition races, legacy-path rejection, correction atomicity, and required UI states are not demonstrated.

**Acceptance criteria without adequate direct evidence**

| Acceptance | Missing direct evidence |
|---|---|
| AT-075 | Real transaction rollback when Inventory creation fails |
| AT-076 | No Product stock authority across all operational writes and deactivation guards |
| AT-077 | Complete model/calculation examples, especially ReconciliationRequired |
| AT-078 | Invalid/excess/missing-evidence report leaves all state unchanged |
| AT-079 | Durable and concurrent duplicate/withdrawal behavior |
| AT-080 | Full, partial, and zero decisions with exact conservation |
| AT-081 | Stale, terminal, foreign actor, over-range, and evidence-free decision denial |
| AT-082 | Disposition replay and protected-dimension isolation |
| AT-083 | Physical count preserves Reserved/Quarantined/Damaged and links evidence |
| AT-084 | Delta endpoint rejection, duplicate race, and rollback on ledger failure |
| AT-085 | Affected orders plus reservation/export block |
| AT-086 | Auditable recovery back to Normal |
| AT-087 | Current global default plus override create/change/remove history |
| AT-088 | Persisted alert lifecycle and concurrent boundary crossings |
| AT-089 | Immutable request data and zero Inventory effect |
| AT-090 | Duplicate key, active Product, invalid input, and RBAC denial |
| AT-091 | Conditional withdrawal race |
| AT-092 | Exact Admin decision, mandatory reason, no Inventory effect |
| AT-093 | Supplier/no-login and wrong-actor denial |
| AT-094 | Atomic partial receipt with linked immutable evidence |
| AT-095 | Multiple receipts complete exact remaining quantity |
| AT-096 | Wrong/damaged/undocumented/excess/rejected-unit branches |
| AT-097 | Concurrent receipt/correction replay and at-most-once stock effect |
| AT-098 | Short closure and linked compensating correction lifecycle |
| AT-099 | Route RBAC, grouped failures, audit attribution, notification failure/retry, and actor walkthrough |

**Required test-first remediation**

- Create one acceptance test group per AT range rather than relying on three aggregate happy paths.
- Use repository fakes for deterministic unit failures and a disposable replica-set Mongo database for transactions, indexes, and concurrency.
- Add route-level tests using authenticated Customer, Staff, WarehouseManager, Admin, and unauthenticated actors.
- Add client source/interaction contract tests for every required actor action.
- Update traceability only after each AT points to a named test and verified implementation.

## Additional completeness findings

### C-01 — Product-ID damage submission is internally inconsistent

- `server/src/services/damageReport.service.js:119-121` permits resolving Inventory by `productId`.
- `server/src/services/damageReport.service.js:135-140` then re-reads and updates using `input.inventoryId`.
- A valid Product-based command therefore resolves the Inventory initially but fails inside the transaction because `input.inventoryId` is absent.

**Test first:** submit a valid `productId`-based damage report and assert the resolved Inventory ID is consistently used throughout the transaction.

### C-02 — Rejected-only delivery receives the wrong state

- `server/src/services/replenishment.service.js:506-510` sets every non-completing receipt to `PartiallyReceived`.
- The state table defines `PartiallyReceived` only when `0 < NetAccepted < Approved`.
- A receipt with accepted `0` and rejected positive should preserve `Approved` while retaining rejected evidence.

**Test first:** delivered `3`, accepted `0`, rejected `3`; assert zero Inventory effect, evidence retained, and request remains `Approved`.

### C-03 — Operational notification recipients do not represent the handoff

- Damage creation notification is addressed to the reporting Staff actor rather than a Warehouse recipient.
- Replenishment creation notification is addressed to the requesting Warehouse actor rather than an Admin decision queue.
- Low-stock notification is addressed to the actor performing the triggering change.

This does not replace SL-009 notification ownership, but SL-005 must emit an idempotent domain event containing the correct business recipient/role and related target.

**Test first:** assert the post-commit domain event identifies the Warehouse/Admin handoff and notification failure leaves the business transaction committed once.

## Required regression matrix before re-review

The following commands must pass after blocker remediation:

```powershell
cd D:\WW\GreenHouse_System\.worktrees\sl-005-inventory-damage-replenishment\server
npm test

cd D:\WW\GreenHouse_System\.worktrees\sl-005-inventory-damage-replenishment\client
npm test
npm run build
```

Additional required evidence:

1. Run `npm run migrate:sl005` twice against a disposable Mongo replica set populated with legacy records.
2. Record the first and second migration summaries and index lists.
3. Run concurrent receipt, correction, damage/withdrawal, threshold crossing, and replenishment-decision tests.
4. Perform an actor walkthrough:
   - Staff: create and withdraw own damage report; cannot inspect another Staff report.
   - WarehouseManager: count, reconcile, decide/dispose damage, threshold override, request/receive/correct/short-close replenishment.
   - Admin: exact request decision and short-closure decision only.
   - Customer/Supplier/unauthenticated: no SL-005 operational access.
5. Re-run SL-001, SL-002, and SL-003 regression suites and verify no duplicate Inventory lineage or Product stock write remains at cross-slice seams.

## Merge gate

SL-005 may be re-reviewed only when:

- B-01 through B-10 are resolved or explicitly re-approved by the Business Approver with updated normative documentation.
- Every affected BR and AT maps to a named test.
- Migration is demonstrated repeat-safe against a real disposable replica-set database.
- All actor boundaries and stale/concurrent transitions are directly tested.
- UI collects attributable input instead of fabricating reason/evidence.
- Full server/client regression and production build pass.
- Handoff and traceability are corrected to reflect verified evidence rather than intended behavior.
