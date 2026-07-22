# SL-002 Exchange Design

**Date:** 2026-07-22

**Status:** Design approved; G0, G1, and G2 passed; implementation not started

**Business approver:** Project Business Approver (user in this Codex task)

**Repository baseline:** `2cd0b9518b42a6d1860951b20cdcfdfa2e398ca5`
**SRS baseline:** Google Docs revision `AIroW37xl-9inybbV_Kt8cUUhLWLjhfImasxQ_JiEqN2hcPklBhnb6W4yZNbueA2tCWVmMd5XfIbQTkiJLGM6ni-TNQx-hc6-YKXxEmQoPE`; Drive revision `4842`; modified `2026-07-21T19:00:10.282Z`

## 1. Purpose and Scope

`SL-002` defines one end-to-end business outcome: an eligible Customer exchanges one or more purchased units from one Delivered Order for the exact same SKU and quantity accepted by Warehouse.

The Customer enters through one **Đổi/Trả hàng** action in Order history/detail, then chooses one of two separate business outcomes:

- **Đổi hàng** enters `SL-002` and produces replacement goods, Inventory movements, and Shipment evidence.
- **Trả hàng & hoàn tiền** enters `SL-001` and produces a whole-Order Refund through the separately approved money flow.

The two slices share an Order-level after-sales exclusivity rule but do not share financial fields, lifecycle states, or terminal outcomes.

### Goals

- Make Customer, Staff/CSKH, Warehouse, Carrier, and System responsibilities observable and testable.
- Support partial selection from one Order without allowing arbitrary products or quantities.
- Reserve replacement Inventory before approval and preserve atomic, idempotent Inventory outcomes.
- Support per-unit Warehouse acceptance, rejection, condition classification, and outbound fulfillment.
- Give each replacement unit a traceable lineage and a fresh five-day exchange window.
- Keep Exchange independent from Refund amount, refund destination, payOS, and partial-refund behavior.

### Non-goals

- Do not let Customer choose a different SKU, variant, price, or value difference.
- Do not issue money, store refund destinations, or invoke payOS in the Exchange flow.
- Do not define a fixed reason catalogue in version 1; Staff owns the eligibility judgment and records its reason.
- Do not allow simultaneous Exchange and Return/Refund cases for the same Order.
- Do not modify the Google SRS, tests, APIs, database, or application code in this design step.

## 2. Current Gate Dashboard

| Slice ID | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Blocker | Owner | Next evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SL-002 | passed | passed | passed | ready | not-started | not-started | not-started | not-started | Written-spec review, then decision-to-code/test mapping | Project Business Approver for review; engineering owner `unassigned` | Approved written spec and complete G3 traceability matrix |

G0 passed because the user in this task is the recorded Project Business Approver. G1 passed when the actor matrix in Section 5 was approved. G2 passed when the approver accepted the trigger, preconditions, paths, rules, state invariants, UI constraints, and acceptance examples consolidated here. G3 remains unperformed; no code change is authorized by this document alone.

## 3. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-011 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Docs/Drive revisions in the document header | Existing candidate Return/Refund requirements and current actor/use-case vocabulary | Candidate source only for SL-002 until reconciled and approved | SRS contributors; approval by Project Business Approver | It has no approved, separate Exchange lifecycle matching this design |
| SRC-012 | Explicit approvals in this Codex task | 2026-07-22 | BD-009 through BD-028 and the complete SL-002 design | Normative business authority for SL-002 | Project Business Approver | Approval identity is the user of this task; no personal display name was recorded |
| SRC-013 | Repository `D:\GreenHouse_System-main` | HEAD `2cd0b9518b42a6d1860951b20cdcfdfa2e398ca5`; inspected 2026-07-22 | Current routes, models, UI, settings, and tests | `observed-behavior`, not business authority | Engineering team | Only a combined Return/Refund implementation exists; Exchange is not modeled separately |
| SRC-014 | `docs/superpowers/reconciliation/SL-001_RETURN_REFUND_G0_G1.md` and `SL-001_RETURN_REFUND_G2_DRAFT.md` | Accessed 2026-07-22 | Approved Return/Refund money boundary and pending SL-001 decisions | Normative only where SL-001 decisions are approved | Project Business Approver | SL-001 G2 still contains unresolved BD-006 through BD-008 and must not be silently completed by SL-002 |
| SRC-015 | Archived SWR source, Hassan Gomaa Chapter 6 and SWR Chapters 9, 10, and 17 | Local archive accessed 2026-07-22 | Actor/use-case structure, business-rule traceability, SRS quality, and acceptance validation guidance | Method guidance, not GreenHouse business authority | SWR archive | Does not decide GreenHouse policy |
| SRC-016 | Archived SWD source, `Ch05_Overview of Software Modeling & Design Methods.pptx.md` | Local archive accessed 2026-07-22 | Consistency among use cases, participating objects, state models, components, and interfaces | Method guidance, not GreenHouse business authority | SWD archive | Does not decide GreenHouse component names or technology |

## 4. Approved Business Decision Log

The IDs below continue after BD-006 through BD-008, which are already reserved by the SL-001 draft and are not reused.

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Decision date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-009 | SL-002 | Should Exchange be merged with Return/Refund? | Separate use cases with a shared entry/guard; one typed request; generic after-sales engine | Keep Exchange and Return/Refund as separate use cases and data lifecycles behind one **Đổi/Trả hàng** entry | Goods replacement and money refund create different actor outcomes, states, risks, and evidence | Project Business Approver | 2026-07-22 | BR-003, BR-005, BR-018 |
| BD-010 | SL-002 | Who owns each Exchange responsibility? | Shared Staff ownership; split Customer/Staff/Warehouse/Carrier boundaries | Customer initiates and ships; Staff/CSKH decides and coordinates; Warehouse inspects/classifies; Carrier supplies delivery facts; System enforces deterministic rules | Prevent actors from deciding, editing, or viewing data outside their role | Project Business Approver | 2026-07-22 | BR-004, BR-010, BR-020 |
| BD-011 | SL-002 | How are reason and evidence handled? | Fixed catalogue; unrestricted text; text plus evidence with Staff judgment | Require free-text reason and at least one successfully uploaded evidence attachment; Staff decides approve/reject and records its reason | Preserve Staff discretion while making each request and decision attributable without inventing a file-format policy at G2 | Project Business Approver | 2026-07-22 | BR-004 |
| BD-012 | SL-002 | What is the request window? | Calendar-end deadline; configurable current value; immutable five-day instant | Customer must submit at or before immutable `ExchangeRequestDeadlineAt = DeliveredAt + 5 days` | A stored deadline prevents later setting changes from changing existing rights | Project Business Approver | 2026-07-22 | BR-003 |
| BD-013 | SL-002 | What may Customer select? | Whole Order; whole Order line only; bounded unit count per selected line | One request belongs to one Order. Customer selects one or more Order lines and, only when purchased quantity exceeds one, a bounded count from 1 through purchased quantity. No free-form quantity input is allowed | Avoid unnecessary whole-Order exchange without allowing arbitrary quantity or cross-Order data | Project Business Approver | 2026-07-22 | BR-006, BR-007, BR-018 |
| BD-014 | SL-002 | When may Staff approve? | Approve then check stock; reserve best effort; atomic reservation | Staff may approve only when System atomically reserves the exact same SKU and requested quantity | Prevent approval that cannot be fulfilled and prevent partial reservation | Project Business Approver | 2026-07-22 | BR-008 |
| BD-015 | SL-002 | When may Shop send replacement goods? | Before inbound receipt; after Customer ships; only after Warehouse acceptance | Replacement ships only after Warehouse receives and accepts the returned units | Prevent replacement before the physical evidence is verified | Project Business Approver | 2026-07-22 | BR-009, BR-012 |
| BD-016 | SL-002 | How long may Customer take to hand off approved goods? | No deadline; five days; three days | Store immutable `ShipByAt = ApprovedAt + 3 days`. Customer supplies Carrier tracking/handoff proof. Missing the deadline expires the case and releases reservations. Customer may cancel before handoff but not after | Avoid indefinitely locked stock and make cancellation ownership clear | Project Business Approver | 2026-07-22 | BR-009 |
| BD-017 | SL-002 | What happens when Warehouse accepts only some units? | All-or-nothing; accept all as damaged; per-unit outcome | Accepted units continue to replacement; rejected units receive reason/evidence, release matching reservations, and are returned to Customer | Preserve unit-level fairness and accurate stock | Project Business Approver | 2026-07-22 | BR-010, BR-011, BR-012 |
| BD-018 | SL-002 | Who pays shipping? | Shop always; Customer always; fault-based | Shop pays both directions for product defect or Shop wrong delivery. Customer pays both directions for preference-based exchange that Staff elects to approve. Staff records payer and rationale | Assign cost to the cause while keeping the exception explicit | Project Business Approver | 2026-07-22 | BR-013 |
| BD-019 | SL-002 | Does replacement reopen after-sales rights? | Reopen whole Order; no new window; replacement-only five-day window | Only each delivered replacement unit receives a fresh five-day Exchange window from `ReplacementDeliveredAt`; the original whole-Order Return/Refund window does not reopen | Protect the replacement without resetting unrelated Order rights | Project Business Approver | 2026-07-22 | BR-014 |
| BD-020 | SL-002 | How many re-exchanges are allowed? | One only; fixed count; no hard count with full evidence each cycle | No hard numeric limit. Each cycle requires evidence, Staff approval, Warehouse inspection, lineage, and one active request per physical unit | Avoid arbitrary denial while preserving control and traceability | Project Business Approver | 2026-07-22 | BR-015 |
| BD-021 | SL-002 | May an Order have simultaneous after-sales cases? | One per item; Exchange and Return/Refund in parallel; one active case per Order | One active after-sales case per Order across Exchange and Return/Refund | Prevent incompatible state, Inventory, and money outcomes | Project Business Approver | 2026-07-22 | BR-005 |
| BD-022 | SL-002 | How does Warehouse treat returned originals and replacement stock? | All damaged; no inbound stock; per-unit classification | Accepted sellable units enter sellable stock; accepted damaged units enter damaged stock; rejected units do not enter Inventory and return to Customer. Replacement reservation is consumed only when its outbound shipment is created | Keep physical stock and fulfillment evidence aligned | Project Business Approver | 2026-07-22 | BR-011, BR-012 |
| BD-023 | SL-002 | What starts the replacement five-day window? | Customer confirmation; shipment time; Carrier-confirmed delivery | Use Carrier-confirmed delivery. If no integration exists, Staff records the timestamp from tracking evidence; actor, source, and time are audited and Customer may dispute it | Avoid dependence on voluntary Customer confirmation or an unfair shipment-time clock | Project Business Approver | 2026-07-22 | BR-014, BR-016 |
| BD-024 | SL-002 | Who bears risk when replacement is lost/damaged before delivery? | Customer; Carrier only; Shop remains responsible | Shop remains responsible until successful delivery. The Exchange case stays open; Customer creates no new request and pays no extra fee; Staff records the incident and resends | Keep fulfillment risk with the sender before delivery | Project Business Approver | 2026-07-22 | BR-017 |
| BD-025 | SL-002 | What if a replacement/resend cannot be fulfilled because exact stock is unavailable? | Reject/close; partial refund; wait or convert | Customer may wait for the exact SKU or convert to the separately governed whole-Order Return/Refund flow. Preserve the original timely request timestamp. Exchange never issues a partial refund | Avoid inventing a partial-money path and preserve Customer eligibility | Project Business Approver | 2026-07-22 | BR-017, BR-018 |
| BD-026 | SL-002 | What must each actor see in the UI? | Combined form; actor-specific forms; generic case form | Use actor-specific Customer, Staff, and Warehouse surfaces. Exchange contains no amount, bank account, payout, or payOS fields | Make the UI enforce the approved separation and privacy boundary | Project Business Approver | 2026-07-22 | BR-018, BR-020 |
| BD-027 | SL-002 | What happens when Customer submits repeatedly? | Ignore clicks; show generic error; idempotent result plus explicit feedback | Disable the first submit while processing; repeated attempts show a clear processing/already-recorded message and return the existing case. Exactly one case and reservation may exist | Prevent duplicate effects without making the UI appear broken | Project Business Approver | 2026-07-22 | BR-019 |
| BD-028 | SL-002 | When is an Exchange case complete? | Replacement shipped; accepted goods delivered; every outbound obligation delivered | Complete only after every accepted replacement and every rejected-original return obligation reaches its required delivered terminal state | Prevent early closure and lost rejected goods | Project Business Approver | 2026-07-22 | BR-021 |

## 5. G1 Actor Responsibility Matrix

This matrix is `approved-requirement` through BD-010 and its later refinements.

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Customer — primary actor for UC-EX-01 | Exchange eligible purchased units for exact replacements | Submit from one owned Delivered Order before deadline; select bounded units; provide reason/evidence; cancel before Carrier handoff; submit tracking/handoff proof; report delivery dispute | Approve/reject; select another SKU; exceed purchased quantity; enter free-form quantity; inspect/classify Inventory; issue money; cancel after handoff; open a concurrent after-sales case | Initiates `Submitted`; may cause `Cancelled` before handoff; supplies the event that permits `CustomerShipped` | Read own Order, Exchange, deadlines, decisions, inspection results, payer, and Shipment status; write own selection, reason, evidence, cancellation, tracking, and dispute only | Request to Staff; approved return goods to Carrier/Warehouse; receives replacement or rejected original | Foreign, late, duplicate, cross-Order, excessive-quantity, missing-evidence, and forbidden-cancel attempts are denied with explicit feedback |
| Staff/CSKH — primary actor for review and fulfillment coordination | Decide eligibility and coordinate a traceable Exchange | Approve/reject with reason; record shipping payer/rationale; approve only through atomic reservation; coordinate outbound Shipment; record Carrier delivery evidence when needed; record delivery incident; offer approved wait/conversion outcome | Edit Customer's original submission; approve without exact reservation; perform Warehouse inspection; change SKU/quantity; insert refund amount or destination; mark delivery without evidence | `Submitted -> ApprovedAwaitingShipment` or `Submitted -> Rejected`; records `DeliveryIncident`; coordinates recovery back to outbound fulfillment; may initiate approved conversion handoff | Read Order, request, evidence, relevant stock availability, inspection, and Shipment evidence; write decision, payer/rationale, operational notes, verified Carrier facts, and incident records | Decision/instructions to Customer; accepted results from Warehouse; outbound task to Warehouse/Carrier; conversion handoff to SL-001 | Stock race leaves request unapproved; invalid evidence may be rejected; Carrier unknown/lost/damaged remains non-terminal; no-stock recovery offers wait or conversion |
| Warehouse — secondary actor | Account for every returned unit and prepare authorized outbound goods | Record receipt; inspect each unit; accept/reject with reason/evidence; classify accepted original as sellable/damaged; pack and hand off authorized replacement/rejected-original Shipment | Approve the business request; change Customer submission; decide payer; access Refund/bank/payOS data; replace with another SKU; mark Carrier delivery | `CustomerShipped -> WarehouseInspecting`; supplies the inspection completion event that permits outbound fulfillment | Read only Order-line identity, requested quantity, evidence needed for inspection, and Shipment instructions; write received quantities, unit outcomes, condition, evidence, and physical handoff | Inbound from Carrier/Customer; inspection outcome to Staff/System; outbound parcel to Carrier | Quantity discrepancy or incomplete inspection cannot finalize; failed atomic Inventory writes leave the prior state and reservations intact |
| Carrier — supporting external actor | Transport and provide objective tracking/delivery facts | Supply handoff, tracking, delivery, loss, and damage events/evidence | Decide eligibility, inspection, Inventory, payer, or case completion by itself | Owns no GreenHouse state; its evidence enables validated System transitions | Receives minimum shipping data; writes/provides external tracking facts only | Customer to Warehouse; Warehouse/Shop to Customer; events to System or verified Staff entry | Unknown/failed/lost/damaged events keep the case open and require reconciliation |

### System Responsibilities — Not an Actor

- Enforce ownership, role permissions, deadlines, quantity bounds, same-SKU replacement, and after-sales exclusivity on the server.
- Snapshot immutable deadlines and delivery evidence; display instants in `Asia/Ho_Chi_Minh` while retaining an unambiguous stored instant.
- Atomically reserve/release/consume Inventory and reject partial commits.
- Make submit, approval, inspection finalization, outbound creation, Carrier event handling, and completion idempotent.
- Preserve append-only audit history for Customer input, decisions, inspections, Inventory effects, Shipments, incidents, and corrections.
- Evaluate deterministic rules and expiry only; never decide whether the Customer's subjective reason merits approval.
- Send in-app feedback for processing, duplicate, success, failure, deadline, and existing-case outcomes.

## 6. Business Slice Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-002 | Customer exchanges eligible units from one Delivered Order for exact same-SKU replacements | Customer selects **Đổi hàng** from **Đổi/Trả hàng** on an owned Order | Authenticated owning Customer; `OrderStatus=Delivered`; submit instant `<= ExchangeRequestDeadlineAt`; at least one selected Order line and valid bounded quantity; free-text reason; at least one uploaded evidence attachment; no active after-sales case for the Order or physical unit | Execute Sections 8.1 and 8.2 through complete delivery of every outbound obligation | Execute Section 8.3 without bypassing reservation, inspection, delivery, conversion, or audit requirements | Deadline `DeliveredAt + 5 days`; ship-by `ApprovedAt + 3 days`; same SKU; replacement quantity equals accepted quantity; fault-based fees | One active after-sales case per Order; no negative/partial Inventory; no replacement before acceptance; no duplicate effect; no money in Exchange; completion waits for all deliveries | Apply Section 5 and System responsibilities | AT-019 through AT-039 | `approved-requirement` |

## 7. Requirement Catalogue

| Requirement ID | Requirement | Origin | Acceptance examples | Classification |
|---|---|---|---|---|
| BR-003 | System shall accept an Exchange submission only for the authenticated Customer's Delivered Order at or before its immutable five-day request deadline. Equality with the deadline is eligible; any later instant is not. | BD-012 | AT-019, AT-020 | `approved-requirement` |
| BR-004 | Customer shall provide a free-text reason and at least one successfully uploaded evidence attachment. Staff alone approves/rejects and records a decision reason; System shall not judge reason merit. Allowed file types, sizes, and security controls are implementation constraints to define before G4 and do not change this business rule. | BD-010, BD-011 | AT-019, AT-022, AT-025 | `approved-requirement` |
| BR-005 | System shall allow at most one active after-sales case per Order and one active Exchange per physical unit across Exchange and Return/Refund. | BD-009, BD-021 | AT-023 | `approved-requirement` |
| BR-006 | An Exchange belongs to one Order. Customer may select one or more Order lines and a bounded quantity between one and the purchased quantity; quantity is not free-form and cannot reference another Order. | BD-013 | AT-021 | `approved-requirement` |
| BR-007 | Each approved replacement shall use the exact original SKU/variant and selected quantity; no different product, price difference, additional payment, or money credit is allowed. | BD-013 | AT-021, AT-038 | `approved-requirement` |
| BR-008 | Approval and exact replacement reservation shall commit atomically. Insufficient/raced stock leaves the request unapproved and creates no partial reservation. | BD-014 | AT-024 | `approved-requirement` |
| BR-009 | Approval shall snapshot `ShipByAt = ApprovedAt + 3 days`. Customer may cancel before Carrier handoff. Valid handoff proof before/equal to the deadline permits progression; cancellation or expiry releases all reservations. | BD-016 | AT-026, AT-027 | `approved-requirement` |
| BR-010 | Warehouse shall account for and inspect every requested unit, recording accepted/rejected quantities, reason/evidence, and condition. Finalization requires non-negative integers and complete quantity accounting. | BD-010, BD-017 | AT-028, AT-029, AT-030 | `approved-requirement` |
| BR-011 | Atomic inspection finalization shall add accepted sellable originals to sellable stock, add accepted damaged originals to damaged stock, create no stock for rejected originals, and release rejected replacement reservation quantities. | BD-017, BD-022 | AT-028, AT-029, AT-030 | `approved-requirement` |
| BR-012 | Replacement/rejected-original outbound fulfillment begins only after inspection. Creating a replacement outbound Shipment atomically consumes its accepted replacement reservation; rejected originals are returned without replacement. | BD-015, BD-017, BD-022 | AT-028, AT-029, AT-030 | `approved-requirement` |
| BR-013 | Staff shall record the shipping payer and rationale. Shop pays both directions for defect/Shop error; Customer pays both directions for approved preference exchange. | BD-018 | AT-031 | `approved-requirement` |
| BR-014 | Carrier-confirmed `ReplacementDeliveredAt` starts a new immutable five-day Exchange window only for delivered replacement units. It shall not reopen the original whole-Order Return/Refund deadline. | BD-019, BD-023 | AT-035 | `approved-requirement` |
| BR-015 | Re-exchange has no hard numeric limit, but every cycle requires new reason/evidence, Staff decision, Warehouse inspection, original-to-replacement lineage, and one active case per physical unit. | BD-020 | AT-036 | `approved-requirement` |
| BR-016 | Carrier delivery facts shall be ingested directly when available; otherwise Staff may record them only from tracking evidence. Actor, source, time, and Customer dispute shall be auditable. | BD-023 | AT-035, AT-039 | `approved-requirement` |
| BR-017 | Loss/damage before replacement delivery remains Shop responsibility. Case stays open; Customer creates no new request or fee. Staff resends; if exact stock is unavailable, Customer chooses wait or conversion to the separately governed whole-Order Return/Refund flow with the original timely request instant preserved. | BD-024, BD-025 | AT-032, AT-033 | `approved-requirement` |
| BR-018 | Exchange UI/data shall contain no Refund amount, bank account, payout, payOS, partial refund, different-SKU, or price-difference field. Conversion hands control to SL-001 rather than paying within Exchange. | BD-009, BD-025, BD-026 | AT-038 | `approved-requirement` |
| BR-019 | Repeated submission/command retries shall return the existing idempotent result and visibly notify the actor. Customer submission retries shall create exactly one Exchange and one reservation set. | BD-027 | AT-022 | `approved-requirement` |
| BR-020 | Server-side authorization and append-only audit shall protect Customer input, Staff decisions, Warehouse inspection, Inventory, Shipment, and Carrier evidence from forbidden actor mutation or disclosure. | BD-010, BD-026 | AT-037, AT-039 | `approved-requirement` |
| BR-021 | Exchange shall complete only after every accepted replacement and every rejected-original return obligation reaches its required delivered terminal state. | BD-028 | AT-034 | `approved-requirement` |

## 8. Use Case UC-EX-01 — Exchange Purchased Units

### 8.1 Trigger and Preconditions

1. Customer opens one owned Order from Order history/detail and selects **Đổi/Trả hàng → Đổi hàng**.
2. Order is `Delivered` and has immutable `ExchangeRequestDeadlineAt` calculated when it became Delivered.
3. Submission time is at or before the deadline.
4. No active Exchange or Return/Refund exists for that Order; no selected physical unit has another active Exchange.
5. Customer selects at least one Order line. A line purchased once uses a checkbox; a line purchased more than once uses a bounded selector from 1 through purchased quantity.
6. Customer enters a free-text reason and uploads at least one evidence attachment successfully.

### 8.2 Main Sequence

1. System displays only the selected Order's product identity, purchased quantity, bounded selector, immutable deadline, reason, evidence, and confirmation controls. It displays no money or bank field.
2. Customer reviews and submits.
3. System revalidates ownership, state, deadline, active-case locks, Order-line identity, quantities, evidence, and idempotency identity.
4. System creates exactly one `Submitted` Exchange and retains an immutable snapshot of the selected Order/SKU/quantity and original Customer content.
5. Staff reviews the request, records payer/rationale and decision reason, and selects approve.
6. In one atomic transaction, System verifies exact same-SKU stock, creates reservations for all requested units, records `ApprovedAt`, stores `ShipByAt = ApprovedAt + 3 days`, and moves to `ApprovedAwaitingShipment`.
7. Customer hands the selected originals to Carrier and submits valid tracking/handoff proof at or before `ShipByAt`.
8. System records the handoff and moves to `CustomerShipped`.
9. Warehouse receives the parcel, moves the case to `WarehouseInspecting`, and accounts for every requested unit.
10. Warehouse records accepted/rejected quantities, condition, reason, and evidence per line. For accepted units it classifies the original as sellable or damaged.
11. In one atomic finalization, System validates complete quantity accounting, posts accepted-original Inventory movements, releases replacement reservations for rejected quantities, retains reservations for accepted quantities, and opens outbound fulfillment.
12. Warehouse/Staff creates authorized outbound Shipments: exact replacement units for accepted quantities and original-return units for rejected quantities.
13. Creating each replacement outbound Shipment atomically consumes the corresponding reservation. Rejected originals never enter Inventory.
14. Carrier supplies tracking and delivery outcomes. System or evidence-backed Staff records delivery facts with actor/source/time.
15. For every delivered replacement unit, System stores `ReplacementDeliveredAt`, opens only that unit's fresh five-day Exchange window, and links its lineage to the original unit/cycle.
16. Once every replacement and rejected-original return obligation is delivered, System moves the case to `Completed` and notifies Customer.

### 8.3 Alternative and Failure Paths

| Branch | Condition | Required outcome | Classification |
|---|---|---|---|
| AF-EX-01 | Foreign Order, non-Delivered Order, late submission, or malformed selection | Deny with specific reason; create no Exchange, lock, or reservation | `approved-requirement` |
| AF-EX-02 | Customer selects another Order/SKU, zero, fractional, or excessive quantity | Deny; preserve valid draft input where safe; create no Exchange | `approved-requirement` |
| AF-EX-03 | Reason missing or evidence upload incomplete | Do not submit; identify the missing requirement | `approved-requirement` |
| AF-EX-04 | Active after-sales case already exists | Return the existing case and **Xem yêu cầu đang xử lý** action; create no duplicate | `approved-requirement` |
| AF-EX-05 | Customer submits/clicks repeatedly or retries after a lost response | Show processing/already-recorded feedback and return the same result; exactly one case and reservation identity exist | `approved-requirement` |
| AF-EX-06 | Staff rejects | `Submitted -> Rejected`; reason required; create no reservation, Inventory movement, replacement, or money outcome; notify Customer | `approved-requirement` |
| AF-EX-07 | Exact stock is insufficient or lost in an approval race | Approval fails atomically; request remains `Submitted`; no partial reservation exists; Staff communicates the unavailable outcome | `approved-requirement` |
| AF-EX-08 | Customer cancels before Carrier handoff | Move to `Cancelled`; release all reservations atomically; retain audit | `approved-requirement` |
| AF-EX-09 | Customer misses `ShipByAt` | Move to `Expired`; release all reservations atomically; late handoff cannot revive the case automatically | `approved-requirement` |
| AF-EX-10 | Customer attempts self-cancel after handoff | Deny; Staff handles an operational exception without erasing the shipment evidence | `approved-requirement` |
| AF-EX-11 | Inbound parcel does not account for every requested unit | Do not finalize inspection or send replacement for unaccounted units; retain the case for Staff/Carrier discrepancy handling | `approved-requirement`, derived from complete quantity accounting |
| AF-EX-12 | Warehouse accepts some and rejects some | Continue accepted quantities; release rejected reservations; return rejected originals with reason/evidence; complete only after all outbound obligations deliver | `approved-requirement` |
| AF-EX-13 | Warehouse rejects every unit | Release all replacement reservations; return all originals; close as `ClosedNoExchange` only after return delivery | `approved-requirement` |
| AF-EX-14 | Any inspection/Inventory/reservation write fails | Roll back the grouped finalization; retain `WarehouseInspecting`; create no partial outbound authorization | `approved-requirement` |
| AF-EX-15 | Replacement Shipment is lost/damaged before delivery | Move to `DeliveryIncident`; Shop bears responsibility; create no new Customer request/fee; preserve all prior evidence | `approved-requirement` |
| AF-EX-16 | Exact resend stock is available | Atomically reserve and create a new same-SKU resend; keep the same case and lineage | `approved-requirement` |
| AF-EX-17 | Exact resend/initial approval stock is unavailable and Customer chooses wait | Keep the case open in a visible waiting outcome; do not invent a different SKU or money credit | `approved-requirement` |
| AF-EX-18 | Customer chooses whole-Order Return/Refund conversion | Atomically release remaining Exchange reservations, close Exchange as `ConvertedToReturnRefund`, and hand the original timely submission instant to SL-001. SL-001 owns all money, destination, whole-Order receipt, and payout rules | `approved-requirement`; implementation depends on SL-001 G2/G3 |
| AF-EX-19 | Carrier integration is absent or delivery time disputed | Staff records only evidence-backed facts; retain source and dispute audit; do not silently alter the five-day clock | `approved-requirement` |
| AF-EX-20 | Customer requests another Exchange for a delivered replacement within its new window | Create a new cycle only if Order/unit locks are free; require new reason/evidence and repeat approval/inspection; retain lineage | `approved-requirement` |

## 9. State Model

| State | Meaning | Entry owner/evidence | Permitted next states |
|---|---|---|---|
| `Submitted` | Valid Customer request exists; no stock reserved yet | Customer submission accepted by System | `ApprovedAwaitingShipment`, `Rejected`, `Cancelled` |
| `ApprovedAwaitingShipment` | Staff approved and exact replacement stock is reserved; three-day handoff clock runs | Staff decision plus atomic reservation | `CustomerShipped`, `Cancelled`, `Expired` |
| `CustomerShipped` | Customer handed originals to Carrier with valid proof | Customer/Carrier evidence | `WarehouseInspecting` |
| `WarehouseInspecting` | Warehouse has receipt custody and must account for every unit | Warehouse receipt | `OutboundFulfillment` after successful atomic finalization |
| `OutboundFulfillment` | Accepted replacements and/or rejected-original returns must be packed and handed off | Complete inspection outcomes | `ReplacementShipped`, `ClosedNoExchange`, `Completed` only when applicable obligations are delivered |
| `ReplacementShipped` | At least one authorized replacement is in transit | Outbound Shipment plus consumed reservation | `Completed`, `DeliveryIncident` |
| `DeliveryIncident` | Replacement lost/damaged/unknown before confirmed delivery | Carrier/Staff evidence | `OutboundFulfillment`, `ReplacementShipped`, `ConvertedToReturnRefund` |
| `Rejected` | Staff denied eligibility with reason | Staff | Terminal |
| `Cancelled` | Customer cancelled before handoff and reservations were released | Customer plus System atomic release | Terminal |
| `Expired` | Customer missed immutable `ShipByAt` and reservations were released | System time rule | Terminal |
| `ClosedNoExchange` | No unit was accepted and all rejected originals were returned | Warehouse outcome plus Carrier delivery | Terminal |
| `ConvertedToReturnRefund` | Exchange stopped and a whole-Order SL-001 handoff owns the remaining outcome | Customer choice plus atomic conversion handoff | Terminal within SL-002 |
| `Completed` | Every replacement and rejected-original return obligation was delivered | System reconciliation of all Shipment obligations | Terminal for this cycle |

### Per-Line/Unit Outcome Invariants

For every Exchange line at inspection finalization:

```text
RequestedQuantity > 0
ReceivedQuantity = RequestedQuantity
AcceptedSellableQuantity >= 0
AcceptedDamagedQuantity >= 0
RejectedQuantity >= 0
AcceptedSellableQuantity + AcceptedDamagedQuantity + RejectedQuantity = ReceivedQuantity
ReplacementQuantity = AcceptedSellableQuantity + AcceptedDamagedQuantity
```

Every value is an integer. Failure of any invariant commits no inspection, Inventory, reservation-release, or outbound authorization effect.

## 10. Component and Data Responsibility Design

| Component/data concept | Responsibility | Must not own |
|---|---|---|
| `ExchangeCase` | Order/Customer identity, case state, immutable deadlines, Staff decision, payer/rationale, terminal outcome | Refund amount, bank destination, payOS, per-unit Inventory details |
| `ExchangeLine` | Original Order line/SKU snapshot, purchased/requested quantities, accepted/rejected quantities | Arbitrary SKU/price selection or payout data |
| `ExchangeCycleLineage` | Original physical-unit identity and replacement-cycle chain | Permission or money decisions |
| `StockReservation` | Same-SKU reserved quantity, release/consume state, idempotency identity | Staff eligibility judgment or Warehouse inspection |
| `InspectionRecord` | Warehouse receipt, per-unit outcome, condition, reason/evidence, immutable correction history | Staff decision, shipping payer, financial data |
| `ExchangeShipment` | Direction (`CUSTOMER_TO_WAREHOUSE`, `REPLACEMENT_TO_CUSTOMER`, `REJECTED_ORIGINAL_TO_CUSTOMER`), Carrier, tracking, handoff/delivery/incident evidence | Eligibility, Inventory classification, money |
| `AfterSalesOrderLock` | One active Exchange or Return/Refund per Order and physical unit | Use-case-specific state machine |
| `AuditEvent` | Actor, action, before/after state, source, timestamp, correlation/idempotency reference | Mutable business truth |

The exact database and API representation is deliberately deferred to G3 and the implementation plan. The responsibility boundaries and invariants are normative.

## 11. UI Contract

### 11.1 Customer

- An eligible Delivered Order displays **Đổi/Trả hàng**.
- An expired Order keeps the action visible but disabled and displays the exact deadline.
- An Order with an active case displays **Xem yêu cầu đang xử lý** instead of allowing a second case.
- Selecting **Đổi hàng** shows only that Order's lines. Quantity-one lines use a checkbox; quantity-many lines use a bounded selector. No free-form quantity input exists.
- Form fields are limited to selected lines/quantities, free-text reason, evidence upload, and confirmation.
- No Refund amount, price difference, bank destination, payOS, or replacement-SKU selector appears.
- After submission, Customer sees decision/reason, payer, `ShipByAt`, tracking/handoff input, per-line Warehouse results, outbound tracking, delivery incident, and terminal outcome.
- On first submit, the button changes to **Đang gửi…** and is temporarily disabled.
- A repeated in-flight attempt displays **Yêu cầu đang được xử lý, vui lòng chờ.**
- A retry after the case already exists displays **Yêu cầu đổi hàng đã được ghi nhận** and a **Xem yêu cầu** action.

### 11.2 Staff/CSKH

- Exchange and Return/Refund queues are distinguishable and do not share financial controls.
- Exchange detail shows eligibility facts, Customer input, exact requested lines/quantities, stock-reservation availability, payer/rationale, inspection, Shipment, and incident evidence.
- Staff cannot edit Customer content, SKU, requested quantity, Warehouse inspection, or Carrier evidence source.
- Approval reports atomic stock failure rather than approving partially.
- Exchange screens have no field for Refund amount, bank account, payout, or payOS completion.

### 11.3 Warehouse

- Warehouse sees only approved inbound/inspection work and the minimum Order-line/evidence/Shipment data needed to handle goods.
- Per line, Warehouse records received, accepted-sellable, accepted-damaged, rejected, reason, and evidence values.
- Warehouse cannot edit Customer's original submission and sees only the minimum Customer evidence needed for inspection; it cannot see or edit financial/payout data, Staff eligibility decisions, or payer data.

## 12. Acceptance Examples

AT-001 through AT-018 are already reserved by SL-001 and are not reused.

| AT ID | Given / When / Then acceptance evidence | Classification |
|---|---|---|
| AT-019 | Given an owned Delivered Order and submission exactly at `ExchangeRequestDeadlineAt`, when Customer submits valid selected units, reason, and evidence, then exactly one `Submitted` Exchange is created; one millisecond later is rejected. | `approved-requirement` |
| AT-020 | Given a foreign, non-Delivered, expired, or already-locked Order, when Customer submits, then no Exchange, reservation, Shipment, or state change is created and a specific message is shown. | `approved-requirement` |
| AT-021 | Given an Order line purchased three times, when Customer selects two using the bounded control, then two same-SKU units are requested; zero, four, fractional, free-form, other-SKU, and other-Order values are rejected. | `approved-requirement` |
| AT-022 | Given missing reason/evidence or repeated submit/retry, when Customer acts, then missing input blocks submission; retries return one existing case, one reservation identity, and visible processing/already-recorded feedback. | `approved-requirement` |
| AT-023 | Given any active Exchange or Return/Refund for the Order or physical unit, when another after-sales request is attempted, then it is blocked and links to the active case. | `approved-requirement` |
| AT-024 | Given two concurrent approvals and stock sufficient for only one request, when both execute, then only one approval/reservation commits and Inventory never becomes negative or partially reserved. | `approved-requirement` |
| AT-025 | Given a Submitted request, when Staff approves or rejects, then a reason is mandatory; rejected creates no reservation/Inventory/Shipment/money effect; approved succeeds only with exact reservation. | `approved-requirement` |
| AT-026 | Given `ApprovedAwaitingShipment`, when Customer cancels before Carrier handoff, then status is `Cancelled`, all reservations release once, and a later retry has no extra effect; after handoff self-cancel is denied. | `approved-requirement` |
| AT-027 | Given no valid handoff at or before `ShipByAt`, when the deadline passes, then status is `Expired`, reservations release once, and a late proof cannot automatically revive it. | `approved-requirement` |
| AT-028 | Given every requested unit is received and accepted, when Warehouse finalizes, then exact sellable/damaged original stock movements commit, all accepted reservations remain, and replacement outbound becomes authorized. | `approved-requirement` |
| AT-029 | Given partial Warehouse acceptance, when finalization succeeds, then only accepted quantities enter stock and proceed to same-SKU replacement; rejected reservations release and rejected originals obtain return Shipments with reasons/evidence. | `approved-requirement` |
| AT-030 | Given all units rejected or any quantity/write invariant fails, when finalization runs, then all reservations release only for a valid all-rejected outcome; invalid/write-failure outcomes roll back completely and authorize no outbound replacement. | `approved-requirement` |
| AT-031 | Given a defect/Shop-error case or an approved preference case, when Staff records the decision, then Shop or Customer respectively pays both directions and the rationale is auditable. | `approved-requirement` |
| AT-032 | Given a replacement is lost/damaged before delivery, when the incident is reconciled, then the same case stays open, Shop bears the cost, no new Customer request/fee exists, and an exact same-SKU resend is traceable. | `approved-requirement` |
| AT-033 | Given no exact stock for resend, when Customer chooses wait or whole-Order Return/Refund, then no different SKU/partial refund occurs; conversion preserves the original timely instant and transfers money ownership to SL-001. | `approved-requirement` |
| AT-034 | Given accepted replacements are delivered but a rejected original return is still in transit, when completion evaluates, then the case remains open; it completes once every outbound obligation is delivered. | `approved-requirement` |
| AT-035 | Given Carrier confirms replacement delivery, when recorded, then `ReplacementDeliveredAt` is auditable and only that replacement's new five-day window starts; the original Order return deadline stays unchanged. | `approved-requirement` |
| AT-036 | Given a replacement unit is within its new window and has no active case, when Customer requests another exchange, then a new cycle requires reason/evidence/approval/inspection and retains full original-to-cycle lineage with no hard count limit. | `approved-requirement` |
| AT-037 | Given Customer, Staff, Warehouse, or Carrier attempts a forbidden direct action, when server authorization evaluates it, then the action is denied, no protected data/state changes, and an attributable audit record exists where appropriate. | `approved-requirement` |
| AT-038 | Given any Exchange form, record, command, or screen, when inspected, then it contains no Refund amount, bank destination, payOS/payout action, partial-refund action, arbitrary SKU, or price-difference input. | `approved-requirement` |
| AT-039 | Given Staff records Carrier delivery without integration or Customer disputes the timestamp, when reconciled, then tracking evidence, actor, source, original time, and dispute/correction history remain append-only. | `approved-requirement` |

## 13. Preliminary G3 Traceability Matrix

This table proves requirement coverage in the design. API names, code locations, automated test files, and observed red evidence remain `not-started` until G3/G4.

| Decision ID(s) | Requirement ID | Slice/use case | Interface | Implementation location | Acceptance test ID(s) | Evidence | Status |
|---|---|---|---|---|---|---|---|
| BD-012 | BR-003 | SL-002 / UC-EX-01 | Customer Order detail and Exchange submission | `not-started` | AT-019, AT-020 | Approved design | ready |
| BD-010, BD-011 | BR-004 | SL-002 / UC-EX-01 | Customer form; Staff decision | `not-started` | AT-019, AT-022, AT-025 | Approved design | ready |
| BD-009, BD-021 | BR-005 | SL-002 / UC-EX-01 | Shared after-sales guard | `not-started` | AT-023 | Approved design | ready |
| BD-013 | BR-006, BR-007 | SL-002 / UC-EX-01 | Customer line selector; server validation | `not-started` | AT-021, AT-038 | Approved design | ready |
| BD-014 | BR-008 | SL-002 / UC-EX-01 | Staff approval and Inventory reservation | `not-started` | AT-024, AT-025 | Approved design | ready |
| BD-016 | BR-009 | SL-002 / UC-EX-01 | Customer cancellation/handoff; expiry worker | `not-started` | AT-026, AT-027 | Approved design | ready |
| BD-010, BD-017 | BR-010 | SL-002 / UC-EX-01 | Warehouse inspection | `not-started` | AT-028, AT-029, AT-030 | Approved design | ready |
| BD-017, BD-022 | BR-011, BR-012 | SL-002 / UC-EX-01 | Inspection finalization; Inventory; outbound Shipment | `not-started` | AT-028, AT-029, AT-030 | Approved design | ready |
| BD-018 | BR-013 | SL-002 / UC-EX-01 | Staff decision; Customer status | `not-started` | AT-031 | Approved design | ready |
| BD-019, BD-023 | BR-014, BR-016 | SL-002 / UC-EX-01 | Carrier event or Staff evidence entry | `not-started` | AT-035, AT-039 | Approved design | ready |
| BD-020 | BR-015 | SL-002 / UC-EX-01 | Replacement lineage and new-cycle submission | `not-started` | AT-036 | Approved design | ready |
| BD-024, BD-025 | BR-017 | SL-002 / UC-EX-01 | Delivery incident and conversion handoff | `not-started` | AT-032, AT-033 | Approved design | ready; SL-001 dependency |
| BD-009, BD-025, BD-026 | BR-018 | SL-002 / UC-EX-01 | All Exchange actor surfaces | `not-started` | AT-038 | Approved design | ready |
| BD-027 | BR-019 | SL-002 / UC-EX-01 | Customer submit and command idempotency | `not-started` | AT-022 | Approved design | ready |
| BD-010, BD-026 | BR-020 | SL-002 / UC-EX-01 | Authorization and audit | `not-started` | AT-037, AT-039 | Approved design | ready |
| BD-028 | BR-021 | SL-002 / UC-EX-01 | Shipment reconciliation and completion | `not-started` | AT-034 | Approved design | ready |

## 14. Current Implementation Conflicts and Gaps

All entries below are `observed-behavior`, not approved requirements.

1. `client/src/App.jsx` exposes only Return/Refund Customer, Staff, and Warehouse routes; no separate Exchange route or lifecycle is present.
2. `server/src/models/returnRefundRequest.model.js` models `refundAmount`, while no dedicated Exchange case, line, cycle, reservation, inspection, or Shipment lineage model exists.
3. `client/src/pages/customer/OrderDetailPage.jsx` embeds the current Return/Refund form rather than the approved **Đổi/Trả hàng** choice and bounded Exchange selection.
4. `client/src/pages/staff/ReturnRefundDetailPage.jsx` lets Staff enter `refundAmount`; that observed behavior belongs to the disputed Return/Refund implementation and must never be copied into Exchange.
5. `server/src/services/returnRefund.service.js` accepts Staff-entered Refund amounts and has no approved Exchange reservation/inspection/outbound lifecycle.
6. `server/src/services/systemSetting.service.js` defaults `RETURN_WINDOW_DAYS` to 7, while SL-002 requires a fixed immutable five-day deadline snapshot for each delivered original/replacement unit.
7. `server/src/models/order.model.js` has `deliveredAt` but no immutable Exchange request deadline snapshot.
8. Current tests verify the combined Return/Refund contract and Staff Refund-amount input; none prove AT-019 through AT-039.
9. Google SRS revision SRC-011 does not yet contain BD-009 through BD-028, BR-003 through BR-021, UC-EX-01, the state model, or AT-019 through AT-039.

## 15. Dependencies and Ordered Roadmap

| Order | Slice/outcome | Dependencies | Business risk | Delivery owner | Business approver | Entry gate | Exit evidence |
|---|---|---|---|---|---|---|---|
| 1 | User reviews this written SL-002 spec | Approved conversational design | Mis-transcription or hidden contradiction | Requirements owner `unassigned` | Project Business Approver | G2 passed | Explicit written-spec approval |
| 2 | Reconcile Google SRS with approved SL-002 and finish required SL-001 conversion boundary | Written-spec approval; SL-001 BD-006 through BD-008 | Competing normative documents; incomplete conversion handoff | SRS owner `unassigned` | Project Business Approver | G2 passed | Stable SRS revision containing approved rules and recorded external dependency |
| 3 | Build full decision → requirement → interface/API → code → test matrix | Approved written SRS revision | Orphan code/test changes | Engineering owner `unassigned` | Project Business Approver | G3 ready | Complete G3 matrix with no planned orphan change |
| 4 | Write and observe failing AT-019 through AT-039 tests | G3 passed | Tests encoding old or invented policy | QA/engineering owner `unassigned` | Project Business Approver for business evidence | G4 | Expected red failures recorded |
| 5 | Implement minimal coherent Exchange slice | G4 red evidence | Inventory duplication, role breach, stale retries | Engineering owner `unassigned` | Project Business Approver | G5 | Focused and regression tests pass with atomic/idempotent evidence |
| 6 | Walk through Customer, Staff, Warehouse, Carrier, and denied-action scenarios | G5 passed | Handoff failure hidden by unit tests | Actor representatives `unassigned` | Project Business Approver | G6 | Actor acceptance of main, alternate, forbidden, and terminal paths |
| 7 | Release reconciliation | G6 passed | SRS/code/runtime drift | Release owner `unassigned` | Project Business Approver | G7 | SRS, traceability, tests, released behavior, and residual gaps agree |

## 16. Requirements-Engineering and Design Basis

This design applies the archived sources as method guidance only:

- Hassan Gomaa Chapter 6 Sections 6.3–6.6: actors are external roles; distinct useful outcomes are separate use cases; descriptions include preconditions, main sequence, alternatives, postconditions, and outstanding questions.
- SWR Chapter 9: business rules are external policy that drives software behavior and should trace to functional requirements.
- SWR Chapter 10: SRS content is a stakeholder agreement used by designers, developers, and testers.
- SWR Chapter 17: requirements must be complete, feasible, consistent, and verifiable; acceptance planning should begin with requirements.
- SWD Chapter 5: use cases, participating domain objects, state behavior, components, and interfaces must remain consistent across requirements, analysis, and design views.

GreenHouse policy in this document comes from the Project Business Approver through SRC-012, not from the archived course material or the current code.

## 17. Implementation Sequence After Written-Spec Approval

1. Reconcile the approved design into the Google SRS and close the explicit SL-001 conversion dependency.
2. Create the detailed G3 implementation plan and traceability matrix.
3. Write failing acceptance tests before behavior code.
4. Implement server-side authority, data model, state machine, atomic Inventory, Shipment, idempotency, and audit behavior.
5. Implement Customer, Staff, and Warehouse UI against the approved server contract.
6. Run focused, concurrency, authorization, regression, and actor-walkthrough verification.
7. Reconcile the released behavior back to the SRS and evidence dashboard.

No implementation step starts merely because this design file exists. The Project Business Approver must approve this written version first.
