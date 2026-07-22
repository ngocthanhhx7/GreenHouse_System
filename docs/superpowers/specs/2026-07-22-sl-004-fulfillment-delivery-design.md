# SL-004 Fulfillment and Delivery Design

**Date:** 2026-07-22

**Status:** Fast-track business package approved; implementation not started

**Business approver:** Project Business Approver (user in this Codex task)

**Implementation baseline:** `860e5200e944ed7d8a549686c656b8c3a0417af5`

**SRS baseline:** Google Docs revision `AIroW37xl-9inybbV_Kt8cUUhLWLjhfImasxQ_JiEqN2hcPklBhnb6W4yZNbueA2tCWVmMd5XfIbQTkiJLGM6ni-TNQx-hc6-YKXxEmQoPE`; Drive revision `4842`

## 1. Scope and Gate Status

`SL-004` begins after the approved `SL-003` confirmation transaction has changed an eligible Order to `Confirmed` and created exactly one initial StockExportRequest. It ends in one of two business outcomes:

1. the complete Order is exported, physically packed, handed to an external Carrier, and verifiably delivered; or
2. delivery cannot be completed and every remaining stock, shipment, payment, and refund obligation reaches a traceable `DeliveryFailed` resolution.

This package includes exact stock export, Staff packing, Carrier handoff, shipment evidence, delivery attempts, COD collection, delivery disputes, returned-to-shop receipt, loss/damage before delivery, same-Order resend, address correction, and terminal money/Inventory consequences.

The current release does not provide a Carrier login role, shipper-account management, route optimization, live location tracking, or a real-time delivery map. After a successful delivery, Return/Refund and Exchange are governed by `SL-001` and `SL-002`; `Returned` remains an after-sales Order state and is not reused for failed delivery.

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Next evidence |
|---|---|---|---|---|---|---|---|---|---|
| SL-004 | passed | passed | passed | ready | not-started | not-started | not-started | not-started | Reconcile the approved package to SRS, interfaces, code, tests, and release evidence |

No unresolved business decision remains inside the approved `SL-004` package.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-025 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Revisions in the document header | Candidate UC-ST-02/05/06, UC-WM-06, FR-ORD-12 through FR-ORD-19, FR-IWM-09 through FR-IWM-11, BR-ORD, BR-INV, notifications, and acceptance text | Candidate source only where adopted by the approved package | SRS contributors; Project Business Approver approves policy | Contains the success path but no Carrier actor, Shipment evidence, delivery-attempt, return-to-shop, loss/damage, address-version, or COD-discrepancy lifecycle; it also couples COD Paid to Delivered without preserving the physical-delivery exception |
| SRC-026 | Explicit fast-track approval, “duyệt gói SL004” | 2026-07-22 | BD-039 through BD-050 and this complete package | Normative business authority for SL-004 | Project Business Approver | Approver display name is not recorded |
| SRC-027 | Repository `D:\GreenHouse_System-main` | HEAD `860e5200e944ed7d8a549686c656b8c3a0417af5`; inspected 2026-07-22 | Current Order, Inventory, StockExportRequest, Staff/Warehouse UI, routes, services, models, and tests | `observed-behavior` only | Engineering team | Current confirmation/export split, Order states, export approval, automatic packing, manual COD, and absent Shipment evidence conflict with this design |
| SRC-028 | Archived SWR Chapter 17 and SWD Chapters 9–11 | Local archive accessed 2026-07-22 | Requirements completeness/consistency/acceptance validation and explicit state/event/guard modeling | Method guidance only | SWR/SWD archive | Does not decide GreenHouse policy |
| SRC-029 | Approved `SL-001`, `SL-002`, and `SL-003` designs | Approved 2026-07-22 | Five-day after-sales deadlines, external Carrier evidence, risk before delivery, secure fixed-amount refund, cancellation boundary, exact reservation, and atomic initial export-request handoff | Normative for referenced cross-slice rules | Project Business Approver | `SL-004` adds the original-order fulfillment states and delivery-failure outcome while preserving those boundaries |

## 3. Approved Business Decision Log

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Decision date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-039 | SL-004 | Is Carrier a managed GreenHouse role? | Fifth login role; full shipper management; external supporting actor | Carrier is external. Store carrier name, reference/tracking, and evidence only; provide no Carrier login, shipper management, or real-time location tracking | Preserve required delivery evidence without turning GreenHouse into a logistics platform | Project Business Approver | 2026-07-22 | BR-035 |
| BD-040 | SL-004 | Which entity owns each fulfillment state? | One large Order state machine; status text only; separate Order/export/shipment lifecycles | Separate Order, StockExportRequest, and Shipment lifecycles. Remove `StockExportRequested` from business Order state; use `DeliveryFailed` for terminal failed delivery and reserve `Returned` for after-sales completion | Prevent one status from mixing customer outcome, warehouse work, and carrier facts | Project Business Approver | 2026-07-22 | BR-036 |
| BD-041 | SL-004 | How does Warehouse process initial stock export? | Partial export; discretionary approve/reject; exact full export with retryable failure | Process the system-created request through `Pending -> Processing -> Completed/Failed/Cancelled`; export the complete Order atomically; create exactly one OUT transaction per Order line/SKU; never deduct twice | Keep physical stock, reservation, and transaction evidence aligned across multi-item Orders | Project Business Approver | 2026-07-22 | BR-037 |
| BD-042 | SL-004 | Who establishes Packed and with what evidence? | Warehouse auto-packs on export; Staff click without checks; Staff physical confirmation | Completed export leaves Order Confirmed. Staff verifies exact lines/quantities and records packing actor, time, and checklist before `Confirmed -> Packed`; discrepancy blocks packing; no customer Packed email | Separate Warehouse custody from Staff packing responsibility and prevent false packing | Project Business Approver | 2026-07-22 | BR-038 |
| BD-043 | SL-004 | What permits `Packed -> Shipped`? | Status-only click; live Carrier integration required; evidence-backed handoff | Require physical handoff plus carrier name, tracking/reference, handoff time, evidence, and recording actor. Customer sees the snapshot without live tracking | Make shipment start observable without requiring an unavailable logistics platform | Project Business Approver | 2026-07-22 | BR-039 |
| BD-044 | SL-004 | What proves delivery and starts after-sales deadlines? | Customer click; Staff assertion; Carrier/evidence with dispute history | Use Carrier-confirmed delivery when integrated; otherwise Staff records only tracking evidence. Preserve source, actor, event time, corrections, and disputes. Physical `DeliveredAt` starts the five-day windows; a correction never silently shortens a published Customer deadline | Anchor rights to external delivery evidence while protecting traceability and Customer reliance | Project Business Approver | 2026-07-22 | BR-040 |
| BD-045 | SL-004 | How is COD completed or represented when collection fails? | Manual Staff Paid button; always couple delivery/Paid; normal atomic path plus discrepancy | Normal full collection commits `Delivered + Paid` together using server-derived total and Carrier evidence. Staff cannot choose/enter a payment amount. Proven physical delivery without confirmed full collection becomes `Delivered + Unpaid` with an open CODDiscrepancy, never false Paid | Preserve both the physical fact and the money fact under abnormal Carrier behavior | Project Business Approver | 2026-07-22 | BR-041 |
| BD-046 | SL-004 | How are unsuccessful delivery attempts and return-to-shop handled? | Fixed retry count; immediate cancellation; append-only attempts with evidence-backed resolution | Each failed attempt is append-only and Order stays Shipped. No hard retry count. A returned parcel does not become DeliveryFailed until Warehouse confirms receipt and Staff chooses resend or terminal resolution | Avoid false terminal state while goods remain with Carrier and accommodate different Carrier retry policies | Project Business Approver | 2026-07-22 | BR-042 |
| BD-047 | SL-004 | Who bears loss/damage risk and how is resend modeled? | Customer creates new Order; Customer bears risk; Shop resolves in the same Order | Shop bears risk until successful delivery. Customer pays no new fee and creates no new Order/request. Customer chooses same-Order exact resend or terminal resolution; insufficient stock offers wait or full refund | Keep pre-delivery risk with the sender and preserve one traceable commercial Order | Project Business Approver | 2026-07-22 | BR-043 |
| BD-048 | SL-004 | How can delivery address change and who owns a wrong address? | Overwrite Order address; never correct; immutable Order plus versioned Shipment destination | Never overwrite the Order snapshot. Before handoff, Staff may create a Customer-confirmed Shipment destination version; after handoff, correction requires Carrier acceptance/evidence. Responsibility follows the exact causal snapshot or deviation, with no automatic Customer blame | Allow safe correction while preserving evidence needed to assign responsibility | Project Business Approver | 2026-07-22 | BR-044 |
| BD-049 | SL-004 | What stock and money outcome follows terminal delivery failure? | Cancel after Packed; arbitrary deduction; evidence-gated DeliveryFailed resolution | Returned goods require complete Warehouse receipt/classification before terminal resolution. Paid online Orders receive the exact full captured refund through the approved secure flow; uncollected COD becomes Payment Cancelled with no Refund. Verified irrecoverable loss/damage needs no impossible Warehouse receipt. `ShippingFee=0`, so no arbitrary deduction | Reconcile custody and money without violating the approved cancellation boundary or inventing a fee | Project Business Approver | 2026-07-22 | BR-045 |
| BD-050 | SL-004 | What feedback, audit, privacy, and retry rules apply? | Best-effort effects; generic errors; idempotent evidence-backed actions | Notify Confirmed/Shipped/failed-attempt/Delivered/DeliveryFailed/refund outcomes, not internal export or Packed. Commands are authorization-checked, atomic where grouped, idempotent, append-only where evidentiary, and return explicit existing-result feedback | Prevent duplicate stock/money/notification effects and make every handoff observable | Project Business Approver | 2026-07-22 | BR-046 |

## 4. Actor Responsibility Matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Customer | Receive one owned Order or obtain a complete delivery-failure resolution | View fulfillment; request address correction before handoff; dispute delivery evidence through Staff/support; choose resend or terminal resolution for verified loss/damage | Change Order/Shipment/Inventory/Payment state; confirm COD; edit Carrier evidence; create a replacement Order for the incident | No direct operational transition; supplies confirmed destination and incident choice | Own Order, Shipment summary, masked/evidence-safe status, address versions submitted for that Order, and own refund status | Address/incident choice to Staff; receives delivery/refund result | Foreign/stale input denied; after-handoff address change requires Carrier evidence; duplicate choice returns existing outcome |
| Staff / CSKH | Pack exact goods and coordinate evidence-backed delivery and incident resolution | Confirm packing; record handoff; record Carrier evidence; open/resolve delivery incident; create authorized destination version; coordinate fixed refund | Mutate stock directly; mark export Completed; fabricate Carrier/COD evidence; choose payment/refund amount; overwrite Customer/Carrier evidence | `Confirmed -> Packed`, `Packed -> Shipped`, evidence-backed `Shipped -> Delivered`, and authorized terminal `Shipped -> DeliveryFailed` | Operational Order, packing, Shipment, attempt, evidence, and authorized refund-verification data; no arbitrary Inventory quantity write | Exported goods from Warehouse; parcel/evidence to Carrier; returned parcel to Warehouse; refund readiness to approved payout flow | Discrepancy blocks packing; missing handoff evidence blocks Shipped; uncertain delivery/COD remains open; stale action rejected |
| Warehouse Manager | Preserve exact Inventory while exporting or receiving physical goods | Claim/process valid export; retry a failed export after reconciliation; receive and classify a returned parcel | Approve/reject the commercial Order; pack it; change delivery/payment/refund; view bank destination | StockExportRequest processing/completion/failure and atomic returned-parcel receipt outcome | Order lines, reservation, Inventory, stock transactions, returned parcel and condition evidence; no financial destination | Completed export to Staff; returned-parcel outcome to Staff/System resolution | Invalid reservation or partial write rolls back; missing returned line blocks final receipt; duplicate operation changes nothing |
| Carrier | Transport complete parcels, attempt delivery, collect COD, and provide evidence | External handoff/delivery/attempt/return/loss/damage facts through integration or evidence | Log in as a GreenHouse role; decide eligibility/refund; edit Order/Inventory/payment amount | External Shipment facts only; GreenHouse validates before internal transition | Minimum receiver/shipment data needed to deliver and exact expected COD amount | Evidence to System/Staff; returned parcel to Warehouse | Unknown/disputed evidence remains non-terminal or opens reconciliation; no evidence means no asserted success |
| payOS | Execute an authorized fixed payout for a Paid delivery-failure resolution | Process the already-approved refund command and return provider evidence | Decide delivery outcome, amount, destination, or Inventory result | Provider payout outcome only | Exact immutable amount/destination and provider evidence | Verified payout result to System/Staff | Processing/failure/unknown never means Refunded; manual fallback follows the approved shared workflow |
| Email Service | Deliver post-commit fulfillment notifications | Process queued email requests | Decide or roll back fulfillment, Inventory, Payment, or Refund state | None | Minimum recipient/template payload | Delivery result to retry/audit | Failure is recorded/retried without repeating the business event |
| GreenHouse System | Enforce guards, atomicity, idempotency, deadlines, and least privilege | Validate commands; calculate expected amounts/deadlines; create audit/notification records; detect stale state | Invent actor approval, Carrier success, COD collection, or Warehouse receipt | Mechanical transitions after valid actor action/evidence | Coordinates entity-specific state and role-specific views | Orchestrates all handoffs | Rolls back grouped writes, preserves independent achieved evidence, and returns the existing result for retries |
| Admin | Remain outside operational fulfillment | No SL-004 business command | Export, pack, ship, deliver, collect COD, inspect returned parcels, or decide incident refunds | None within SL-004 | No special fulfillment mutation scope | None | Unauthorized command is denied and does not change state |

## 5. Business Slice Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-004 | Staff, Warehouse, external Carrier, Customer, and System fulfill one complete Confirmed Order or close its delivery failure with correct stock and money | Exactly one initial StockExportRequest exists from approved Order confirmation | Order Confirmed; eligible payment; exact reservation; authorized actor; no conflicting terminal state | Execute UC-FUL-01 then UC-FUL-02 | Apply UC-FUL-03 and AF-004 branches without partial, duplicate, or false evidence | Full-Order export/shipment; one OUT per line/SKU; five-day deadline from physical delivery; expected COD/refund amount derived from Order total; ShippingFee 0 | Entity lifecycles remain separate; export is not packing; attempted delivery is not success; Returned is after-sales only; evidence is append-only | Actor matrix above | AT-059 through AT-074 | `approved-requirement` |

## 6. Normative Requirements

| Requirement ID | Approved requirement | Source |
|---|---|---|
| BR-035 | Carrier is an external supporting actor, not a GreenHouse account role. The current release stores carrier identity, tracking/reference, handoff/delivery/incident evidence, and timestamps but provides no shipper management, route optimization, live location tracking, or real-time map. | BD-039 |
| BR-036 | Order, StockExportRequest, Shipment, Payment, and CODDiscrepancy represent separate business facts. `StockExportRequested` is not a business Order state. Original fulfillment uses `Confirmed -> Packed -> Shipped -> Delivered` or terminal `DeliveryFailed`; `Returned` remains exclusive to completed after-sales return/refund. | BD-040 |
| BR-037 | Approved Order confirmation creates exactly one initial StockExportRequest. Warehouse shall process the complete Order through `Pending -> Processing -> Completed/Failed/Cancelled`, revalidate the exact reservation, atomically decrement StockQuantity and ReservedQuantity by every line, and create exactly one OUT InventoryTransaction per Order line/SKU. Failure commits no partial line and a retry cannot deduct again. A resend may create a separately identified request only for an authorized fulfillment cycle. | BD-041 |
| BR-038 | Completed stock export shall leave the Order Confirmed. Only Staff may change it to Packed after physically confirming every line and quantity and recording packing actor, time, and checklist. A discrepancy shall block Packed and open reconciliation. Packing shall not create a Customer email or Packed notification. | BD-042 |
| BR-039 | Staff shall change Packed to Shipped only after complete physical Carrier handoff and shall record carrier name, tracking/reference, handoff timestamp, evidence, Shipment/cycle identity, and recording actor. Customer may view the owned Shipment summary, but no live location is implied. | BD-043 |
| BR-040 | Delivery shall be established from integrated Carrier evidence when available or evidence-backed Staff recording otherwise. Source, original event time, recording actor/time, correction, and Customer dispute history shall be append-only. Physical DeliveredAt shall start immutable five-day Return/Refund and Exchange deadlines. An authorized correction creates a traceable version and shall not silently shorten a deadline already published to the Customer. | BD-044 |
| BR-041 | For normal COD delivery, verified full collection of the server-derived Order.TotalAmount and verified physical delivery shall atomically set Order to Delivered and Payment to Paid; no actor enters or chooses the amount. If physical delivery is proven without verified full collection, Order becomes Delivered, Payment remains Unpaid, and exactly one open CODDiscrepancy is created for reconciliation. No Staff-only click may establish Paid. | BD-045 |
| BR-042 | Every delivery attempt shall be append-only with Shipment, outcome, reason, source, actor, and event time. A failed attempt leaves Order Shipped and may be retried without a fixed GreenHouse attempt limit. Carrier return-to-shop changes Shipment custody only; terminal DeliveryFailed or resend cannot proceed until Warehouse confirms complete returned-parcel receipt, unless verified irrecoverable loss/damage makes receipt impossible. | BD-046 |
| BR-043 | Shop bears loss/damage risk until successful delivery. A verified incident creates no Customer fee, Order, or after-sales request. Customer chooses exact same-Order resend or terminal resolution. Resend creates a linked fulfillment cycle and consumes newly reserved/exported exact items only through BR-037. If exact stock is unavailable, Customer chooses wait or exact full refund. | BD-047 |
| BR-044 | Order delivery data remains an immutable checkout snapshot. Before Carrier handoff, Staff may create a new immutable ShipmentDestinationVersion only from authenticated Customer-confirmed input; after handoff, a version requires Carrier acceptance/evidence. No version overwrites history. Responsibility follows whether the exact Customer-confirmed version or a Staff/System/Carrier deviation caused failure; current ShippingFee 0 permits no arbitrary surcharge or deduction. | BD-048 |
| BR-045 | A returned-to-shop terminal resolution requires Warehouse to account for every Order line and atomically record sellable/damaged Inventory movements before Order becomes DeliveryFailed. A Paid online Order creates one fixed full refund for its accepted captured transaction through the approved secure destination/Payout/manual-evidence workflow and sets Order payment RefundPending until verified success. Uncollected COD becomes Payment Cancelled and creates no Refund. Verified irrecoverable loss/damage may create the same terminal money outcome without Warehouse receipt. | BD-049 |
| BR-046 | Export, packing, handoff, delivery, COD, attempt, incident, returned receipt, resend, DeliveryFailed, refund handoff, and notification commands shall enforce actor authorization, current-state guards, idempotency, concurrency safety, and attributable audit. Customer notifications are created for Confirmed, Shipped, failed-attempt/reschedule, Delivered, DeliveryFailed, and final refund outcomes, but not internal export or Packed. Notification failure shall not roll back committed business state; repeated commands return the existing result with explicit feedback. | BD-050 |

## 7. UC-FUL-01 — Export and Pack the Order

### Preconditions

1. Order is Confirmed and eligible under `SL-003`.
2. Exactly one initial Pending StockExportRequest exists.
3. The complete reservation for every Order line remains intact.
4. Warehouse Manager and Staff are authenticated for their separate actions.

### Main Flow

1. Warehouse Manager opens the Pending StockExportRequest and its complete Order lines.
2. System atomically claims the request as Processing and revalidates Order state, reservation, and request identity.
3. Warehouse Manager physically prepares the complete requested quantities.
4. In one transaction, System decreases StockQuantity and ReservedQuantity for every line, creates one OUT InventoryTransaction per line/SKU, and changes the request to Completed.
5. Order remains Confirmed; no Customer export notification is created.
6. Staff receives the completed-export work item and physically checks each Order line and quantity.
7. Staff records the packing checklist, actor, time, and optional note/evidence and confirms packing.
8. System changes Order from Confirmed to Packed, stores one PackingRecord/audit outcome, and creates no Customer Packed notification.

## 8. UC-FUL-02 — Ship and Deliver the Order

### Preconditions

1. Order is Packed with a valid PackingRecord.
2. One complete outbound parcel is ready for Carrier handoff.
3. Any Shipment destination version is Customer-confirmed and current.

### Main Flow

1. Staff physically hands the complete parcel to Carrier.
2. Staff records carrier name, tracking/reference, handoff timestamp, evidence, recording actor, and fulfillment-cycle identity.
3. System revalidates Packed state, creates the Shipment evidence, changes Order to Shipped once, audits, and queues the Shipped notification.
4. Carrier performs one or more delivery attempts; each observed attempt is recorded without overwriting earlier facts.
5. Carrier supplies successful physical-delivery evidence and event time, directly or through evidence-backed Staff entry.
6. For online Paid Orders, System changes Shipped to Delivered and stores DeliveredAt.
7. For normal COD, the same verified outcome proves full collection of the server-derived total; System changes Shipped to Delivered and Payment Unpaid to Paid atomically.
8. System snapshots the five-day Return/Refund and Exchange deadlines from physical DeliveredAt, audits the transition, and queues the Delivered notification.

## 9. UC-FUL-03 — Resolve Delivery Failure

### Failed Attempt and Retry

1. Carrier reports an unsuccessful attempt with time, reason, and evidence.
2. System appends the attempt and keeps Order Shipped.
3. Staff records the next Carrier/reschedule action when applicable; System notifies Customer.
4. A later successful attempt returns to UC-FUL-02 without creating a new Order.

### Returned-to-Shop Parcel

1. Carrier records return-to-shop and transfers physical custody to Warehouse.
2. Order remains Shipped until Warehouse accounts for every original Order line.
3. Warehouse records complete received, sellable, and damaged quantities; grouped Inventory movements commit atomically.
4. Staff selects an evidence-supported resend or terminal outcome.
5. Resend creates a linked fulfillment cycle, exact reservation/export, PackingRecord, and new Shipment while preserving all prior evidence.
6. Terminal outcome changes Order to DeliveryFailed; Paid online money enters the fixed full-refund workflow, while uncollected COD becomes Cancelled with no Refund.

### Lost or Damaged Before Delivery

1. Carrier/Staff records verified loss/damage evidence and System opens the delivery incident.
2. Customer chooses exact same-Order resend or terminal resolution and pays no fee.
3. For resend, System creates a linked cycle only after exact stock is reserved; if unavailable, Customer chooses wait or full refund.
4. For terminal resolution, irrecoverable incident evidence substitutes for impossible Warehouse receipt; System changes Order to DeliveryFailed and applies the same payment rules.

## 10. Alternative and Failure Paths

| Branch | Condition | Required outcome |
|---|---|---|
| AF-004-01 | Actor is unauthorized or attempts another actor's transition/data write | Deny the action; change no protected state; create attributable security/audit evidence where appropriate |
| AF-004-02 | Initial export request is missing, duplicated, stale, or belongs to a non-Confirmed Order | Reject processing; deduct no stock; open reconciliation for the invalid handoff |
| AF-004-03 | Reservation or physical stock is incomplete | Move/retain request as Failed according to the claimed state; keep Order Confirmed; commit no partial OUT transaction |
| AF-004-04 | Any line or write fails during export | Roll back all Inventory, transaction, and request effects; retry cannot observe a partial export |
| AF-004-05 | Duplicate export command after Completed | Return the existing Completed result and perform no additional deduction or transaction |
| AF-004-06 | Staff packing finds a wrong or missing line/quantity | Keep Order Confirmed; record discrepancy; do not create PackingRecord/Packed/customer notification |
| AF-004-07 | Staff attempts Shipped without complete handoff evidence | Keep Order Packed and identify missing carrier/reference/time/evidence fields |
| AF-004-08 | Address correction lacks authenticated Customer confirmation or occurs after handoff without Carrier acceptance | Preserve current destination version and reject the mutation |
| AF-004-09 | Carrier attempt fails but parcel remains in Carrier custody | Append failure; keep Order Shipped; allow evidence-backed retry/reschedule |
| AF-004-10 | Carrier says returned but Warehouse has not received/accounted for the parcel | Keep Shipment return evidence and Order Shipped; do not restock, resend, Refund, or set DeliveryFailed |
| AF-004-11 | Returned parcel receipt omits a line or has invalid quantity/classification | Roll back all receipt/Inventory/terminal effects and retain the Warehouse work item |
| AF-004-12 | Online Paid Order reaches terminal returned-to-shop resolution | After atomic receipt, set DeliveryFailed and RefundPending and create exactly one exact full-refund handoff |
| AF-004-13 | COD Order reaches terminal returned-to-shop resolution without collection | After atomic receipt, set DeliveryFailed and Payment Cancelled; create no Refund |
| AF-004-14 | Shipment is verified lost/damaged before delivery | Open one incident; Shop bears risk; Customer chooses same-Order resend or terminal resolution without fee or new Order |
| AF-004-15 | Exact stock for resend is unavailable | Create no partial/different-product resend; retain wait choice or create exact full-refund terminal outcome |
| AF-004-16 | Physical COD delivery is proven but full collection is not | Set Delivered/DeliveredAt and five-day deadlines, leave Payment Unpaid, create one CODDiscrepancy, and never assert Paid |
| AF-004-17 | Customer disputes delivery time or evidence | Preserve original evidence; open reconciliation; append correction/result; never silently shorten a published deadline |
| AF-004-18 | Notification delivery fails or a command is repeated | Keep the committed business outcome; retry notification or return the existing result without repeating stock, money, state, audit-event identity, or notification effects |

## 11. State Models

### 11.1 Order Fulfillment State Table

| Current Order state | Trigger/evidence | Guard and side effects | Next Order state |
|---|---|---|---|
| Confirmed | Warehouse completes export | Exact full export commits; Order state does not change | Confirmed |
| Confirmed | Staff confirms physical packing | Export Completed; exact checklist and packing evidence recorded | Packed |
| Packed | Staff records physical Carrier handoff | Complete Shipment evidence exists | Shipped |
| Shipped | Carrier attempt fails | Append attempt; no terminal effect | Shipped |
| Shipped | Carrier returns parcel | Append custody event; wait for Warehouse and resolution | Shipped |
| Shipped | Staff/System authorizes resend | Prior incident/receipt valid; new fulfillment cycle begins | Shipped |
| Shipped | Verified successful delivery | Record DeliveredAt/deadlines; apply COD rule when relevant | Delivered |
| Shipped | Terminal returned/lost/damaged resolution | Required Warehouse or irrecoverable-incident evidence exists; payment consequence created | DeliveryFailed |
| Delivered | After-sales action | Governed exclusively by SL-001/SL-002 | Delivered or Returned under those slices |

### 11.2 StockExportRequest State Table

| Current state | Trigger | Guard/side effects | Next state |
|---|---|---|---|
| Pending | Warehouse starts | Order Confirmed; exact reservation intact; claim once | Processing |
| Processing | Full export succeeds | All lines and OUT transactions commit atomically | Completed |
| Processing | Revalidation or grouped write fails | Commit no partial stock consumption; retain failure evidence | Failed |
| Failed | Warehouse retries after reconciliation | Exact reservation/stock and Order state revalidated | Processing |
| Pending or Failed | Eligible pre-export cancellation | Request cancellation and reservation consequence commit under SL-003 | Cancelled |
| Completed | Duplicate export/retry | Return existing result; no transition or deduction | Completed |

### 11.3 Shipment and Attempt State Table

| Shipment state/event | Meaning | Permitted next outcome |
|---|---|---|
| Prepared | Packed parcel exists but Carrier has no custody | HandedOff |
| HandedOff | Carrier has custody and Order is Shipped | AttemptFailed, Delivered, ReturnedToShop, Lost, Damaged |
| AttemptFailed | Append-only event; Shipment remains active | Another attempt, Delivered, ReturnedToShop, Lost, Damaged |
| Delivered | Physical delivery evidence is final subject to append-only dispute/correction | Terminal for that Shipment |
| ReturnedToShop | Carrier transferred custody back; Warehouse receipt still required | Resend cycle or DeliveryFailed resolution |
| Lost or Damaged | Carrier incident evidence exists | Resend cycle or DeliveryFailed resolution |

A resend creates a new Shipment and fulfillment-cycle identity; it never rewrites or reopens the previous Shipment.

## 12. State and Data Invariants

1. Approved confirmation creates exactly one initial StockExportRequest; a resend request is separately identified by fulfillment cycle and cannot impersonate the initial request.
2. OrderStatus never uses `StockExportRequested`; StockExportRequest state never substitutes for Order state.
3. Initial fulfillment and every resend are whole-Order, exact-SKU/quantity cycles in the current release; partial shipment is not supported.
4. One successful export cycle creates exactly one OUT InventoryTransaction per Order line/SKU and consumes that cycle's reservation once.
5. Completed export is not Packed; only Staff packing evidence establishes Packed.
6. Failed attempt is not Delivered, returned-to-shop is not Warehouse receipt, and Carrier evidence is not an Inventory mutation.
7. `Returned` means completed after-sales return/refund only; failed original delivery uses `DeliveryFailed`.
8. Payment state expresses money evidence independently from physical delivery. Normal COD finishes both together; proven delivery without collection is represented explicitly, never hidden as Shipped or Paid.
9. Expected COD and refund amounts are server-derived from the immutable Order total; no Customer, Staff, Warehouse, or Carrier chooses them.
10. Order address, every Shipment destination version, Carrier event, attempt, correction, dispute, packing record, Inventory movement, CODDiscrepancy, and refund attempt is attributable and history-preserving.
11. At most one active operational action owns a StockExportRequest/Shipment command identity; retries return the existing result.
12. A notification result never controls or rolls back fulfillment, Inventory, Payment, or Refund state.

## 13. UI Contract

### Customer

- Order detail shows Order and Payment states separately, plus carrier name, tracking/reference, manually recorded delivery events, incident/resend outcome, and exact five-day deadlines when Delivered.
- The UI makes clear that GreenHouse does not provide a live Carrier map.
- Address correction is requested through Staff/CSKH and displays the confirmed current destination version without erasing the checkout snapshot.
- A failed attempt displays its reason/time and retry or reschedule status.
- A verified loss/damage case offers only exact same-Order resend, wait when stock is unavailable, or exact full terminal refund when eligible; it creates no new Order, fee, partial refund, or different-SKU choice.

### Staff / CSKH

- Packing is available only for Confirmed plus Completed export and requires exact line checklist confirmation.
- Shipped is available only for Packed and requires carrier, tracking/reference, handoff time, and evidence.
- Delivery/COD screens show server-derived expected total and accept evidence/status actions, not an editable payment amount.
- A physically delivered COD exception creates CODDiscrepancy rather than exposing a generic **Đã thu COD** button.
- Incident screens preserve prior attempts, Carrier evidence, Customer choice, address versions, returned-parcel state, resend cycles, and refund status.

### Warehouse

- Export work shows exact Order lines, StockQuantity, ReservedQuantity, request/cycle identity, and valid next action.
- Warehouse does not see packing, delivery-state, COD, refund-destination, or payout controls.
- Returned-to-shop receipt requires every Order line and complete sellable/damaged accounting before one atomic confirmation.

### Shared Feedback

- An action is disabled while its request is processing.
- Repeated actions display **đang xử lý** or **đã được ghi nhận** and return the existing result.
- Stale/forbidden actions display current state and permitted next action without implying success.

## 14. Acceptance Examples

| AT ID | Given / When / Then evidence | Classification |
|---|---|---|
| AT-059 | Given one valid initial Pending StockExportRequest for a Confirmed Order, when Warehouse exports the complete Order, then one atomic commit consumes exact StockQuantity/ReservedQuantity, creates one OUT transaction per line/SKU, sets Completed, and leaves Order Confirmed. | `approved-requirement` |
| AT-060 | Given a Completed export, when the same or concurrent export command repeats, then the existing Completed result is returned and no quantity or transaction repeats. | `approved-requirement` |
| AT-061 | Given missing reservation, insufficient stock, stale Order, invalid request, or any injected line/write failure, when export runs, then no partial Inventory/transaction/request completion remains and Order stays Confirmed. | `approved-requirement` |
| AT-062 | Given Completed export and exact physical packing, when Staff confirms every line, then one PackingRecord and Packed transition are audited with no Customer email; missing/mismatched lines or Warehouse export alone cannot create Packed. | `approved-requirement` |
| AT-063 | Given a Packed Order, when Staff records complete physical handoff evidence, then one Shipment and Shipped transition occur; missing carrier/reference/time/evidence changes nothing. | `approved-requirement` |
| AT-064 | Given integrated Carrier proof or evidence-backed Staff recording of physical delivery, when accepted, then DeliveredAt/source/actor/history and both five-day deadlines are recorded; a dispute/correction remains append-only and never silently shortens a published deadline. | `approved-requirement` |
| AT-065 | Given COD with verified physical delivery and verified full collection, when processed, then Delivered and Paid plus timestamps/deadlines commit atomically using server-derived total; no editable amount or separate Staff Paid action exists. | `approved-requirement` |
| AT-066 | Given physical COD delivery is proven but full collection is not, when recorded, then Order is Delivered, Payment remains Unpaid, exactly one CODDiscrepancy opens, and no false Paid evidence exists. | `approved-requirement` |
| AT-067 | Given one or more unsuccessful Carrier attempts while the parcel remains in custody, when recorded or retried, then every attempt remains append-only, Order stays Shipped, and Customer receives accurate attempt/reschedule feedback. | `approved-requirement` |
| AT-068 | Given Carrier return-to-shop, when Warehouse has not accounted for every line, then no restock/resend/DeliveryFailed/payment/refund effect occurs; complete valid receipt commits exact sellable/damaged movements once. | `approved-requirement` |
| AT-069 | Given complete returned-parcel receipt and terminal resolution, when finalized, then online Paid creates one exact full RefundPending handoff while uncollected COD becomes Cancelled with no Refund; ShippingFee 0 produces no deduction. | `approved-requirement` |
| AT-070 | Given verified pre-delivery loss/damage and Customer chooses resend, when exact stock is available, then no new Order/fee/request is created and one linked exact reservation/export/packing/Shipment cycle is traceable. | `approved-requirement` |
| AT-071 | Given verified irrecoverable loss/damage and Customer chooses terminal resolution or resend stock is unavailable, when full refund is selected, then DeliveryFailed and the exact full refund handoff occur without impossible Warehouse receipt, partial refund, or different-SKU substitution. | `approved-requirement` |
| AT-072 | Given an address correction, when accepted before handoff or by Carrier after handoff, then one immutable destination version with Customer/Carrier evidence is added and prior versions remain; invalid correction is rejected and responsibility follows the evidenced cause. | `approved-requirement` |
| AT-073 | Given Customer, Staff, Warehouse, Carrier, or Admin attempts a forbidden action or data access, when authorization evaluates it, then the command/data is denied and no protected state changes. | `approved-requirement` |
| AT-074 | Given repeated fulfillment/incident/refund commands or notification failure, when handled, then each business effect occurs at most once, existing outcome is shown clearly, and committed state remains correct while notification retries independently. | `approved-requirement` |

## 15. Preliminary G3 Traceability

| Decision ID | Requirement ID | Slice/use case | Interface or API | Implementation location | Acceptance test ID | Evidence | Status |
|---|---|---|---|---|---|---|---|
| BD-039, BD-040 | BR-035, BR-036 | SL-004 state/scope contract | Order detail, fulfillment entities | `server/src/models/order.model.js`; no Shipment model exists | AT-063, AT-064, AT-073 | Current Order mixes export state and has no Carrier/Shipment lifecycle | ready |
| BD-041 | BR-037 | UC-FUL-01 export | Warehouse export routes/pages | `server/src/services/inventory.service.js`; `stockExportRequest.model.js`; Warehouse pages | AT-059 through AT-061 | Current workflow uses Approved/Rejected/Exported and auto-packing | ready |
| BD-042 | BR-038 | UC-FUL-01 packing | Staff packing action/page | `server/src/services/inventory.service.js`; `staffOrder.service.js`; Staff Order detail | AT-062 | No separate PackingRecord; Warehouse export establishes Packed | ready |
| BD-043, BD-044 | BR-039, BR-040 | UC-FUL-02 shipment/delivery | Staff shipment/delivery action; Customer tracking summary | `server/src/services/staffOrder.service.js`; Order/Customer pages; no Shipment/evidence model | AT-063, AT-064 | Status-only actions have no carrier/reference/evidence/deadline version | ready |
| BD-045 | BR-041 | UC-FUL-02 COD | Delivery/COD evidence and reconciliation | `staffOrder.service.js` and Staff Order detail expose manual COD collection | AT-065, AT-066 | Current COD may become Paid before delivery and has no discrepancy | ready |
| BD-046 | BR-042 | UC-FUL-03 attempt/return | Attempt, reschedule, returned custody, Warehouse receipt | No delivery-attempt/returned-shipment implementation exists | AT-067, AT-068 | Candidate SRS and code model only the happy path | ready |
| BD-047 | BR-043 | UC-FUL-03 loss/damage/resend | Customer incident choice; fulfillment-cycle orchestration | No original-order delivery-incident or resend cycle exists | AT-070, AT-071 | Existing Order/export models cannot preserve multiple linked cycles | ready |
| BD-048 | BR-044 | Address correction | Customer/Staff destination version interface | `order.model.js` stores one address string; no destination-version model exists | AT-072 | Overwrite-safe correction and causation evidence are absent | ready |
| BD-049 | BR-045 | UC-FUL-03 terminal resolution | Warehouse receipt, DeliveryFailed, Refund handoff | Inventory/return/refund services have no failed-delivery join | AT-068, AT-069, AT-071 | Current cancellation cannot be reused after Packed and no DeliveryFailed state exists | ready |
| BD-050 | BR-046 | All SL-004 actor interfaces | Authorization, idempotency, audit, notification outbox | Current services/pages contain partial state guards and notification behavior | AT-073, AT-074 | No end-to-end idempotent fulfillment evidence contract exists | ready |

## 16. Confirmed Current Conflicts

The following are `observed-behavior`, not approved policy:

1. `staffOrder.service.js` confirms an Order without atomically creating the initial StockExportRequest; a separate action later changes Order to `StockExportRequested`.
2. `order.model.js` includes `StockExportRequested` and lacks `DeliveryFailed`, immutable after-sales deadline snapshots, and distinct fulfillment evidence.
3. `stockExportRequest.model.js` and Warehouse UI use `Pending -> Approved/Rejected -> Processing -> Exported`, treating Warehouse as a commercial approver instead of exact fulfillment processor.
4. `inventory.service.js` marks Order Packed automatically inside the export transaction, assigns packing responsibility to Warehouse, and records no Staff PackingRecord/checklist.
5. Current successful export sends a Customer “đã xuất kho” notification, while approved policy sends no internal export or Packed notification.
6. Staff can change Packed to Shipped without carrier, tracking/reference, handoff time, or evidence and can change Shipped to Delivered without authoritative delivery evidence.
7. Staff can invoke a separate **Đã thu COD** action while Order is Packed or Shipped; the service sets Paid from Staff assertion before delivery and stores no CODDiscrepancy.
8. No Shipment, DeliveryAttempt, ShipmentDestinationVersion, Carrier evidence, delivery dispute/correction, fulfillment cycle, return-to-shop custody, or original-delivery incident model exists.
9. No flow joins returned-to-shop Warehouse receipt with same-Order resend or evidence-gated `DeliveryFailed` money resolution.
10. Existing tests protect several conflicting behaviors, including automatic Packed after export and manual pre-delivery COD, so passing tests are not proof of approved business correctness.

These conflicts will become exact G3 rows and G4 red acceptance evidence only after the full business baseline is closed.

## 17. Method Basis and Next Phase

Archived SWR guidance requires requirements to be complete, consistent, feasible, and verifiable and recommends acceptance criteria during requirements development. Archived SWD guidance treats states, events, guards, and transition actions as distinct control facts and requires alternate scenarios to be modeled. GreenHouse policy in this document comes only from SRC-026 and the approved cross-slice decisions, not from the method sources or current implementation.

No implementation plan or code change is authorized by this document alone. The project will continue through the remaining core business packages, then perform one cross-system consistency audit before freezing and updating the Google SRS baseline.
