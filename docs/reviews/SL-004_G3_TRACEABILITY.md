# SL-004 Fulfillment and Delivery — Exact G3 Traceability

Date: 2026-07-24

Implementation owner: Nguyễn Hữu Anh Nhật

Warehouse seam owner: Lê Vũ Cường

Status: `READY_FOR_INDEPENDENT_REVIEW` (local implementation evidence only)

Normative sources:

- `docs/superpowers/specs/2026-07-22-sl-004-fulfillment-delivery-design.md`
- `docs/superpowers/specs/2026-07-23-cr-001-cross-slice-business-closure-v2.md`
- `docs/reviews/SL-003_HANDOFF.md`
- `docs/reviews/SL-003_G3_TRACEABILITY.md`
- `docs/reviews/SL-005_HANDOFF.md`
- `docs/reviews/SL-005_G3_TRACEABILITY.md`

The member plans are ownership/history evidence only. Where they describe Warehouse approval, automatic packing, a Staff-entered COD result, or an editable refund amount, the approved SL-004 and CR-001 packages supersede them.

## 1. Current gap map

| G3 gap | Observed at `a3fbbce` | Approved target | Exact change/test evidence |
|---|---|---|---|
| Initial export handoff | `staffOrderService.confirmOrder` already atomically creates one initial `Pending` request; the legacy `/staff/orders/:id/stock-export` path can create a second handoff and moves Order to `StockExportRequested` | Preserve the SL-003 atomic confirmation seam; retire the separate Staff request command | Rewrite `requestStockExport` as read/replay-only compatibility behavior or remove its UI; AT-059/060/073 |
| Order lifecycle | `order.model.js` still permits `StockExportRequested` and lacks `DeliveryFailed` | `Confirmed -> Packed -> Shipped -> Delivered/DeliveryFailed`; `Returned` remains after-sales only | Order model/migration/state-machine tests; AT-062..074 |
| Export lifecycle | Request states are `Pending/Approved/Processing/Exported/Rejected/Cancelled`; Warehouse acts as commercial approver | `Pending/Failed -> Processing -> Completed/Failed`, whole-Order exact export; initial/resend cycle identity | `stockExportRequest.model.js`, `inventory.service.js`, migration; AT-059..061/070/074 |
| Inventory authority | Export consumes exact SL-003 reservation lineage and already blocks `ReconciliationRequired`, but it auto-Packs and has no per-line movement identity | Keep the lineage/health guard; one idempotent OUT movement per order line; leave Order Confirmed | Export service and unique movement keys; AT-059..061/074 |
| Packing | Export sets Order `Packed`; no Staff checklist/actor/evidence/discrepancy record | Only Staff may create an exact packing result after Completed export; mismatch opens reconciliation and leaves Confirmed | `PackingRecord`, Staff API/UI; AT-062/073/074 |
| Carrier handoff | Generic status patch can move Packed to Shipped without evidence | Complete carrier/reference/handoff/evidence/destination snapshot creates one Shipment and Shipped | `Shipment`, `ShipmentDestinationVersion`, Staff API/UI; AT-063/072..074 |
| Delivery proof/deadlines | Generic status patch can create Delivered and deadlines from Staff clock without carrier evidence/history | Append-only attributable event supplies physical `DeliveredAt`; correction/dispute never overwrites history or shortens a published deadline | `ShipmentEvent`, delivery API; AT-064/073/074 |
| COD delivery | Existing COD service correctly separates collection and settlement, but physical delivery is not joined atomically to normal full collection and an exception is not owned by a Shipment event | Delivery command derives fixed expected amount, atomically records normal full collection or opens exactly one discrepancy; later collection/settlement stays on existing CR seam | Fulfillment + `codReconciliation.service.js`; AT-065/066, CR AT-205..208/223..226 |
| Attempts/reschedule | No original-order delivery-attempt model | Every failed attempt/reschedule is append-only; Order stays Shipped; durable Customer notification once | `ShipmentEvent`, outbox handler/UI; AT-067/074, CR AT-220 |
| Return-to-shop | Carrier return evidence is not joined to Warehouse classified receipt; current COD recovery receipt has no Inventory movements | Carrier custody event alone has no stock/terminal effect; complete Warehouse classification commits sellable/damaged movements once | `ReturnedParcelReceipt`, Inventory transactions, Warehouse API/UI; AT-068/069/073/074 |
| Loss/damage/resend | No original-order incident or linked fulfillment cycle | Same Order, no fee/new Order, exact whole-Order linked resend cycle; wait/refund when stock unavailable | `DeliveryIncident`, `FulfillmentCycle`, reservation/export seam; AT-070/071/073/074 |
| Address correction | Order has one mutable checkout address and no Shipment destination history | Immutable checkout snapshot plus immutable destination versions; Customer confirmation before handoff, Carrier acceptance after handoff | destination model/API/Staff+Customer UI; AT-072..074 |
| Failed-delivery money | No `DeliveryFailed` join to receipt/irrecoverable incident and independent Refund obligation | Paid primary collection remains Paid; exact full `FAILED_DELIVERY` obligation; uncollected COD becomes Cancelled without Refund | terminal-resolution transaction; AT-069/071/074, CR AT-215..217 |
| Durable side effects | Inventory export uses best-effort direct notification and sends forbidden export notification | Business transaction enqueues stable `DomainOutbox` identities; export/Packed enqueue nothing; notification failure cannot roll back business state | fulfillment repository/outbox handler; AT-062/067/069/074, CR AT-220 |
| Actor UI | Warehouse UI shows approve/reject and export; Staff UI exposes generic status buttons; Customer detail has no fulfillment projection | Role-specific commands and projections only; pending locks, field errors, replay feedback | Staff/Warehouse/Customer pages and service contracts; AT-062..074 |

## 2. Actor and authorization map

| Actor | Allowed command/read | Explicitly forbidden | Route contract |
|---|---|---|---|
| Customer | Read own fulfillment projection; submit authenticated destination correction request; choose resend/wait/terminal outcome for an owned verified incident | Operational state mutation, carrier/COD evidence editing, Inventory mutation, refund amount choice | `GET /api/orders/:id/fulfillment`; `POST /api/orders/:id/destination-corrections`; `POST /api/orders/:id/delivery-incidents/:incidentId/choice` |
| Staff | Confirm exact packing; record carrier handoff; record evidence-backed attempt/delivery/return/loss/damage/correction/dispute; authorize terminal resolution | Export completion, Inventory classification, arbitrary COD/payment/refund amount, editing prior evidence | `/api/staff/orders/:id/packing`; `/api/staff/orders/:id/shipments`; `/api/staff/shipments/:shipmentId/events`; `/api/staff/orders/:id/destination-versions`; `/api/staff/orders/:id/delivery-resolution` |
| WarehouseManager | Read/process exact export; receive/classify complete returned parcel | Packing, delivery/COD/payment/refund/destination mutation; bank data | `GET /api/warehouse/stock-exports[/:id]`; `POST /api/warehouse/stock-exports/:id/process`; `GET /api/warehouse/returned-parcels[/:shipmentId]`; `POST /api/warehouse/shipments/:shipmentId/returned-receipt` |
| Carrier | Supply objective event evidence through the existing signed-integration boundary only | GreenHouse login/role, business eligibility/refund/stock decisions | `POST /api/carrier/shipments/:shipmentId/events` behind `carrierSignature`; existing separate COD collection/settlement signed routes remain authoritative |
| Admin | No SL-004 operational command or full sensitive projection | Export, pack, ship, deliver, receive returned goods, resolve incident | Every SL-004 operational route has exact Staff/Warehouse/Customer role middleware; no Admin route |
| System | Validate/derive fixed amounts and deadlines, make grouped transitions, enqueue durable events | Invent actor evidence or use notification/report state as command authority | Service/repository transaction boundaries below |

No `Carrier` account role, login, sidebar, route guard, migration value, or user record is introduced.

## 3. Exact state/event/guard map

| Entity/current state | Command/event | Guard | Atomic result | Failure result |
|---|---|---|---|---|
| Order `Confirmed`; export `Pending/Failed` | Warehouse process export | Exact Completed-confirmation handoff, whole reservation lineage, Inventory `Normal`, sellable/reserved quantities sufficient, stable command key | Export `Processing -> Completed`; consume each reservation once; decrement sellable/reserved per line; one OUT transaction per line; Order remains `Confirmed` | No partial stock/line movement; claimed request becomes `Failed` with attributable failure code, or remains owned `Processing` only for recoverable interrupted command |
| Export `Completed`; Order `Confirmed` | Staff confirm packing | Exact checklist equals every Order line/quantity; active cycle; no completed packing | One `PackingRecord=Completed`; Order `Packed`; no Customer event | `PackingRecord=Discrepancy`, reconciliation reason; Order remains Confirmed |
| Order `Packed` | Staff carrier handoff | Completed packing; carrier/reference/handoff time/evidence/current destination; stable command key | One Shipment `HandedOff`; append handoff event; Order `Shipped`; durable `ORDER_SHIPPED` outbox | Missing/stale facts change nothing and return field-specific errors |
| Shipment `HandedOff/AttemptFailed` | Failed attempt/reschedule | Evidence/source/event time/reason; unique event key | Append event; Shipment remains active; Order remains Shipped; durable attempt/reschedule event | Duplicate returns existing event; conflicting reuse denied |
| Shipment active; Order `Shipped` | Physical delivery evidence | Carrier-signed event or attributable Staff evidence; immutable physical time | Append delivery event; Shipment `Delivered`; Order `Delivered`; immutable five-day snapshots; durable Delivered event | Correction/dispute appends a new event; published deadline is never shortened |
| COD delivery | Delivery + full collection evidence | `CustomerCollectedAmount = server Order.TotalAmount`; no actor amount choice/split field | Delivery, Payment/Attempt Paid, evidenced PaidAt/CompletedSaleAt and deadlines commit together | Delivery without conclusive full collection commits `Delivered + Unpaid + one Open discrepancy`; settlement mismatch is independent |
| Shipment active | `RETURNED_TO_SHOP` | Carrier evidence only | Append custody event; Shipment `ReturnedToShop`; Order stays Shipped | No Inventory, resend, DeliveryFailed, Payment, or Refund effect |
| Shipment `ReturnedToShop` | Warehouse returned receipt | Every Order line exactly once; `received = sellable + damaged`; stable receipt key; Inventory Normal for affected sellable posting | One receipt; exact sellable/damaged movements once | Any missing/invalid line rolls back all receipt/Inventory effects |
| Shipment active | `LOST/DAMAGED` | Attributable incident evidence | Append event; one open incident; Order stays Shipped until Customer choice | Duplicate returns existing incident |
| Incident/receipt ready | Customer resend choice | Owned incident; exact whole-Order stock can be reserved; no active new cycle | Same Order; new linked cycle/request/reservation; no new fee/Order/different SKU | Unavailable stock records wait choice or permits terminal full-refund choice; no partial reservation |
| Incident/receipt ready | Staff terminal resolution from Customer choice | Complete receipt or verified irrecoverable incident; no active conflicting resolution | Order `DeliveryFailed`; paid primary remains Paid + one exact full failed-delivery obligation; uncollected COD Cancelled/no Refund; durable event | Missing custody/evidence/choice changes nothing |
| Shipment destination any version | Correction | Customer-confirmed input before handoff; Carrier acceptance/evidence after handoff | New immutable version and append event; prior snapshots remain | Invalid/stale correction rejected without overwrite |

## 4. Data and index map

| Data fact | File | Required fields/index/invariant |
|---|---|---|
| Order projection | `server/src/models/order.model.js` | Remove `StockExportRequested`; add `DeliveryFailed`; immutable/published delivery deadline facts remain separate from Payment and aggregate settlement |
| Fulfillment cycle | `server/src/models/fulfillmentCycle.model.js` | `orderId`, integer `cycleNumber`, `cycleType=Initial/Resend`, `status`, `resendOfCycleId`, incident/customer-choice references; unique `(orderId, cycleNumber)` and stable `cycleKey` |
| Export request | `server/src/models/stockExportRequest.model.js` | `cycleId`, `requestKind`, `Pending/Processing/Completed/Failed/Cancelled`, processing/completion/failure evidence, unique cycle request and command identity |
| Packing record | `server/src/models/packingRecord.model.js` | cycle/order/export, exact checklist, status `Completed/Discrepancy`, actor/time/note/evidence, unique command and at most one Completed per cycle |
| Shipment | `server/src/models/shipment.model.js` | order/cycle/packing, external carrier snapshot/reference, handoff facts, status, current destination version; unique shipment/cycle and command key |
| Shipment event | `server/src/models/shipmentEvent.model.js` | append-only key/type/source/time/evidence/actor/replaces-event/reason; unique event key; ordered shipment history |
| Destination version | `server/src/models/shipmentDestinationVersion.model.js` | immutable receiver/address snapshot, version, confirmation source/reference, acceptance evidence; unique shipment/cycle version |
| Delivery incident | `server/src/models/deliveryIncident.model.js` | unique source event; incident kind/state; customer choice/wait/resolution; linked resend cycle |
| Returned parcel receipt | `server/src/models/returnedParcelReceipt.model.js` | exact per-line expected/received/sellable/damaged quantities, Warehouse actor/evidence/time; unique shipment and receipt key |
| Inventory ledger | `server/src/models/inventoryTransaction.model.js` | add returned-delivery movement types and returned-receipt relation; movement keys guarantee at-most-once |
| COD facts | Existing `codEvidence.model.js`, Order/Payment/Attempt projections | Keep Customer collection and Carrier settlement separate; no new discretionary amount field |
| Failed-delivery Refund | Existing `refundPending.model.js` and `returnRefundRequest.model.js` secure workflow | Add/use `FAILED_DELIVERY` obligation type/key `FAILED_DELIVERY:<businessEventId>:<sourceAttemptId>`; source allocation never exceeds verified collection |
| Durable event | Existing `domainOutbox.model.js` | enqueue inside the owning transaction with stable identities for Shipped, attempt/reschedule, Delivered, DeliveryFailed/refund-ready; none for export/Packed |

## 5. Migration map

`server/src/scripts/migrateSl004FulfillmentDelivery.js` and `npm run migrate:sl004` must:

1. preflight duplicate initial/open export requests, duplicate shipment/tracking identities, and invalid reservation/lineage references before mutation;
2. map legacy `Order.orderStatus=StockExportRequested` to `Confirmed` while preserving the export-request fact;
3. map request states `Approved -> Pending`, `Exported -> Completed`, `Rejected -> Failed`; preserve timestamps/actors/notes and map current `Processing` without falsely completing it;
4. create/backfill one Initial fulfillment cycle per confirmed fulfillment graph and attach the initial request;
5. refuse to fabricate packing/shipment/delivery evidence from bare legacy Order statuses; report records needing operational reconciliation;
6. replace the old open-request index with cycle/request command indexes only after preflight;
7. create all SL-004 indexes repeat-safely and produce zero business writes on a second run.

## 6. Exact API and validation map

| API | Backend validation/error codes | Frontend behavior |
|---|---|---|
| `POST /warehouse/stock-exports/:id/process` | requires `Idempotency-Key`; `EXPORT_INVENTORY_RECONCILIATION_REQUIRED`, `EXPORT_RESERVATION_MISSING`, `EXPORT_STOCK_INSUFFICIENT`, `EXPORT_STALE_STATE`, `IDEMPOTENCY_KEY_REUSED` | One process button; disable pending; show Completed/replayed/Failed distinctly; no approve/reject controls |
| `POST /staff/orders/:id/packing` | key + every exact checked line; `PACKING_LINE_MISSING`, `PACKING_QUANTITY_MISMATCH`, `EXPORT_NOT_COMPLETED`, `PACKING_STALE_STATE` | Exact checklist; discrepancy fields per line; no Customer notification copy |
| `POST /staff/orders/:id/shipments` | carrier, reference, handoff time, evidence, destination; field errors `carrierName/trackingReference/handedOffAt/evidenceReference` | Complete handoff form; fixed current destination; pending lock |
| `POST /staff/shipments/:id/events` | allowlisted event type/source, event time/evidence/reason, optional replaced event; delivery/COD fields are evidence facts only | Separate attempt, delivery, return/loss/damage, correction/dispute actions; never generic status buttons |
| `POST /carrier/shipments/:id/events` | signed middleware; identical event schema, source forced `CARRIER`; replay-safe | No Carrier UI/account |
| `POST /warehouse/shipments/:id/returned-receipt` | key + complete exact classification; field errors for missing/over-counted lines | Every line requires sellable/damaged accounting; no finance controls |
| `POST /orders/:id/destination-corrections` and Staff acceptance endpoint | ownership/current state; authenticated confirmation before handoff or Carrier evidence after | Customer sees request/current version/history; Staff sees acceptance evidence without editing checkout snapshot |
| `POST /orders/:id/delivery-incidents/:incidentId/choice` | own active incident; only `Resend/Wait/TerminalRefund`; no SKU/fee/amount fields | Exact three choices according to availability |
| `POST /staff/orders/:id/delivery-resolution` | key; Customer choice; receipt or irrecoverable evidence; server-derived money result | Shows immutable derived refund/COD result; no editable amount |
| `GET /orders/:id/fulfillment` | owner-only, masked evidence projection | Carrier/tracking/history/current destination/deadlines/no-live-map statement |

## 7. Acceptance and release-evidence map

| Acceptance | Requirement/data/API/code mapping | Planned RED/GREEN evidence |
|---|---|---|
| AT-059 | BR-037; export process, reservation, Inventory and one movement per line | `server/src/services/sl004.acceptance.test.js` exact multi-line export |
| AT-060 | BR-037/046; export command/cycle/movement unique identities | same test file, replay and concurrent claim |
| AT-061 | BR-037/046; transaction rollback, failure state, health/stale guards | same test file, injected second-line write failure and every guard |
| AT-062 | BR-038; PackingRecord + Staff route/UI; no outbox event | same server file + `client/src/pages/sl004UiContract.test.js` |
| AT-063 | BR-039; Shipment/handoff model/service/API/UI | same server/client acceptance files |
| AT-064 | BR-040; ShipmentEvent delivery/correction/dispute and deadline floor | same server acceptance file |
| AT-065 | BR-041; delivery + existing Payment/Attempt/COD evidence transaction | `server/src/services/sl004CrossSlice.acceptance.test.js` |
| AT-066 | BR-041/121; discrepancy vs settlement work item | same cross-slice file |
| AT-067 | BR-042/046; append-only attempts and durable outbox | server acceptance + client contract |
| AT-068 | BR-042/045; return custody versus complete atomic Warehouse receipt | server acceptance + client contract |
| AT-069 | BR-045; terminal returned result and independent money obligation | server cross-slice acceptance |
| AT-070 | BR-043; same-Order linked exact resend cycle | server acceptance + Customer client contract |
| AT-071 | BR-043/045; irrecoverable terminal exact full refund | server cross-slice acceptance |
| AT-072 | BR-044; immutable destination versions and cause evidence | server acceptance + Staff/Customer client contract |
| AT-073 | BR-035/046; route role matrix, owner projection, no Carrier role | `server/src/routes/sl004.routes.test.js` + client route contract |
| AT-074 | BR-046; command/event/outbox/refund/movement identities and isolated notification failure | both server acceptance files |
| CR AT-205..208 | BR-106..108; delivery-created discrepancy joins existing held-case/COD recovery seam | `sl004CrossSlice.acceptance.test.js`; focused existing Return/COD tests retained |
| CR AT-215..217 | BR-113..115; failed-delivery obligation independent from primary payment and other Refunds | cross-slice acceptance + existing payment/refund tests |
| CR AT-218 | BR-119 seam only: SL-004 emits immutable CompletedSale time and preserves it after later Return | focused projection contract only; no SL-006 implementation change |
| CR AT-219 | SL-006-owned ranking/fallback behavior | Out of SL-004 implementation; existing SL-006 evidence only, no file change |
| CR AT-220 | BR-120; attempt/reschedule and DeliveryFailed durable notification identities | server acceptance/outbox handler test |
| CR AT-223..226 | BR-121; full collection vs remittance, delivered-unpaid discrepancy, derived recovery refund, replay/no split | cross-slice acceptance + existing COD service tests |

Focused release commands:

```powershell
cd server
node --test src/models/fulfillment*.test.js src/models/packingRecord.model.test.js src/models/shipment*.test.js src/models/deliveryIncident.model.test.js src/models/returnedParcelReceipt.model.test.js src/services/sl004.acceptance.test.js src/services/sl004CrossSlice.acceptance.test.js src/routes/sl004.routes.test.js src/scripts/migrateSl004FulfillmentDelivery.test.js

cd ..\client
node --test src/pages/sl004UiContract.test.js src/services/fulfillmentService.test.js src/services/inventoryService.test.js src/services/staffOrderService.test.js
npm run build
```

Current local evidence is summarized in `SL-004_HANDOFF.md` and
`SL-004_RELEASE_AUDIT.md`. It does not claim provider verification, staging
actor acceptance, deployment, or a production migration.

## 9. Addendum 2026-07-26 - Customer delivery receipt (supersedes physical-completion shorthand)

| Requirement | Code boundary | Test/migration evidence |
|---|---|---|
| Physical delivery is not Customer completion | `Order.orderStatus=Delivered` remains physical; `customerDeliveryReceipt.model.js` is a separate append-only aggregate | Model/schema contract: 11 passing assertions |
| Customer has exactly two initial choices | Customer order detail receives authoritative `availableDeliveryActions` and posts one idempotent receipt command | API/projection contract: 90 passing assertions; full client gate 357/357 across 79 suites, 0 failed, 0 skipped |
| Only Customer receipt starts after-sales time | `customerDeliveryReceipt.service.js` snapshots both deadlines at `Received`; exchange/return/review share the receipt policy | Service variants: 46 and 32 passing assertions; direct after-sales gates: 161 passing assertions |
| Non-receipt remains investigable without fake completion | Immutable `NOT_RECEIVED` row, no Customer `Completed`, and direct after-sales gates return typed refusal | Same service and after-sales evidence above |
| Legacy Delivered records remain awaiting confirmation | `migrateCustomerDeliveryReceipt.js` creates only receipt indexes and verifies Shipment guard compatibility; it writes no receipt row; dry-run disables `autoIndex` and `autoCreate` before connect | Initial migration RED 0/6 then GREEN 6/6; command-identity P1 RED 6/7 then GREEN 7/7; bounded/read-only expansion RED 5/9 then GREEN 9/9; disposable MongoDB 8.2 collection list `[] -> []` |
| Exact technical indexes cannot silently drift | Migration preflight uses bounded server-side group counts, rejects duplicate Customer/idempotency command identities with `CUSTOMER_DELIVERY_RECEIPT_COMMAND_AMBIGUOUS`, duplicate terminal/initial receipt identities, unsafe guard types/values with `CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS`, and same-key index semantic conflicts before every index operation | `migrateCustomerDeliveryReceipt.test.js`; 5,000-row synthetic history asserts no `$push`, reason read, or unbounded diagnostic; BSON guard expansion RED 7/10 then GREEN 10/10 |
| Shipment receipt guard stays safe for `$inc` | Only finite, integral BSON `int`/`long`/`double` values in `0..9,007,199,254,740,990` pass; Decimal128, strings, negatives, fractions, NaN and Infinity fail closed | Fake boundary matrix plus portable disposable-Mongo positive-Infinity/Decimal128 cases; zero migration mutation |

Operational commands are deliberately explicit:

```powershell
cd server
npm run migrate:customer-delivery-receipt
npm run migrate:customer-delivery-receipt:apply
npm run verify:customer-delivery-receipt
```

The first command is dry-run. Apply and verify must be executed against the
named target database by the deployment owner; no production or target run is
claimed in this local evidence.

Final local branch evidence on 2026-07-26: full server 1194/1194 across 183
suites; full client 357/357 across 79 suites; 0 failed and 0 skipped in both;
receipt migration 10/10 against real MongoDB with 0 skipped; syntax verification
for 36 files; clean diff/prohibited-file/secret scans; and Vite 6.4.3 build exit
0 after 169 modules. The build retained a non-blocking 745.88 kB JavaScript
chunk warning (gzip 216.31 kB), above 500 kB. Production dependency audits
reported server 0 and client 3 pre-existing high findings in `postcss`,
`react-router`, and `react-router-dom`; package manifest and lockfile were
unchanged. The branch was 21 commits ahead and 0 behind at gate time.
Target-database dry-run/apply/verify and authenticated Customer/Staff
walkthroughs remain deployment-only.

## 8. Demo-only Staff delivery/COD reconciliation extension (2026-07-25)

| Invariant | Code boundary | Test evidence |
|---|---|---|
| Staff never supplies a COD amount | `fulfillmentCommand.service.js` rejects amount fields and derives a successful collection from immutable `codExpectedAmount` | `P1 lets non-production Staff record successful delivery...`; arbitrary amount rejection case |
| Manual Staff COD is unavailable in production | Runtime guard rejects every Staff COD delivery, including omission of `codCollectionResult`, with `COD_COLLECTION_CARRIER_SIGNATURE_REQUIRED`; Staff projection publishes `manualCodReconciliation=false` and UI consumes that capability | explicit-result/production rejection behavior test; `codUiContract.test.js` |
| Successful demo collection is attributable and atomic | Delivery transaction appends `ShipmentEvent`, creates `CodEvidence` with source `STAFF_RECONCILIATION`, marks Payment/Attempt/Order Paid, and sets `completedSaleAt` to evidence time | successful Staff reconciliation behavior test |
| Unsuccessful collection remains financially open without locking later Carrier facts | Explicit not-collected evidence remains on ShipmentEvent, leaves actual collection `null`, creates no CodEvidence/customerCollectionEvidenceId, leaves Payment Unpaid, and opens one `CodDiscrepancy` while Order is Delivered | not-collected behavior test |
| Failed delivery never becomes Delivered/Paid | `codCollectionResult` is valid only with `DELIVERED`; active failed-attempt/return paths retain their existing shipment/order invariants | failed-delivery rejection behavior test |
| Evidence is operational and bounded | Every submitted URL is verified by `operationalEvidenceClaim.verify(url)`; canonical `claim.url` values are used only for duplicate detection while the verified signed URLs are persisted on ShipmentEvent/CodEvidence for authenticated preview; maximum 5 images and 20 MiB per command | unsigned and six-image RED/GREEN cases; model contracts; client uploader contract |
| Internal evidence remains previewable without widening Customer data | Staff fulfillment projection includes the persisted signed URLs; Customer fulfillment projection continues to expose only `hasEvidence` | successful Staff reconciliation projection/privacy assertions; `codUiContract.test.js` |
| Failure reason, retry and errors remain operationally explicit | Staff operational failed-attempt/return evidence accepts only supported reason codes; validation returns `evidenceReferences`/`reason` field errors; event-key replay is bound to shipment/type/source/actor; the UI retains its event key across failure or failed reload and rotates it only after a confirmed reload | reason/field-error and cross-boundary key-reuse behavior tests; replay assertion; client pending/idempotency contract |
| Staff evidence identity remains persistence-safe | `CodEvidence.eventId` is derived from the durable ShipmentEvent ID instead of prefixing the caller's 160-character event key | 160-character event-key behavior test and replay assertion |

Fresh RED observed in this continuation: the Staff evidence projection assertion
failed at `25/26`; the invalid-claim and unsupported-reason tests each failed
`0/1`; the expanded client contract was `3/5`; and the reload-safe idempotency
assertion failed `0/1`; Customer-forced evidence projection and cross-boundary
event-key reuse were each observed RED before their privacy/idempotency guards.
Current local GREEN: focused server `41/41`, focused client `16/16`, full server
`1066/1066`, full client `262/262`, and production
client build PASS (158 modules).
