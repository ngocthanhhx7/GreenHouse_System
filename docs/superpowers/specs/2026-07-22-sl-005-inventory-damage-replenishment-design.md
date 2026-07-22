# SL-005 Inventory, Damage, Low-Stock, and Replenishment Design

**Date:** 2026-07-22

**Status:** Fast-track business package approved; implementation not started

**Business approver:** Project Business Approver (user in this Codex task)

**Implementation baseline:** `048e6552245e0d8b03e5bcc3213e4dd205acdc41`

**SRS baseline:** Google Docs revision `AIroW37xl-9inybbV_Kt8cUUhLWLjhfImasxQ_JiEqN2hcPklBhnb6W4yZNbueA2tCWVmMd5XfIbQTkiJLGM6ni-TNQx-hc6-YKXxEmQoPE`; Drive revision `4842`

## 1. Scope and Gate Status

`SL-005` establishes one authoritative Inventory record and controls every in-scope change caused by suspected damage, physical counting, low-stock monitoring, and replenishment. It begins when an active Product is created or an authorized inventory event is submitted. It ends when all affected quantity dimensions, alerts, reports, requests, receipts, and reconciliation obligations are traceable and internally consistent.

This package includes Product-to-Inventory initialization, sellable/reserved/quarantined/damaged quantity semantics, Staff damage reporting, Warehouse inspection and disposition, evidence-backed physical counts, reservation conflicts, low-stock thresholds and alerts, single-product replenishment requests, Admin approval, the external Supplier boundary, partial receipts, rejected delivery units, short closure, compensating receipt corrections, authorization, audit, notifications, and idempotency.

The current release does not provide Supplier login, supplier master-data management, purchase orders, supplier contracts, supplier payment, route planning, or accounts payable. Procurement may group approved requests outside GreenHouse, but each in-system replenishment request remains independently approved and received for exactly one Product.

This slice consumes reservation/export rules from `SL-003` and `SL-004`. Returned goods from `SL-001`, `SL-002`, and `SL-004` must use the same approved quantity dimensions and transaction ledger; those flows may not create a second stock authority.

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Next evidence |
|---|---|---|---|---|---|---|---|---|---|
| SL-005 | passed | passed | passed | ready | not-started | not-started | not-started | not-started | Reconcile the approved package to SRS, interfaces, code, red acceptance tests, and release evidence |

No unresolved business decision remains inside the approved `SL-005` package.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-030 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Revision in the document header; connector snapshot above | Candidate UC-ST-09, UC-WM-01 through UC-WM-05, UC-WM-07, UC-WM-09, FR-IWM/BR-INV rules, and inventory acceptance text | Candidate source only where adopted by this approved package | SRS contributors; Project Business Approver approves policy | Keeps reported damage sellable until confirmation, blocks physical truth when reservation conflicts, requires one exact replenishment receipt, and does not define Supplier boundary, quarantine, persistent alerts, short closure, or one stock authority |
| SRC-031 | Explicit fast-track approval, “duyệt gói SL-005” | 2026-07-22 | BD-051 through BD-062 and this complete package | Normative business authority for SL-005 | Project Business Approver | Approver display name is not recorded |
| SRC-032 | Repository `D:\GreenHouse_System-main` | HEAD `048e6552245e0d8b03e5bcc3213e4dd205acdc41`; inspected 2026-07-22 | Current Product, Inventory, DamageReport, ReplenishmentRequest, InventoryTransaction, settings, routes, services, UI, and tests | `observed-behavior` only | Engineering team | Dual stock fields, no quarantine/rejection UI, delta adjustments, disconnected thresholds, and exact one-shot receipt conflict with this design |
| SRC-033 | Archived SWR Chapter 17 and SWD Chapters 9–11 | Local archive accessed 2026-07-22 | Requirements completeness/consistency/verifiability and explicit state/event/guard/action modeling | Method guidance only | SWR/SWD archive | Does not decide GreenHouse business policy |
| SRC-034 | Approved `SL-001` through `SL-004` designs | Approved 2026-07-22 | Reservation, export, returned-item classification, exact stock movement, actor boundaries, audit, and idempotency rules referenced by this slice | Normative for referenced cross-slice rules | Project Business Approver | Existing designs need this slice to supply one shared Inventory vocabulary and reconciliation state |

## 3. Approved Business Decision Log

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Decision date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-051 | SL-005 | Which entity is authoritative for stock quantity? | Product field; synchronized Product and Inventory fields; one Inventory authority | Inventory is the only quantity authority. Product creation atomically creates exactly one zero-quantity Inventory; Product input cannot set stock. Initial stock enters through approved replenishment or a verified physical count. Deactivation preserves Inventory and history while blocking new sale/reservation | Eliminate silent divergence between Product and Inventory and preserve an auditable origin for every unit | Project Business Approver | 2026-07-22 | BR-047 |
| BD-052 | SL-005 | Which quantity dimensions determine availability? | Current stock/reserved/damaged fields; status-only damage; sellable/reserved/quarantined/damaged dimensions | Maintain SellableQuantity, ReservedQuantity, QuarantinedQuantity, and DamagedQuantity. In normal state, AvailableQuantity is SellableQuantity minus ReservedQuantity; when the difference is negative during reconciliation, exposed availability is zero | Keep logical reservation, suspected physical damage, and confirmed damage distinct | Project Business Approver | 2026-07-22 | BR-048 |
| BD-053 | SL-005 | What happens when Staff reports suspected damage? | No stock effect until Warehouse confirms; direct Staff damage mutation; reversible quarantine | Require Product, observed positive quantity, reason, and at least one evidence item. Atomically create one PendingReview report and move that quantity from Sellable to Quarantined. A repeated idempotency key returns the existing report with clear feedback | Prevent suspected damaged goods from being sold while preserving reversible Warehouse verification | Project Business Approver | 2026-07-22 | BR-049 |
| BD-054 | SL-005 | How may Warehouse decide a damage report? | Confirm full quantity only; edit the Staff report; evidence-backed full/partial/reject decision | Warehouse records inspected quantity, decision reason, and evidence and may confirm all, confirm part, or reject. Confirmed units move Quarantined to Damaged; the remainder returns to Sellable. Original Staff input remains immutable | Represent the physical inspection result without rewriting source evidence | Project Business Approver | 2026-07-22 | BR-050 |
| BD-055 | SL-005 | How are pending mistakes and confirmed damaged units handled? | Edit/delete reports; leave damaged units indefinitely; withdrawal plus separate disposition | Staff may withdraw only an own PendingReview report with reason, releasing its quarantine. Confirmed damaged units are never sellable; Warehouse disposal or return-to-supplier requires a separate evidence-backed transaction and never masquerades as a stock adjustment | Preserve correction and physical custody history without deleting evidence | Project Business Approver | 2026-07-22 | BR-051 |
| BD-056 | SL-005 | How is a physical stock discrepancy recorded? | Arbitrary signed delta and canned reason; direct database correction; evidence-backed counted values | Warehouse records physically counted sellable quantity, verifies segregated quarantine/damaged context, and supplies reason/evidence. System derives the authorized delta and stores attributable before/after values atomically. Quarantined/Damaged movements and known export, return, damage, or replenishment events must use their dedicated flows, not adjustment | Make stock truth inspectable without breaking source-report custody or bypassing controlled business events | Project Business Approver | 2026-07-22 | BR-052 |
| BD-057 | SL-005 | What happens when physical truth is below reserved demand? | Reject the update; keep suspected goods sellable; record truth and reconcile | Record the physical truth and set InventoryHealth to ReconciliationRequired when SellableQuantity is below ReservedQuantity. Expose AvailableQuantity zero, block new reservation/export for the Product, and identify affected open Orders until Warehouse and Staff reconcile the deficit | A database invariant must not hide a real shortage or allow impossible fulfillment | Project Business Approver | 2026-07-22 | BR-053 |
| BD-058 | SL-005 | Who owns low-stock thresholds and alert lifecycle? | Hard-coded threshold; Admin-only per Product; Admin default plus Warehouse override and persistent alert | Admin owns the global default; Warehouse may set a Product override with reason. Effective threshold is override when present, otherwise the current global default. Maintain at most one active LowStockAlert per Product and resolve/reopen it from AvailableQuantity changes | Give operations Product-level control without duplicate warnings or disconnected settings | Project Business Approver | 2026-07-22 | BR-054 |
| BD-059 | SL-005 | What is the replenishment request unit and correction rule? | Multi-Product request; editable request; fixed single-Product request | One request contains exactly one Product, fixed positive requested quantity, reason, and evidence. At most one request is active per Product. Warehouse may withdraw a PendingApproval request with reason but may not edit a submitted request | Keep approval, receipt, and shortage status unambiguous without building a purchase-order module | Project Business Approver | 2026-07-22 | BR-055 |
| BD-060 | SL-005 | What may Admin change during replenishment approval? | Edit quantity then approve; approve without reason; decide the immutable request | Admin approves or rejects the exact requested quantity and records a mandatory reason. Approval snapshots ApprovedQuantity equal to RequestedQuantity and changes no Inventory quantity. An incorrect request is rejected and recreated | Separate business authorization from physical receipt and stop silent quantity changes | Project Business Approver | 2026-07-22 | BR-056 |
| BD-061 | SL-005 | Is Supplier an authenticated GreenHouse actor? | Supplier login and purchasing module; no Supplier evidence; external supporting actor | Supplier is external with no GreenHouse login. Purchasing, supplier payment, and contract work occur outside the current system. Warehouse records supplier/delivery reference and inspection evidence when goods physically arrive | Preserve an evidence handoff without expanding the release into procurement and accounts payable | Project Business Approver | 2026-07-22 | BR-057 |
| BD-062 | SL-005 | How are partial, rejected, short, duplicate, and incorrect receipts handled? | Exact one-shot receipt; overwrite totals; append-only partial receipts and corrections | Allow one or more receipts. Only accepted sellable units increment Inventory; wrong, damaged, or excess units are rejected and do not increment stock. Cumulative accepted units may not exceed ApprovedQuantity and complete the request only when equal. Warehouse may request evidence-backed short closure and Admin decides it. Incorrect receipt evidence is corrected by an authorized compensating transaction, never edit/delete. Commands are atomic, idempotent, audited, and return existing outcomes for retries | Keep physical delivery, approved demand, and stock truthful under ordinary Supplier variance and repeated actions | Project Business Approver | 2026-07-22 | BR-058 |

## 4. Actor Responsibility Matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Customer | Receive only fulfillable Products while remaining outside internal warehouse operations | No SL-005 command | View internal quantities, damage evidence, supplier data, adjustments, alerts, or replenishment records; mutate any stock fact | None | Public availability derived from authorized sales interfaces only; no SL-005 operational record access | None | Unauthorized access is denied without revealing operational data |
| Staff / CSKH | Remove suspected damaged goods from sale and hand a verifiable report to Warehouse | Create a damage report; withdraw an own PendingReview report with reason; view the report outcome needed for support work | Confirm/reject damage; choose confirmed quantity; change Inventory directly; count stock; change thresholds; request/approve/receive replenishment; dispose damaged units | Create `PendingReview`; own `PendingReview -> Withdrawn` | Read the Product/Inventory identity and quantity context needed to report; write own immutable report, reason, and evidence; view its decision result | Suspected units and evidence to Warehouse; receives decision feedback | Invalid/excess quantity or missing evidence is rejected; duplicate key returns existing report; withdrawal loses a race to Warehouse decision without changing terminal state |
| Warehouse Manager | Keep physical Inventory truthful and restore supply | Inspect damage; confirm all/part or reject; dispose/return confirmed damage; submit counted values; resolve physical discrepancies; set Product threshold override; create/withdraw replenishment; receive deliveries; request short closure; submit compensating receipt correction | Approve own replenishment or short closure; edit source evidence; change ReservedQuantity manually; use adjustment to imitate a known business event; access Customer payment/refund destination | Damage decision terminals; InventoryHealth operational reconciliation; alert override; `PendingApproval -> Withdrawn`; receipt-driven Approved/PartiallyReceived/Completed changes; short-closure request | Operational Product, Inventory dimensions, affected Order references, damage evidence, thresholds, requests, supplier references, receipts, and transactions; no Customer financial destination | Damage result to Staff; request/short-closure decision to Admin; delivery evidence from Supplier; impacted Orders to Staff | Missing evidence or stale state changes nothing; reservation conflict enters reconciliation; rejected/excess delivery changes no stock; duplicate command returns existing outcome |
| Admin | Govern Product metadata, global policy, and replenishment authorization without fabricating physical stock | Create/deactivate Product metadata; change global low-stock default; approve/reject exact replenishment; approve/reject short closure; inspect audit | Enter Product stock; adjust/receive/dispose physical quantity; rewrite Warehouse counts, request quantity, receipt, or evidence; approve a different quantity | `PendingApproval -> Approved/Rejected`; short-closure decision | Product metadata and settings; read Inventory/request/receipt/audit evidence; write decisions and mandatory reasons only | Approved demand to off-system procurement/Warehouse; short-closure result to Warehouse | Missing reason, stale/terminal request, or altered quantity is rejected with no stock effect |
| Supplier | Deliver goods under an external commercial arrangement | External delivery facts only; no direct system command | Log in, approve requests, change Inventory, decide accepted quantity, or view internal operational data | None inside GreenHouse | No direct system access; identity/reference is recorded by Warehouse as evidence | Physical goods and delivery reference to Warehouse | Wrong, damaged, excess, or undocumented units are not accepted into sellable stock |
| Notification / Email Service | Deliver post-commit operational feedback | Process queued alert, decision, and reconciliation notifications | Decide or roll back Inventory, damage, alert, or replenishment state | None | Minimum recipient and template payload | Delivery result to retry/audit | Failure is recorded and retried without repeating the business event |
| GreenHouse System | Enforce one stock authority, valid transitions, atomic quantity movement, least privilege, and traceability | Validate commands; calculate availability/effective threshold/deltas/net receipts; create alerts, transactions, audits, and post-commit notifications | Invent Staff/Warehouse/Admin approval, Supplier acceptance, evidence, or physical count | Mechanical transitions after authorized actor action and guards | Coordinates role-specific views and all in-scope records | Orchestrates every actor handoff | Rolls back grouped writes; enters reconciliation rather than hiding physical shortage; duplicate idempotency key returns the existing result |

## 5. Business Slice Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-005 | Staff, Warehouse, Admin, external Supplier, and System maintain one evidence-backed Inventory truth and replenish it without duplicate or unapproved quantity | Product creation, damage observation, physical count, threshold crossing, replenishment demand, delivery, shortfall, or correction | Existing authorized Product/Inventory context; positive bounded quantities; current eligible state; required reason/evidence; idempotency key | Execute UC-INV-01, UC-DMG-01, UC-STK-01, UC-LOW-01, UC-REP-01, and UC-REC-01 | Apply AF-005 branches without hiding shortages, duplicating effects, or rewriting evidence | Availability is derived; quarantine is reversible; approved quantity is fixed; net accepted receipts determine completion; threshold uses override or global default | One Inventory authority; nonnegative physical dimensions; terminal evidence is append-only; active request/alert uniqueness; stock effect at most once | Actor matrix above | AT-075 through AT-099 | `approved-requirement` |

## 6. Normative Requirements

| Requirement ID | Approved requirement | Source |
|---|---|---|
| BR-047 | Inventory shall be the only authoritative Product quantity record. Creating an active Product shall atomically create exactly one Inventory with SellableQuantity, ReservedQuantity, QuarantinedQuantity, and DamagedQuantity equal to zero. Product create/update input shall not set stock. Initial or later stock shall enter only through an authorized inventory transaction. Product deactivation shall block new sale/reservation while preserving Inventory and history. | BD-051 |
| BR-048 | Inventory shall maintain nonnegative integer SellableQuantity, ReservedQuantity, QuarantinedQuantity, and DamagedQuantity. `OnHandQuantity = SellableQuantity + QuarantinedQuantity + DamagedQuantity`; ReservedQuantity is a logical subset of SellableQuantity and is not added to OnHandQuantity. In Normal health, ReservedQuantity shall not exceed SellableQuantity and AvailableQuantity equals SellableQuantity minus ReservedQuantity. During ReconciliationRequired, exposed AvailableQuantity shall be zero. | BD-052 |
| BR-049 | Staff shall create a PendingReview DamageReport only with an existing Inventory/Product, positive integer ReportedQuantity not greater than current SellableQuantity, a reason, at least one evidence item, and an idempotency key. One atomic commit shall create the immutable report and move ReportedQuantity from SellableQuantity to QuarantinedQuantity. A duplicate key shall return the existing report and shall not quarantine again. | BD-053 |
| BR-050 | Warehouse shall resolve a PendingReview DamageReport with ConfirmedQuantity from zero through ReportedQuantity, mandatory decision reason, and evidence. Zero produces Rejected; a positive value below ReportedQuantity produces PartiallyConfirmed; equality produces Confirmed. One atomic commit shall remove the full ReportedQuantity from QuarantinedQuantity, add ConfirmedQuantity to DamagedQuantity, return the remainder to SellableQuantity, retain original Staff evidence, recalculate health/alerts, and prevent a second decision. | BD-054 |
| BR-051 | Staff may withdraw only an own PendingReview DamageReport with mandatory reason; the atomic withdrawal shall return the full quarantined quantity to SellableQuantity and retain history. Confirmed damaged units shall never become sellable without a separately authorized transaction. Warehouse disposal or return-to-supplier shall decrement only DamagedQuantity and record type, quantity, reason, evidence, actor, time, and before/after values. | BD-055 |
| BR-052 | Warehouse physical adjustment shall accept counted SellableQuantity rather than an arbitrary signed delta, require reason and evidence, derive the exact sellable delta on the server, and atomically append attributable before/after InventoryTransactions. ReservedQuantity is system-owned and not directly editable. QuarantinedQuantity remains tied to unresolved DamageReports, while DamagedQuantity changes through damage decision, disposition, returned-item classification, or an explicitly linked compensating flow. Generic adjustment shall not process those dimensions or known replenishment, export, return, or damage events; a correction shall be a new compensating transaction rather than edit/delete. | BD-056 |
| BR-053 | When an authorized damage, count, return, or correction proves SellableQuantity below ReservedQuantity, System shall preserve the physical values, set InventoryHealth to ReconciliationRequired, expose AvailableQuantity zero, block new reservation and stock export for that Product, identify affected open Orders, and notify Warehouse/Staff after commit. Normal shall resume only after the physical quantity and open reservation obligations are reconciled with attributable evidence. | BD-057 |
| BR-054 | Admin shall manage the global default low-stock threshold; Warehouse may create/change/remove a Product override with reason. EffectiveThreshold equals the Product override when present and otherwise the current global default. System shall evaluate `AvailableQuantity <= EffectiveThreshold` after every relevant quantity or threshold transition, maintain at most one active LowStockAlert per Product, resolve it above threshold, and reopen it on a later crossing without duplicate event effects. | BD-058 |
| BR-055 | A ReplenishmentRequest shall contain exactly one Product, positive immutable RequestedQuantity, Warehouse reason, evidence, creator, and idempotency key. At most one request in PendingApproval, Approved, PartiallyReceived, or pending short-closure state may exist for a Product. Warehouse may withdraw only PendingApproval with reason. Submitted fields and terminal history shall not be edited or deleted. | BD-059 |
| BR-056 | Admin shall approve or reject only a current PendingApproval ReplenishmentRequest and shall provide a mandatory decision reason. Approval shall snapshot ApprovedQuantity equal to RequestedQuantity and shall not mutate Inventory. Admin shall not edit quantity or receipt evidence; an incorrect request shall be rejected and recreated. | BD-060 |
| BR-057 | Supplier is an external supporting actor with no GreenHouse account or command. Supplier selection, purchasing, contract, and payment occur outside the current release. Every physical replenishment delivery recorded by Warehouse shall reference the approved request, supplier/delivery reference, inspection actor/time, delivered quantity, accepted sellable quantity, rejected quantity and reason, and evidence. | BD-061 |
| BR-058 | An Approved or PartiallyReceived request may receive one or more append-only delivery receipts. DeliveredQuantity shall equal AcceptedSellableQuantity plus RejectedQuantity; cumulative net accepted quantity shall not exceed ApprovedQuantity. Only accepted sellable units shall atomically increment SellableQuantity and create a linked transaction. Wrong, damaged, undocumented, or excess units shall not increment Inventory. Net accepted equality completes the request; lower positive net remains PartiallyReceived. Warehouse may submit evidence-backed short closure for Admin decision. Receipt mistakes shall use authorized idempotent compensating transactions and recompute net status without editing/deleting original evidence. | BD-062 |

## 7. UC-INV-01 — Establish the Inventory Authority

### Preconditions

1. Admin is authorized to create or update Product metadata.
2. Product metadata is valid and no conflicting Product/Inventory identity exists.
3. The request contains no stock quantity input.

### Main Flow

1. Admin submits Product metadata.
2. System validates metadata and rejects any attempt to initialize stock through Product input.
3. In one transaction, System creates the Product and exactly one Inventory with all physical dimensions and ReservedQuantity equal to zero.
4. All inventory-aware reads derive quantity and availability from Inventory, not Product.
5. Initial physical units enter through approved replenishment or UC-STK-01 with evidence.
6. Product deactivation retains Inventory and transactions but blocks new sale/reservation.

## 8. UC-DMG-01 — Report and Resolve Suspected Damage

### Staff Report and Withdrawal

1. Staff selects the Inventory/Product, enters observed positive quantity and reason, attaches at least one evidence item, and submits an idempotency key.
2. System locks and revalidates the Inventory and Staff authorization.
3. In one transaction, System creates an immutable PendingReview DamageReport and moves the reported quantity from Sellable to Quarantined.
4. System recalculates InventoryHealth and LowStockAlert, commits, and queues Warehouse notification.
5. Before a Warehouse decision wins, the reporting Staff may withdraw the own PendingReview report with reason; System atomically releases its quarantine and records Withdrawn.

### Warehouse Decision

1. Warehouse opens the immutable report and physically inspects the quarantined units.
2. Warehouse enters ConfirmedQuantity between zero and ReportedQuantity, a decision reason, and evidence.
3. System atomically claims the still-PendingReview report.
4. System removes the full ReportedQuantity from Quarantined, adds ConfirmedQuantity to Damaged, and returns the remainder to Sellable.
5. System records Rejected, PartiallyConfirmed, or Confirmed, recalculates InventoryHealth and alert state, commits, and notifies Staff.
6. Confirmed damaged units may later leave physical custody only through a separate Warehouse disposal or return-to-supplier transaction.

## 9. UC-STK-01 — Record Physical Count and Reconcile a Shortage

### Main Flow

1. Warehouse physically counts sellable units, verifies the separately displayed quarantined/damaged custody context, and enters CountedSellableQuantity with reason and evidence.
2. System validates the nonnegative integer count, authorization, current state, and that the adjustment is not replacing a known business event or attempting to rewrite quarantined/damaged evidence.
3. System derives the sellable delta and appends one atomic before/after transaction group without changing ReservedQuantity, QuarantinedQuantity, or DamagedQuantity directly.
4. If counted Sellable is at least Reserved, System keeps or returns InventoryHealth to Normal when no affected obligation remains.
5. If counted Sellable is below Reserved, System preserves the physical result, changes health to ReconciliationRequired, exposes Available zero, blocks new reservation/export for the Product, and identifies affected open Orders.
6. Warehouse recounts/restocks/corrects physical evidence; Staff coordinates affected Orders under their approved cancellation or incident rules; Admin may decide a resulting replenishment request.
7. System returns health to Normal only after physical and reservation obligations are reconciled and audited.

## 10. UC-LOW-01 — Maintain Low-Stock Threshold and Alert

1. Admin sets the global default, or Warehouse sets/removes a Product override with reason.
2. System calculates EffectiveThreshold from override or current global default.
3. After every quantity or threshold transition, System evaluates AvailableQuantity against EffectiveThreshold.
4. At or below threshold, System creates or refreshes exactly one active LowStockAlert and queues one idempotent Warehouse notification for the crossing event.
5. Above threshold, System resolves the active alert.
6. A later crossing reopens or creates the next traceable alert lifecycle without concurrent duplicates.

## 11. UC-REP-01 — Request and Approve Replenishment

### Warehouse Request

1. Warehouse selects exactly one Product and enters positive RequestedQuantity, reason, evidence, and idempotency key.
2. System rejects another active request for the Product or returns the existing request for a duplicate key.
3. System creates immutable PendingApproval and queues Admin notification.
4. Before a decision, Warehouse may withdraw it with reason; no Inventory changes.

### Admin Decision

1. Admin reviews Product, current Inventory/alert context, immutable RequestedQuantity, reason, and evidence.
2. Admin selects approve or reject and enters a mandatory decision reason.
3. Approval snapshots ApprovedQuantity equal to RequestedQuantity; rejection records no approved quantity.
4. Neither decision changes Inventory.
5. An approved request may be used by external procurement, which remains outside GreenHouse.

## 12. UC-REC-01 — Receive, Close, or Correct Replenishment

### Partial or Complete Receipt

1. Warehouse selects an Approved or PartiallyReceived request and records supplier/delivery reference, DeliveredQuantity, AcceptedSellableQuantity, RejectedQuantity/reason, inspection evidence, and idempotency key.
2. System validates that delivered equals accepted plus rejected and that cumulative net accepted does not exceed ApprovedQuantity.
3. In one transaction, System appends the receipt, increments SellableQuantity only by accepted units, appends the linked InventoryTransaction, recalculates alert/health, and derives request status.
4. Net accepted below ApprovedQuantity becomes or remains PartiallyReceived; equality becomes Completed.
5. Rejected wrong, damaged, undocumented, or excess units remain outside shop Inventory.

### Short Closure

1. When Supplier cannot deliver the remaining approved units, Warehouse submits a short-closure request with reason and evidence.
2. Receipt is blocked while the short-closure decision is pending.
3. Admin approves or rejects with reason.
4. Approval records ClosedShort and preserves all accepted stock; rejection restores receipt eligibility without changing Inventory.

### Receipt Correction

1. Warehouse identifies an incorrect receipt and submits a linked compensating correction with reason, evidence, and idempotency key.
2. System preserves the original receipt, validates that the correction cannot make net accepted negative, and appends the compensating InventoryTransaction atomically.
3. System recomputes cumulative net accepted and request status. A previously Completed request may return to Approved or PartiallyReceived only through this traceable correction path.

## 13. Alternative and Failure Paths

| Branch | Condition | Required outcome |
|---|---|---|
| AF-005-01 | Product create/update includes stock quantity | Reject the quantity input; create no hidden Product stock authority |
| AF-005-02 | Product creation succeeds but Inventory creation fails | Roll back Product creation; leave no Product without exactly one Inventory |
| AF-005-03 | Damage quantity is nonpositive, exceeds current Sellable, or lacks reason/evidence | Reject report and change no quantity |
| AF-005-04 | Same damage idempotency key is submitted repeatedly | Return the existing report and quarantine exactly once |
| AF-005-05 | Staff withdrawal and Warehouse decision race | Exactly one eligible transition wins; the loser receives the current result and no second quantity movement occurs |
| AF-005-06 | Warehouse confirms only part or zero | Move only confirmed units to Damaged and release all remaining quarantine atomically |
| AF-005-07 | Damage decision/disposition is stale, unauthorized, over-quantity, or missing evidence | Reject and change no report or Inventory state |
| AF-005-08 | Quarantine, confirmation, or count leaves Sellable below Reserved | Preserve physical values, enter ReconciliationRequired, expose zero availability, and block new reservation/export |
| AF-005-09 | Arbitrary delta/canned adjustment or a known business event is submitted through physical count | Reject and require the dedicated business flow |
| AF-005-10 | Quantity/threshold changes concurrently cross the low-stock boundary | Maintain at most one active alert and one notification effect for the crossing |
| AF-005-11 | Replenishment quantity/evidence is invalid or another active request exists | Reject with no new request; an identical key returns the existing request |
| AF-005-12 | Warehouse attempts to approve or Admin attempts to edit quantity | Deny the action and preserve PendingApproval/request evidence |
| AF-005-13 | Admin decision lacks reason or targets a stale/terminal request | Reject and change no request or Inventory state |
| AF-005-14 | Receipt is attempted before approval or while short closure is pending | Reject and change no Inventory or receipt total |
| AF-005-15 | Delivered quantity does not equal accepted plus rejected | Reject the receipt and change no Inventory |
| AF-005-16 | Accepted units would exceed remaining ApprovedQuantity | Reject the excess from Inventory; require another approved request for additional accepted stock |
| AF-005-17 | Supplier delivers wrong, damaged, or undocumented units | Record them as rejected evidence and add zero for those units to shop Inventory |
| AF-005-18 | Concurrent or repeated receipt/correction key | Apply the stock effect once and return the existing receipt/correction outcome |
| AF-005-19 | Short closure is approved after partial receipt | Preserve accepted stock and receipts, close only the undelivered balance, and allow no further receipt |
| AF-005-20 | Any grouped quantity or transaction write fails | Roll back the whole business command; do not retain partial dimensions/status/transaction |
| AF-005-21 | Notification delivery fails | Keep committed business state and retry notification without replaying the business event |

## 14. State Models

### 14.1 InventoryHealth State Table

| Current state | Event and guard | Actor/evidence | Action | Next state |
|---|---|---|---|---|
| Normal | Authorized quantity transition leaves Sellable at least Reserved | System calculation from committed transaction | Recalculate availability and alert | Normal |
| Normal | Authorized physical evidence leaves Sellable below Reserved | Staff/Warehouse source evidence plus System calculation | Preserve physical values; expose Available zero; block new reservation/export; identify affected Orders | ReconciliationRequired |
| ReconciliationRequired | Additional transition still leaves unresolved deficit/obligations | Attributable transaction/evidence | Refresh affected Order set and keep block | ReconciliationRequired |
| ReconciliationRequired | Recount/restock/correction restores physical and reservation obligations | Warehouse evidence and System validation | Record resolution; recalculate availability/alert; remove block | Normal |

### 14.2 DamageReport State Table

| Current state | Event and guard | Actor | Quantity action | Next state |
|---|---|---|---|---|
| None | Valid report and idempotency key | Staff | Sellable `-Reported`; Quarantined `+Reported` | PendingReview |
| PendingReview | Own withdrawal with reason wins before decision | Reporting Staff | Quarantined `-Reported`; Sellable `+Reported` | Withdrawn |
| PendingReview | ConfirmedQuantity = 0 with reason/evidence | Warehouse | Quarantined `-Reported`; Sellable `+Reported` | Rejected |
| PendingReview | `0 < ConfirmedQuantity < ReportedQuantity` | Warehouse | Quarantined `-Reported`; Damaged `+Confirmed`; Sellable `+(Reported-Confirmed)` | PartiallyConfirmed |
| PendingReview | ConfirmedQuantity = ReportedQuantity | Warehouse | Quarantined `-Reported`; Damaged `+Reported` | Confirmed |
| Any terminal state | Repeated/stale decision | Any actor | No effect; return current result or deny | Same terminal state |

### 14.3 LowStockAlert State Table

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None/Resolved | AvailableQuantity is at or below EffectiveThreshold | Open one active alert and queue one crossing notification | Open |
| Open | Quantity/threshold remains at or below threshold | Refresh evaluation metadata; create no duplicate active alert | Open |
| Open | AvailableQuantity becomes greater than EffectiveThreshold | Record resolution | Resolved |
| Resolved | A later evaluation crosses to at/below threshold | Reopen/create the next traceable lifecycle and notify once | Open |

### 14.4 ReplenishmentRequest State Table

| Current state | Event and guard | Actor | Inventory effect | Next state |
|---|---|---|---|---|
| None | Valid one-Product request; no active request | Warehouse | None | PendingApproval |
| PendingApproval | Withdraw with reason | Creating Warehouse actor | None | Withdrawn |
| PendingApproval | Reject exact request with reason | Admin | None | Rejected |
| PendingApproval | Approve exact request with reason | Admin | None; snapshot ApprovedQuantity | Approved |
| Approved | First valid receipt; `0 < NetAccepted < Approved` | Warehouse | Add accepted once | PartiallyReceived |
| Approved | Valid receipt makes `NetAccepted = Approved` | Warehouse | Add accepted once | Completed |
| PartiallyReceived | Valid receipt leaves `NetAccepted < Approved` | Warehouse | Add accepted once | PartiallyReceived |
| PartiallyReceived | Valid receipt makes `NetAccepted = Approved` | Warehouse | Add accepted once | Completed |
| Approved/PartiallyReceived | Warehouse submits valid short-closure evidence | Warehouse | None; block receipt while decision is pending | Same base state plus ShortClosurePending |
| Same base state plus ShortClosurePending | Admin rejects with reason | Admin | None; restore receipt eligibility | Approved/PartiallyReceived |
| Same base state plus ShortClosurePending | Admin approves with reason | Admin | None; retain accepted stock | ClosedShort |
| Completed | Authorized compensating correction makes net accepted lower | Warehouse | Append reversal; never edit original | Approved/PartiallyReceived |
| Any terminal state | Ordinary repeat/stale command | Any actor | No effect | Same state |

### 14.5 ReplenishmentReceipt Evidence State

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None | Valid receipt key and current request | Append immutable receipt and accepted-stock transaction | Recorded |
| Recorded | Authorized correction with linked evidence | Append compensating record/transaction; preserve original | Corrected |
| Recorded/Corrected | Edit or delete attempt | Deny; retain history | Same state |

## 15. State and Data Invariants

1. Exactly one Inventory is authoritative for each Product; Product contains no independently writable stock quantity.
2. SellableQuantity, ReservedQuantity, QuarantinedQuantity, and DamagedQuantity are nonnegative integers.
3. ReservedQuantity is a logical subset of SellableQuantity; `OnHandQuantity = SellableQuantity + QuarantinedQuantity + DamagedQuantity`.
4. In Normal health, `ReservedQuantity <= SellableQuantity` and `AvailableQuantity = SellableQuantity - ReservedQuantity`.
5. In ReconciliationRequired, exposed AvailableQuantity is zero even if a raw subtraction would be negative.
6. QuarantinedQuantity equals the sum of ReportedQuantity held by unresolved PendingReview DamageReports; generic adjustment cannot change it.
7. One damage report quarantine movement occurs at most once; one terminal decision or withdrawal releases the complete quarantine exactly once.
8. Damage confirmation conserves physical OnHand; damaged disposition decreases only Damaged and physical OnHand.
9. ReservedQuantity changes only through approved reservation/export/cancellation/reconciliation rules, never a Warehouse form field.
10. A physical count records observed sellable truth and a new transaction; it never rewrites evidence or directly changes Reserved, Quarantined, or Damaged dimensions.
11. One Product has at most one active LowStockAlert and at most one active ReplenishmentRequest.
12. EffectiveThreshold uses a Product override when present and the current global default otherwise.
13. RequestedQuantity and ApprovedQuantity are immutable after approval and equal for one request.
14. `NetAcceptedQuantity = sum(accepted receipt quantities) - sum(accepted compensating reversals)`.
15. NetAcceptedQuantity is never negative or greater than ApprovedQuantity.
16. Only net accepted sellable replenishment increments SellableQuantity; rejected delivered units have zero stock effect.
17. Completed requires NetAcceptedQuantity equal to ApprovedQuantity; ClosedShort may retain a lower net accepted value with Admin-approved evidence.
18. Every quantity movement has type, affected dimensions, before/after values, related business record, actor, event time, reason, evidence, and idempotency identity.
19. Notification failure never rolls back a committed report, quantity movement, alert, request, decision, receipt, correction, or reconciliation result.

## 16. UI Contract

### Staff / CSKH

- Damage form shows Product, current reporting context, observed quantity, mandatory reason, and mandatory evidence.
- It explains that submission immediately quarantines the reported units; it is not a direct arbitrary stock adjustment.
- Submit is disabled while pending. A repeated click shows the existing report and an explicit already-recorded message.
- Staff may withdraw only an own PendingReview report with reason and sees the immutable Warehouse outcome.

### Warehouse

- Inventory view shows Sellable, Reserved, Quarantined, Damaged, Available, EffectiveThreshold, alert state, and InventoryHealth separately.
- Physical count form accepts CountedSellableQuantity, reason, and evidence and separately shows quarantine/damaged custody; there are no `+1/-1` buttons, canned adjustment reason, or generic controls for protected dimensions.
- Reconciliation view identifies affected open Orders and the operations currently blocked.
- Damage queue preserves original Staff data and requires bounded ConfirmedQuantity, decision reason, and evidence for full/partial/reject.
- Threshold control distinguishes global default from Product override and requires a reason for override change/removal.
- Replenishment form contains one Product, fixed requested quantity, reason, and evidence and shows any active request.
- Receipt form shows approved, previously accepted, and remaining quantities and requires supplier/delivery reference, delivered, accepted, rejected reason, and evidence.
- Partial receipt, short closure, correction, and duplicate-action results are explicit; no UI implies that approval alone added stock.

### Admin

- Product form contains metadata only and no stock field.
- Global threshold setting explains its effect on Products without an override.
- Replenishment decision shows immutable requested quantity/evidence and requires approve/reject reason; there is no editable approved quantity.
- Short-closure decision shows accepted, remaining, receipts, and Warehouse evidence and changes no already accepted stock.
- Admin can inspect audit evidence but has no physical quantity mutation control.

### Customer and Shared Feedback

- Customer has no SL-005 operational screen or API data.
- Every pending command disables repeated submission and returns current-state feedback for duplicate/stale attempts.
- Authorization, validation, reconciliation, and notification errors name the safe next action without exposing another role's protected data.

## 17. Acceptance Examples

| AT ID | Given / When / Then evidence | Classification |
|---|---|---|
| AT-075 | Given valid Product metadata without stock input, when Admin creates it, then Product and exactly one zero-dimension Inventory commit atomically; an Inventory failure leaves neither partial record. | `approved-requirement` |
| AT-076 | Given Product create/update/deactivation and inventory reads, when stock input or a second authority is attempted, then stock input is rejected, all quantities come from Inventory, and deactivation preserves history while blocking new sale/reservation. | `approved-requirement` |
| AT-077 | Given Normal and shortage Inventory examples, when quantities are calculated, then OnHand and Available follow BR-048, nonnegative physical dimensions hold, and ReconciliationRequired exposes zero availability rather than a false sellable amount. | `approved-requirement` |
| AT-078 | Given valid Staff reason/evidence and observed quantity, when a damage report is submitted, then one PendingReview report and exact Sellable-to-Quarantined movement commit together; invalid/excess/missing evidence changes nothing. | `approved-requirement` |
| AT-079 | Given a repeated report key or an own eligible withdrawal, when processed, then quarantine occurs once or is fully released once with immutable history and explicit existing-result feedback. | `approved-requirement` |
| AT-080 | Given a PendingReview report, when Warehouse confirms all, confirms part, or confirms zero with reason/evidence, then the exact Quarantined/Damaged/Sellable movement and Confirmed/PartiallyConfirmed/Rejected terminal state commit once. | `approved-requirement` |
| AT-081 | Given stale, terminal, unauthorized, over-range, or evidence-free damage decision, when submitted, then no report or quantity changes and protected evidence remains inaccessible. | `approved-requirement` |
| AT-082 | Given confirmed damaged units, when Warehouse records valid disposal or return-to-supplier, then only Damaged decreases once with complete evidence; ordinary adjustment or repeated command cannot sell or remove them again. | `approved-requirement` |
| AT-083 | Given a verified physical count, when Warehouse submits CountedSellableQuantity with reason/evidence, then the server-derived sellable delta and before/after values commit atomically while Reserved, Quarantined, and Damaged remain under their dedicated flows. | `approved-requirement` |
| AT-084 | Given arbitrary delta/canned reason, a known export/return/damage/replenishment event, a duplicate key, or a grouped write failure, when adjustment is attempted, then bypass is rejected or the existing result returned and no partial/double transaction remains. | `approved-requirement` |
| AT-085 | Given quarantine or physical count makes Sellable lower than Reserved, when committed, then physical values remain, health becomes ReconciliationRequired, Available is zero, affected Orders are identified, and new reservation/export is blocked. | `approved-requirement` |
| AT-086 | Given ReconciliationRequired, when evidenced recount/restock/correction and reservation handling remove the deficit, then health returns to Normal once, availability/alert recalculate, and the entire resolution is auditable. | `approved-requirement` |
| AT-087 | Given global threshold changes and a Product override create/change/remove, when evaluated, then Products without override use the current global value, the override wins where present, and Warehouse reason/history is retained. | `approved-requirement` |
| AT-088 | Given concurrent quantity/threshold transitions cross below, stay below, recover, and later cross again, then at most one active alert exists, resolution/reopen history is correct, and each crossing notification effect occurs once. | `approved-requirement` |
| AT-089 | Given one Product, positive quantity, reason, evidence, and no active request, when Warehouse submits, then one immutable PendingApproval request is created with fixed RequestedQuantity and no Inventory effect. | `approved-requirement` |
| AT-090 | Given a duplicate request key, another active request for the Product, invalid input, or unauthorized actor, when submitted, then the existing request is returned or the new request is rejected with no duplicate demand. | `approved-requirement` |
| AT-091 | Given an own PendingApproval request, when Warehouse withdraws with reason before Admin decision, then it becomes Withdrawn with no Inventory effect; stale withdrawal loses cleanly to the terminal decision. | `approved-requirement` |
| AT-092 | Given PendingApproval, when Admin approves or rejects with mandatory reason, then exact immutable quantity is decided once, ApprovedQuantity equals RequestedQuantity on approval, and Inventory remains unchanged. | `approved-requirement` |
| AT-093 | Given Supplier or any wrong actor attempts system access, Admin edits quantity, decision lacks reason, or request is stale, then access/action is denied; external purchasing remains outside GreenHouse and no stock changes. | `approved-requirement` |
| AT-094 | Given an Approved request and valid delivery evidence with accepted units below ApprovedQuantity, when Warehouse records receipt, then only accepted units increment Sellable once, receipt/transaction commit together, and status becomes PartiallyReceived. | `approved-requirement` |
| AT-095 | Given one or more valid subsequent receipts make NetAccepted equal ApprovedQuantity, when the final receipt commits, then exact remaining accepted stock is added once and request becomes Completed with every receipt preserved. | `approved-requirement` |
| AT-096 | Given wrong, damaged, undocumented, or excess delivered units or delivered != accepted + rejected, when inspected, then invalid input is rejected or those units are recorded as rejected with zero Inventory effect and request completion uses accepted units only. | `approved-requirement` |
| AT-097 | Given repeated/concurrent receipt or correction idempotency keys, when processed, then each accepted or reversed quantity affects Inventory at most once and callers receive the existing outcome. | `approved-requirement` |
| AT-098 | Given Supplier cannot finish or a receipt is wrong, when Warehouse submits evidence and the authorized short-closure/correction path runs, then accepted stock is preserved, short closure requires Admin, originals remain append-only, net accepted/status recompute, and no hidden overwrite occurs. | `approved-requirement` |
| AT-099 | Given every actor boundary, grouped failure, audit requirement, or notification failure in SL-005, when exercised, then forbidden data/actions are denied, atomic business state remains correct, evidence is attributable, and notification retries create no repeated business effect. | `approved-requirement` |

## 18. Preliminary G3 Traceability

| Decision | Requirements | Use case/interface | Implementation evidence | Acceptance | Confirmed gap | Status |
|---|---|---|---|---|---|---|
| BD-051 | BR-047 | UC-INV-01; Admin Product API/form; Inventory reads | `server/src/models/product.model.js`; `server/src/services/product.service.js`; `server/src/models/inventory.model.js`; `server/src/services/inventory.service.js` | AT-075, AT-076 | Product and Inventory both store/write stock; Inventory is lazily created from Product | ready |
| BD-052 | BR-048 | Inventory response/calculation and all stock-aware interfaces | `inventory.model.js`; `inventory.service.js` | AT-077 | No QuarantinedQuantity or InventoryHealth; model rejects Reserved above stock rather than representing physical reconciliation | ready |
| BD-053 | BR-049 | UC-DMG-01 Staff form/API | `server/src/models/damageReport.model.js`; `server/src/services/damageReport.service.js`; `server/src/routes/damageReport.routes.js`; no current Staff damage UI | AT-078, AT-079 | Creation has no evidence/idempotency/quarantine and tests explicitly expect no quantity effect until confirmation | ready |
| BD-054, BD-055 | BR-050, BR-051 | UC-DMG-01 Warehouse queue/decision/disposition | DamageReport model/service/routes and inventory transaction types | AT-080 through AT-082 | Only full confirm is implemented; Rejected exists only as an enum; no partial/reject/withdraw/disposition route or immutable evidence contract | ready |
| BD-056 | BR-052 | UC-STK-01; Warehouse inventory count UI/API | `server/src/services/inventory.service.js`; `client/src/pages/warehouse/InventoryListPage.jsx` | AT-083, AT-084 | API accepts signed delta and UI exposes `+1/-1` with canned reasons; transaction lacks dimension-level before/after evidence | ready |
| BD-057 | BR-053 | UC-STK-01 reconciliation view and reservation/export guard | Inventory validation and export paths in `inventory.service.js`; Order/export code from SL-003/SL-004 | AT-085, AT-086 | Current update is blocked when it would violate available stock, so real shortage is not recorded and no affected-Order reconciliation state exists | ready |
| BD-058 | BR-054 | UC-LOW-01; settings and Warehouse low-stock UI | `systemSetting.service.js`; `inventory.service.js`; `client/src/pages/warehouse/LowStockPage.jsx` | AT-087, AT-088 | Inventory initialization hard-codes 5 despite global setting; low stock is a computed list/adjustment notification with no persistent lifecycle or override ownership | ready |
| BD-059 | BR-055 | UC-REP-01 Warehouse request/withdraw UI/API | `replenishmentRequest.model.js`; `replenishment.service.js`; `ReplenishmentPage.jsx` | AT-089 through AT-091 | One Product exists, but evidence, idempotency, one-active guard, immutable versioning, and withdrawal are missing | ready |
| BD-060 | BR-056 | UC-REP-01 Admin decision UI/API | `replenishment.service.js`; `client/src/pages/admin/ReplenishmentAdminPage.jsx` | AT-092, AT-093 | Admin note is optional/canned and ApprovedQuantity is not snapshotted separately | ready |
| BD-061 | BR-057 | Off-system Supplier handoff; UC-REC-01 receipt form/API | Replenishment model/service/UI | AT-093, AT-094 | No supplier/delivery reference, delivered/accepted/rejected split, or inspection evidence exists | ready |
| BD-062 | BR-058 | UC-REC-01 partial receipt, short closure, correction, duplicate feedback | `replenishment.service.js`; `replenishment.service.test.js`; `ReplenishmentPage.jsx`; `inventoryTransaction.model.js` | AT-094 through AT-099 | Code and tests require one exact full receipt, reject partial receipt, and have no rejected-unit, short-closure, or append-only correction lifecycle | ready |

## 19. Confirmed Current Conflicts

The following are `observed-behavior`, not approved policy:

1. `product.model.js` and `inventory.model.js` both persist stock quantity, while Product create/update accepts direct stock input.
2. `inventory.service.js` lazily creates missing Inventory from Product stock and hard-codes threshold `5`, despite the configurable `LOW_STOCK_DEFAULT_THRESHOLD`.
3. Inventory has Stock/Reserved/Damaged only and enforces Reserved not above Stock; there is no quarantine dimension or ReconciliationRequired state.
4. Staff damage-report creation requires quantity/reason but not evidence, does not validate a bounded quarantinable movement, and changes no Inventory.
5. DamageReport declares Rejected but routes/services expose only Warehouse confirmation; no partial confirmation, rejection, withdrawal, disposition, or client damage workflow exists.
6. Damage confirmation rejects a reservation conflict, leaving known suspected/physical damage represented as sellable instead of opening reconciliation; current tests encode that candidate behavior.
7. Warehouse adjustment accepts an arbitrary signed delta, mirrors the result back to Product, and the UI provides `+1/-1` buttons with canned reasons.
8. Low-stock display is computed and notification is emitted only from selected adjustment behavior; there is no persistent alert lifecycle or Product override owner.
9. Replenishment is one Product per request, but lacks evidence, immutable ApprovedQuantity, one-active Product guard, idempotent request creation, and withdrawal.
10. Admin approval/rejection accepts an optional note and current UI generates generic decision text rather than requiring a business reason.
11. Warehouse receipt posts the full requested quantity automatically, permits exactly one receipt, and rejects both partial and excess receipt; tests explicitly enforce this behavior.
12. Replenishment has no Supplier/delivery reference, accepted/rejected inspection split, short closure, receipt evidence, or compensating correction.
13. InventoryTransaction records a single stock before/after value and only four transaction types, which cannot prove quarantine, dimension-level count, damaged disposition, partial receipt, or reversal.

## 20. Cross-Slice Consistency Boundaries

1. `SL-003` checkout reservation must use SL-005 AvailableQuantity and may not reserve a Product in ReconciliationRequired.
2. `SL-004` stock export consumes SellableQuantity and ReservedQuantity atomically and must stop when SL-005 blocks a reconciled-deficit Product.
3. `SL-001`, `SL-002`, and `SL-004` returned-item receipt must classify sellable/damaged units into this Inventory and append linked transactions rather than write Product stock.
4. A suspected/damaged returned item uses the approved after-sales inspection as its source evidence; it must not be double-counted through a separate Staff damage report.
5. Low-stock evaluation runs after reservation release, export, return classification, quarantine, damage decision/disposition, count, replenishment receipt/correction, and threshold change.
6. Actor permissions remain consistent: Staff/CSKH coordinates Customers and may report suspected damage; Warehouse owns physical evidence; Admin owns policy/approval but no physical quantity mutation; Customer and external Supplier have no internal Inventory access.

## 21. Method Basis and Next Phase

Archived SWR guidance requires requirements to be complete, feasible, verifiable, necessary, and mutually consistent before design/construction. Archived SWD guidance models state-dependent behavior through explicit current state, event, guard, action, and next state, including alternate scenarios. GreenHouse business policy in this document comes only from SRC-031 and approved cross-slice decisions, not from method sources, the candidate SRS, passing tests, or current code.

No implementation plan, migration, Google SRS mutation, or code change is authorized by this document alone. The project will continue through the remaining core business packages and then perform one cross-system consistency audit before freezing the SRS baseline and beginning acceptance-test-first implementation.
