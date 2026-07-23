# CR-001 v2.1 — Cross-Slice Business Closure Design (COD collection/settlement clarification)

**Business approver:** Project Business Approver (user in this Codex task)
**Approval source:** explicit instruction to proceed after the nine-package consistency audit, followed by approval to clarify COD collection versus Carrier settlement
**Affected slices:** `SL-001`, `SL-002`, `SL-003`, `SL-004`, `SL-006`, and `SL-009`; actor and security constraints also bind `SL-005`, `SL-007`, and `SL-008` where referenced
**Current gate:** G0 `passed`; G1 `passed`; G2 `passed`; G3 `ready`, not yet `passed`
**Classification:** every decision and requirement in this document is an `approved-requirement`; repository behavior remains `observed-behavior`
**Mutation boundary:** this revision changes requirements artifacts only. It does not authorize code, migration, production-data, or deployment changes.

## 1. Purpose and Scope

The nine approved local packages are individually coherent, but several outcomes cross package boundaries. Without one binding contract, locally valid implementations can create globally invalid outcomes such as refunding an uncollected COD Order, overwriting a valid primary payment because an excess payment needs refunding, or posting the same returned unit into Inventory twice after an Exchange-to-Return conversion.

`CR-001 v2.1` closes only those intersections and clarifies the COD terms that were previously too broad. Existing package decisions remain authoritative where this document does not explicitly refine their handoff. The following rules have precedence when a package sentence can be read in more than one way:

1. physical delivery evidence, Customer collection evidence, and Carrier settlement/remittance evidence are separate facts;
2. `CODExpectedAmount` is one fixed amount equal to immutable `Order.TotalAmount`; the current release has no split-COD or customer-installment feature;
3. `CustomerCollectedAmount` means money the Customer actually paid to the Carrier and is proven by attributable collection evidence; `CarrierSettlementAmount` means money the Carrier later remitted or settled to the Shop;
4. a late, partial, or disputed Carrier remittance is a settlement reconciliation issue, not Customer under-collection, does not downgrade a valid `Paid` fact, and does not create a Refund;
5. a Customer may preserve a timely after-sales right while a `CODDiscrepancy` is investigated, but no Refund or payout may exceed verified `CustomerCollectedAmount`;
6. Exchange owns goods replacement only; Return/Refund owns whole-Order goods return and money payout;
7. PaymentAttempt evidence, Refund obligations, and aggregate financial settlement are separate lifecycles;
8. each physical unit and each Inventory movement retains lineage across after-sales cycles;
9. public best sellers and historical Admin sales reports are different projections;
10. notifications, Audit, and reports consume source events but never become command authority.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-055 | Project Business Approver instruction to proceed after the verified nine-package audit | 2026-07-23 | Approval to close the audited cross-slice gaps using the recommended contract | Normative business authority for `BD-110` through `BD-116` and this document | Project Business Approver | Approver display name is not recorded |
| SRC-056 | Approved local designs `SL-001` through `SL-009` under `docs/superpowers/specs/` | Repository HEAD `ba8525e7c25ac0e635746de4b2679ab07dfb1d81`; reviewed 2026-07-23 | Approved actor, state, deadline, money, Inventory, notification, and report rules | Normative for package-owned rules | Project Business Approver | Package intersections listed in Section 14 were not fully closed |
| SRC-057 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Revision `AIroW372r8j-BncuGRhIEqFwCQa2PLXsnMT53H_cxn5r7E_t-NkRjh2gJg2UEves9dhsAFtoTr0qoSWM8Lt1qYAOQzSFBEWVaj2Ap2eXHQI`; one tab `t.0`; read back 2026-07-23 | Existing candidate SRS structure plus the bounded CR-001 v2.1 addendum and readback evidence | Candidate source except where this approved closure adopts it; CR-001 v2.1 is normative for its stated rules | SRS contributors; Project Business Approver | Legacy paragraphs remain in place for traceability; the v2.1 clarification has precedence over any ambiguous collection/settlement wording |
| SRC-058 | Repository services, models, routes, UI, and selected tests | HEAD above; inspected 2026-07-23 | Current Return/Refund, payment, fulfillment, reporting, upload, address, and test behavior | `observed-behavior` only | Engineering team | Several behaviors conflict with approved packages and this closure |
| SRC-059 | Archived SWR Chapters 9, 17, and 29; archived SWD Chapters 9–11 | Local archive accessed 2026-07-23 | Business-rule traceability, requirements consistency/validation, and state-event-guard-action modeling | Method guidance only | SWR/SWD archive | Does not decide GreenHouse policy |

## 3. Approved Business Decision Log

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Decision date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-110 | SL-001/SL-004 | What happens when an Order is physically Delivered but full Customer COD collection is not verified? | Reject all after-sales; refund the Order total immediately; preserve request right with an evidence-gated recovery | Preserve one timely Return/Exchange submission in COD reconciliation hold. Verified `CustomerCollectedAmount = CODExpectedAmount` releases the selected normal after-sales flow. Conclusively verified Customer under-collection cannot produce a replacement or whole-Order Return Refund: Staff coordinates complete goods recovery, Warehouse accounts Inventory once, zero Customer collection closes with no Refund, and positive verified `CustomerCollectedAmount` creates one server-derived COD-recovery Refund for exactly that amount. Carrier settlement/remittance is recorded separately and never triggers this recovery branch. The Order becomes `Returned`, Payment becomes `Cancelled`, and the held case closes only after goods and any required recovery Refund are complete | Preserve the Customer's five-day right, return every verified Customer-paid đồng when the Shop recovers the goods, and never pay money the Customer did not pay | Project Business Approver | 2026-07-23 | BR-106, BR-107 |
| BD-111 | SL-004/SL-009 | Which timestamp creates a sale when COD evidence is reconciled after delivery? | Always DeliveredAt; always reconciliation time; evidence-based Customer-collection time | If evidence proves full Customer collection occurred at delivery, use DeliveredAt for payment and CompletedSale. If full Customer collection actually occurs later, use the actual later Customer-collection time for payment and CompletedSale. Carrier settlement time never controls the sale clock. If full Customer collection is not verified, no CompletedSale exists | Prevent backdating a later Customer cash event or moving a sale because the Carrier remitted later | Project Business Approver | 2026-07-23 | BR-108, BR-119 |
| BD-112 | SL-001/SL-002 | How does exact-stock unavailability and Exchange-to-Return conversion work? | Leave Submitted with manual notes; reject and require a new request; explicit waiting/choice state and atomic handoff | After Staff confirms Exchange eligibility but exact reservation cannot commit, use an explicit no-stock choice state. Customer may wait or convert. Conversion atomically releases Exchange reservations, preserves the original timely submission instant, reuses physical/Inventory lineage already recorded, and hands remaining whole-Order obligations to `SL-001`; `SL-001` owns all money and destination rules | Make the approved wait/convert right implementable without duplicate stock or a second eligibility clock | Project Business Approver | 2026-07-23 | BR-109, BR-110 |
| BD-113 | SL-001/SL-002 | When may a later after-sales request be created after a terminal case? | Never; always; terminal-state and physical-lineage rules | Rejected, Customer-cancelled, and Expired cases release the active lock; a new request is allowed only while the applicable original or replacement deadline is still valid. Completed Return ends whole-Order after-sales. Completed Exchange keeps the Order Delivered; replacement units receive only their approved replacement Exchange window and do not reset the original whole-Order Return deadline | Distinguish concurrency prevention from permanent loss or reset of Customer rights | Project Business Approver | 2026-07-23 | BR-111, BR-112 |
| BD-114 | SL-001/SL-003/SL-004/SL-009 | How are multiple successful payment transactions and multiple refunds represented? | One mutable Order payment/refund row; one Refund per Order; immutable attempts plus independent obligations | Keep immutable PaymentAttempts. Select at most one accepted primary collection for fulfillment. Create one distinct idempotent Refund obligation per refundable business event/provider transaction. No cancellation, failed-delivery, Return, COD-recovery, late-payment, or excess-payment Refund overwrites a valid primary `Paid` fact. Track aggregate outstanding obligations separately and do not declare financial settlement while any required Refund is non-terminal | Avoid losing the valid sale payment, collapsing multiple refunds, or falsely closing money obligations | Project Business Approver | 2026-07-23 | BR-113 through BR-115 |
| BD-115 | SL-002/SL-003 | Does the Exchange shipping-payer rule collect money inside GreenHouse? | In-system shipping charge; deduction from refund; off-system carrier settlement | The current release records payer and rationale only. Any carrier payment is settled outside the Exchange module. Exchange contains no charge, Refund, payout, payOS, price-difference, or deduction field | Preserve approved fault ownership without inventing a second payment product | Project Business Approver | 2026-07-23 | BR-116 |
| BD-116 | SL-001/SL-002/SL-007/SL-009 | What minimum security contract applies to evidence and refund destination data? | Defer entirely to implementation; reuse product-media rules; explicit shared sensitive-data profile | Use a shared after-sales evidence profile with allowlisted image formats, bounded size/count, content-signature validation, malware scanning, owner-bound opaque storage, authorization on every read, and retention/disposal rules. Encrypt full refund destination values, mask non-authorized views, exclude them from Notification/Audit/outbox payloads, and retain only as long as the approved financial/recovery policy requires | Make G4 tests and implementation safe without changing who decides the business outcome | Project Business Approver | 2026-07-23 | BR-117, BR-118 |
| BD-117 | SL-003/SL-004/SL-001/SL-009 | Does a Carrier remittance mismatch mean that Customer COD was only partly collected? | Treat every Carrier settlement batch as a new Customer payment; use one mutable COD amount; leave the distinction to implementation | Keep one fixed `CODExpectedAmount = Order.TotalAmount` and no split/installment COD. Record `CustomerCollectedAmount` from delivery/collection evidence separately from `CarrierSettlementAmount` remitted to the Shop. Full Customer collection establishes `Paid` even when remittance is late or partial; only conclusive Customer under-collection enters COD recovery. A positive recovery Refund is one server-derived obligation equal to verified CustomerCollectedAmount after complete goods recovery; no actor enters the amount | Prevent a delayed Carrier settlement from falsely creating a Refund or downgrading a valid sale while still defining the rare physical under-collection incident | Project Business Approver | 2026-07-23 | BR-106 through BR-108, BR-113 through BR-115, BR-121 |

## 4. Actor Responsibility Matrix at Cross-Slice Handoffs

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Customer | Preserve and complete an eligible after-sales outcome for owned goods | Submit Return/Exchange on time; choose wait/conversion; submit evidence; confirm own refund destination; resubmit after an eligible terminal case | Choose refund amount; mark COD collected; edit payment/provider evidence; approve own case; inspect Inventory | Initiates after-sales intent; chooses wait/conversion; may cancel only at approved pre-handoff boundaries | Own Order/cases, masked money status, own evidence and destination input | Request/evidence to Staff; goods to Carrier/Warehouse; destination to Staff verification | Duplicate, late, foreign, or blocked action returns explicit current case/hold reason without a second effect |
| Staff / CSKH | Decide eligibility and coordinate operational/financial reconciliation | Approve/reject with reason; open/verify destination; reconcile Customer collection separately from Carrier settlement; offer wait/conversion | Choose refund amount; edit Customer-confirmed destination; classify Inventory; invent collection/delivery success; treat remittance delay as Customer under-collection; mutate primary payment to hide an excess refund | Staff decision states; collection and settlement reconciliation outcomes only from attributable evidence; operational conversion coordination | Required Order/case/payment/settlement evidence and authorized destination view; no Warehouse stock mutation | Approved physical task to Warehouse; verified Customer money evidence to Refund orchestration; Carrier remittance mismatch to settlement work item; conversion to `SL-001` | Unknown collection evidence remains open; settlement mismatch never creates false Refund; no false Paid, Refunded, or Completed state |
| Warehouse | Make physical custody and Inventory facts exact | Receive, inspect, classify, and record authorized movements once per physical lineage | Decide eligibility, COD/payment, destination, refund amount, or provider success | Physical receipt/inspection outcomes and authorized Inventory transactions | Order-line, physical-unit, condition, custody, and movement data; no bank data | Receipt/inspection to owning after-sales/fulfillment slice | Missing lineage/quantity or repeated movement blocks finalization and commits no duplicate stock |
| Admin | Govern catalog, accounts, reports, Audit, and allowlisted settings | Read global reports/Audit under `SL-009`; perform separately authorized Admin functions | Act as Staff/Warehouse in a case merely because of Admin role; view another recipient's notification body; edit refund destination/amount | No Return/Exchange/COD operational transition | Purpose-limited global views and Admin-owned configuration/catalog/account data | Reads immutable business evidence; does not replace source actor | Unauthorized operational action is denied and audited safely |
| Carrier | Transport goods and supply objective evidence | Supply handoff, attempt, delivery, Customer collection, settlement/remittance, return, loss, or damage facts | Decide eligibility, stock, Refund, or case completion by itself; combine collection and settlement into one mutable amount | No GreenHouse state directly | Minimum shipment data and separate external collection/settlement event evidence | Evidence to System/Staff; goods to Customer/Warehouse | Unknown/disputed event remains non-terminal until the correct collection or settlement reconciliation is complete |
| payOS | Process accepted inbound payment evidence or an authorized idempotent Payout | Return signed transaction/payout status and provider identity | Decide eligibility, refund amount, destination, Inventory, or business completion | Provider outcome only | Exact minimum command and provider response evidence | Signed result to System reconciliation | Timeout/unknown/failure is not success and never authorizes duplicate fallback |
| GreenHouse System | Enforce actor boundaries, invariants, atomicity, idempotency, and privacy | Validate commands; derive fixed expected amounts/deadlines; store Customer collection and Carrier settlement separately; join independent prerequisites; emit safe events | Invent actor approvals/evidence; convert settlement mismatch into Customer under-collection; reinterpret reports as command truth | Mechanical transitions only after valid actor event and guards | Least-privilege projections and immutable lineage/collection/settlement evidence | Coordinates owning slices through stable business-event IDs | Rejects/rolls back illegal grouped effects and returns existing idempotent outcome |

## 5. Cross-Slice Business Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-001/SL-004 | Customer preserves a timely Return right without refunding unverified COD | Return submission for `Delivered + Unpaid` with open `CODDiscrepancy` | Owned Order; submit instant within stored deadline; complete reason/evidence; no active case | Record one held request, reconcile `CustomerCollectedAmount` separately from Carrier settlement; then either continue normal full Return after verified full Customer collection or recover goods under the exception path | Unknown/partial Customer-collection evidence stays held; settlement delay alone does not hold a valid `Paid` fact; duplicate submission returns existing case; no destination/payout readiness | `CODExpectedAmount` and normal Return remain fixed `Order.TotalAmount`; a recovery Refund is server-derived from verified `CustomerCollectedAmount` only | No Refund/payout exceeds verified Customer collection; physical deadline right is preserved | Customer owns submission; Staff reconciles collection and settlement separately; Warehouse owns physical facts | AT-205 through AT-208, AT-223 through AT-226 | `approved-requirement` |
| SL-002/SL-001 | Customer waits for exact replacement stock or converts once to whole-Order Return | Staff confirms Exchange eligibility but exact reservation cannot commit, or an in-flight replacement incident has no exact resend stock | Original Exchange was timely; one active case; physical lineage and existing movements are known | Enter explicit choice/wait state; wait until atomic reserve succeeds, or convert atomically and continue under `SL-001` | Repeated choice is idempotent; conversion failure rolls back reservation release and handoff; COD hold still applies | Conversion preserves original timely instant; new physical `ShipByAt` is created only for Customer-held goods when Return handoff activates | No duplicate Inventory movement, active lock, Refund, or case | Customer chooses; Staff coordinates; Warehouse facts are reused; `SL-001` owns money | AT-209 through AT-212 | `approved-requirement` |
| SL-003/SL-009 | System preserves one primary Customer collection, tracks Carrier settlement separately, and settles every independent Refund obligation | Payment/provider event, Carrier collection/settlement event, or approved refund-triggering business event | Signed provider/Carrier evidence or approved domain event; stable transaction/event identity | Record immutable attempt; store collection and settlement facts separately; select primary once; create/deduplicate Refund obligations; compute aggregate outstanding state; report each completion at its own event time | A late/partial Carrier settlement does not create a Refund or change primary Paid; a conclusive Customer under-collection enters the shared recovery path; unknown outcomes remain open; duplicates return existing obligation | One Refund amount is server-derived from its trigger and source Customer collection; `MoneyObligationsSettled = false` while any required obligation is non-terminal | PaymentAttempt and collection evidence immutable; at most one primary; distinct Refund per trigger/transaction; no false settlement | Staff cannot edit provider/Carrier truth or amount; Admin reports read only | AT-215 through AT-217, AT-223 through AT-226 | `approved-requirement` |
| SL-006/SL-009 | Guest/Customer sees current public best sellers while Admin sees historical gross sales | Public ranking request or Admin report request | Approved time window and source event/snapshot data | Public projection follows `SL-006`; Admin gross projection follows `SL-009` | Empty public ranking uses labeled newest fallback; later Return changes public eligibility but not historical gross event | Public: `CompletedSaleAt` in window plus current `Delivered + Paid`, exclude completed whole Return, active Products, quantity/value/SKU ties. Admin: immutable CompletedSale and separate Refund | One projection never substitutes for the other | Public contains no Admin detail; Admin report grants no operational mutation | AT-218, AT-219 | `approved-requirement` |

## 6. Normative Cross-Slice Requirements

| Requirement ID | Approved requirement | Decision/source |
|---|---|---|
| BR-106 | A timely Return or Exchange submission for an owned `Delivered` Order with `Payment=Unpaid` and an open `CODDiscrepancy` shall be recorded exactly once as `AwaitingCODReconciliation`. The request timestamp preserves the five-day right. No Staff approval that opens refund-destination processing, Refund creation, payout readiness, or financial completion is permitted while Customer collection remains unverified. A Carrier settlement delay after full Customer collection does not create this hold. | BD-110, BD-117 |
| BR-107 | `CODExpectedAmount` is immutable `Order.TotalAmount` and the current release has one COD obligation per Order; no Customer installment or split-COD field/path exists. System stores `CustomerCollectedAmount` (what the Customer actually paid to the Carrier, proven by attributable collection evidence) separately from `CarrierSettlementAmount` (what the Carrier later remitted/settled to the Shop). Full Customer collection at delivery sets `PaidAt=DeliveredAt`; full Customer collection later sets `PaidAt` to the actual later collection instant; either releases the held case and may establish a CompletedSale. A late, partial, or disputed Carrier settlement does not mean Customer under-collection, does not downgrade a valid `Paid` fact, and creates no Refund. Only conclusive evidence that `CustomerCollectedAmount < CODExpectedAmount` enters `CODRecoveryInProgress`, permits no replacement or whole-Order Return Refund, and requires complete goods recovery plus Warehouse accounting. Zero Customer collection closes `ClosedByCODRecovery` with Order `Returned`, Payment `Cancelled`, and no Refund. A verified positive under-collection creates exactly one distinct COD-recovery Refund equal to the verified `CustomerCollectedAmount` after complete goods recovery and secure destination verification; the amount is server-derived and no actor enters it. Only verified recovery payout may close the case. Incomplete, contradictory, or disputed collection/custody evidence remains open and non-terminal. | BD-110, BD-111, BD-114, BD-117 |
| BR-108 | A COD Order shall create a CompletedSale only when both immutable physical delivery and verified full `CustomerCollectedAmount = CODExpectedAmount` exist. If full Customer collection occurred at delivery, the CompletedSale timestamp is `DeliveredAt`; if it occurred later, it is the actual later `PaidAt`. Carrier remittance/settlement time never replaces the evidenced Customer-collection business-event time. | BD-111, BD-117 |
| BR-109 | When Staff confirms Exchange eligibility but atomic exact-SKU reservation cannot commit, the case shall enter `AwaitingExactStockChoice` rather than remain ambiguously Submitted or become Approved. Customer may choose `WaitingForExactStock` or conversion. `ApprovedAt` and `ShipByAt` are created only when exact reservation later commits; waiting has no stock reservation or expiry disguised as an approved handoff deadline. | BD-112 |
| BR-110 | Exchange-to-Return conversion shall be one atomic command that releases every remaining Exchange reservation, closes Exchange as `ConvertedToReturnRefund`, preserves the original timely submission instant, creates one linked `SL-001` handoff, and retains physical-unit/Inventory/Shipment lineage. Existing Warehouse receipt/classification and Inventory transactions are referenced, never replayed. `SL-001` creates a new three-day physical `ShipByAt` only for remaining Customer-held goods and exclusively owns destination, Refund, receipt completion, and payout. | BD-112 |
| BR-111 | `Rejected`, Customer-cancelled, and `Expired` after-sales cases shall release the active Order/unit lock. A new request is allowed only if the applicable immutable original or replacement deadline has not passed and the Customer supplies a new idempotency identity, reason, and evidence. Reopening or silently mutating the terminal case is forbidden. | BD-113 |
| BR-112 | Completed Return sets the whole Order `Returned` and prohibits another whole-Order after-sales case. Completed Exchange leaves the Order `Delivered`. Only delivered replacement units receive their own five-day Exchange window; the original whole-Order Return deadline never resets. Any later eligible case uses physical-unit lineage and shall not repeat a prior Inventory movement. | BD-113 |
| BR-113 | Every inbound provider/COD PaymentAttempt, Carrier collection event, and Carrier settlement event shall be append-only. At most one successful Customer collection or online provider capture is accepted as the primary payment that authorizes fulfillment. Once validly `Paid`, that primary collection remains `Paid` even if Carrier remittance is late or partial; cancellation, failed-delivery, Return, COD-recovery, late-payment, and excess-payment Refund obligations use their own states and shall not substitute `RefundPending` or `Refunded` for the payment fact. | BD-114, BD-117 |
| BR-114 | Each cancellation, failed-delivery, Return, COD-recovery, late-payment, or excess-payment event that requires money back shall create a distinct Refund obligation keyed by `RefundTriggerType + BusinessEventID + SourceCollectionID/ProviderTransactionID where applicable`. A Carrier settlement mismatch alone creates no Refund obligation. Duplicate commands return the same obligation. Its amount is derived by the owning approved rule and is never a Customer/Staff field. Before creation or payout, System shall atomically reserve/reconcile that amount against the source `CustomerCollectedAmount` or online provider capture so active plus completed Refund allocations never exceed that verified source amount. | BD-114, BD-117 |
| BR-121 | Collection and settlement are separate projections. `CustomerCollectedAmount` is the amount actually paid by the Customer and controls `Payment=Paid`, CompletedSale, and any exceptional COD-recovery Refund. `CarrierSettlementAmount` is the amount remitted to the Shop and controls only a separate Carrier settlement-reconciliation work item. A difference between the two never authorizes a Refund, never changes `Payment=Paid`, and never creates a second COD portion. | BD-117 |
| BR-115 | The aggregate financial projection shall expose whether any required Refund is `Pending`, `Processing`, `Unknown`, `FailedTerminal`, or `Refunded`. `MoneyObligationsSettled` becomes true only when every required Refund obligation is verified `Refunded` or closed through an approved no-payout resolution. Order fulfillment payment state, terminal business state, and aggregate money settlement shall not overwrite one another. | BD-114 |
| BR-116 | Exchange shipping payer/rationale is an attributable operational record only. GreenHouse shall not collect, deduct, refund, or pay that shipping amount in the current Exchange module, and no Exchange interface/model/event shall contain price-difference, shipping-charge, refund-destination, payout, or payOS fields. | BD-115 |
| BR-117 | Return/Exchange evidence shall use one shared security profile: authenticated owner-bound upload; allowlisted JPEG, PNG, and WebP after content-signature verification; maximum 5 MiB per file, five files per submission, and 20 MiB total; generated opaque object key; original name treated as display metadata only; malware scan before Staff/Warehouse access; authorization on every read; no executable/vector/archive document formats; and retention/disposal tied to the after-sales record. | BD-116 |
| BR-118 | Full refund destination values shall be encrypted at rest and excluded from client logs, server logs, Audit before/after payloads, DomainOutbox, Notification, analytics, and report exports. Customer may read masked current versions; only authorized Staff may read the full confirmed version for verification/payout; Warehouse and Admin report roles receive no full value. Immutable versions and access events are auditable, and disposal requires an approved retention event that keeps non-sensitive financial evidence. | BD-116 |
| BR-119 | Public best sellers shall follow `SL-006 BR-066`: immutable `CompletedSaleAt` controls the thirty-day window, including actual later `PaidAt` for later full Customer COD collection, while Carrier settlement/remittance time never moves that window and current `Delivered + Paid`, public Product, and non-Returned guards control present eligibility. Historical Admin revenue/product reports shall follow `SL-009 BR-102/BR-103`; Carrier settlement remains a separate reconciliation projection. A completed Return may remove an Order from the current public ranking but shall not erase the immutable historical CompletedSale; its Refund is reported separately. | BD-070, BD-106, BD-107, BD-111, BD-117; reconciled timestamp boundary |
| BR-120 | `SL-009` shall notify the Customer by email and in-app for evidence-backed failed delivery attempt/reschedule and terminal `DeliveryFailed`, in addition to the milestones already listed. Notification failure never changes Shipment, Order, Payment, COD, Return, or Refund state. | BD-050, BD-101; reconciled, no new policy |

## 7. State Models

### 7.1 COD Discrepancy and After-Sales Hold

| Current state | Trigger/evidence | Guard and side effects | Next state |
|---|---|---|---|
| `Open` | Physical delivery proved without verified full `CustomerCollectedAmount = CODExpectedAmount` | Keep `Order=Delivered`, `Payment=Unpaid`; create one `CODDiscrepancy`; publish after-sales deadlines | `Open` |
| `Open` | Timely Customer after-sales submission | Create one held case; no destination/Refund/payout effect | `AwaitingCODReconciliation` on the case; discrepancy stays `Open` |
| `Open` | Evidence proves full Customer collection occurred at delivery | Set `Payment=Paid`, `PaidAt=DeliveredAt`; establish CompletedSale at DeliveredAt; keep any Carrier settlement reconciliation separate | `ResolvedCollectedAtDelivery` |
| `Open` | Evidence proves full Customer collection occurred later | Set `Payment=Paid`, `PaidAt=actual Customer-collection instant`; establish CompletedSale at PaidAt; keep any Carrier settlement reconciliation separate | `ResolvedCollectedLater` |
| `Open` | Evidence conclusively proves `CustomerCollectedAmount < CODExpectedAmount` | Store attributable Customer collection and any separate Carrier settlement facts; permit no normal Return/Exchange outcome; start complete goods recovery | `RecoveryRequired`; case `CODRecoveryInProgress` |
| `Open` | Full Customer collection is proved but Carrier remittance is late, partial, or disputed | Set/retain `Payment=Paid` and the evidenced `PaidAt`; open a separate Carrier settlement-reconciliation work item; create no Refund and do not hold after-sales on this fact alone | `ResolvedCollectedAtDelivery` or `ResolvedCollectedLater` + settlement reconciliation open |
| `RecoveryRequired` | Warehouse accounts all goods and verified Customer collection is zero | Post each authorized Inventory movement once; set Order `Returned`, Payment `Cancelled`; create no Refund | `ResolvedUncollected`; case `ClosedByCODRecovery` |
| `RecoveryRequired` | Warehouse accounts all goods and `0 < CustomerCollectedAmount < CODExpectedAmount` | Create one exact `CustomerCollectedAmount` COD-recovery Refund after secure destination verification; retain primary Payment not-Paid | `RecoveryRefundPending` |
| `RecoveryRefundPending` | Exact COD-recovery Refund is verifiably `Refunded` | Set Order `Returned`, Payment `Cancelled`, aggregate settlement true; close held case | `ResolvedPartialRefunded`; case `ClosedByCODRecovery` |
| `Open`, `RecoveryRequired`, or `RecoveryRefundPending` | Evidence is incomplete, contradictory, missing, disputed, or a prerequisite is incomplete | Append evidence/dispute only; no false Paid, CompletedSale, replacement, whole-Order Return Refund, payout success, or terminal case completion | Current state |

### 7.2 After-Sales Order Lock

| Case outcome | Lock effect | Later request rule |
|---|---|---|
| Active state, including COD hold, stock wait, shipment, inspection, payout, or delivery incident | Lock remains held | Return existing case or deterministic conflict |
| Rejected, Customer-cancelled, or Expired | Release lock | New request only before/equal to applicable immutable deadline with new reason/evidence/idempotency identity |
| Completed Exchange | Release Order lock; retain unit lineage | Eligible replacement unit may start a new Exchange window; original whole-Order Return deadline does not reset |
| ConvertedToReturnRefund | Transfer the same lock atomically to linked Return | No gap and no concurrent case |
| Completed Return | Close whole-Order after-sales permanently | No new Return/Exchange for that Order |

### 7.3 Exchange No-Stock and Conversion

| Current state | Trigger | Guard/side effects | Next state |
|---|---|---|---|
| `Submitted` | Staff approves eligibility but exact reservation fails | Persist eligibility decision and no-stock evidence; reserve nothing | `AwaitingExactStockChoice` |
| `AwaitingExactStockChoice` | Customer chooses wait | No reservation; notify Customer of visible wait state | `WaitingForExactStock` |
| `WaitingForExactStock` | Exact stock becomes available and Staff retries approval | Atomic exact reservation; set `ApprovedAt` and `ShipByAt=ApprovedAt+3 days` | `ApprovedAwaitingShipment` |
| `AwaitingExactStockChoice` or `WaitingForExactStock` or `DeliveryIncident` | Customer chooses whole-Order Return | Atomic reservation release, linked handoff, original timely instant, lineage snapshot | `ConvertedToReturnRefund` |
| Any conversion source | Grouped handoff write fails | Roll back every release/handoff/status effect | Prior state |

### 7.4 Payment, Refund Obligation, and Aggregate Settlement

```text
CODExpectedAmount: immutable Order.TotalAmount; one COD obligation per Order
CustomerCollectedAmount: immutable/evidence-backed amount actually paid by Customer to Carrier
CarrierSettlementAmount: separate Carrier remittance/settlement amount sent to Shop
PaymentAttempt: immutable provider/COD collection evidence; never rewritten into a Refund state
PrimaryPayment: Unpaid -> Paid exactly once from accepted Customer collection or online provider capture
Refund obligation: Pending -> Processing -> Refunded
                              -> Unknown -> Processing/Refunded
                              -> FailedTerminal (visible unresolved obligation)
Aggregate: MoneyObligationsSettled = all required obligations are Refunded or approved no-payout closures
```

`CustomerCollectedAmount` controls payment, sale completion, and the exceptional COD-recovery Refund. `CarrierSettlementAmount` controls only a separate Carrier reconciliation work item. A difference between them is not a second COD payment and is not, by itself, a Refund trigger.

## 8. Cross-Slice Sequences

### 8.1 Delivered COD, Unpaid, Then Return

1. Delivery evidence creates `DeliveredAt`, five-day deadlines, `Payment=Unpaid`, and one open `CODDiscrepancy`.
2. Customer submits complete Return evidence on time; System creates one `AwaitingCODReconciliation` case.
3. System does not open destination processing, create a Return Refund, or allow payout.
4. Staff reconciles attributable Customer-collection evidence separately from Carrier settlement/remittance evidence.
5. Verified full Customer collection releases the hold and the selected normal Return/Exchange path continues. A remittance delay or partial settlement does not create a hold when full Customer collection is already proved.
6. Conclusively verified zero/under-collection of Customer money starts `CODRecoveryInProgress`; no replacement or whole-Order Return Refund is created.
7. Warehouse accounts the complete recovered Order once. Zero Customer collection closes with no Refund; a verified positive under-collection creates one exact COD-recovery Refund equal to `CustomerCollectedAmount` after secure destination verification.
8. Only goods recovery plus any required verified COD-recovery Refund closes the case `ClosedByCODRecovery`, with Order `Returned`, Payment `Cancelled`, no CompletedSale, and aggregate obligations settled.
9. Unknown, contradictory, disputed, or incomplete money/custody evidence remains open and visible; no terminal claim is made.

### 8.2 Exchange Converts to Return

1. Customer's original Exchange submission establishes the timely instant.
2. Staff eligibility and stock outcomes are recorded separately.
3. Customer chooses conversion from an approved no-stock/incident state.
4. One transaction releases remaining reservations, writes the terminal Exchange outcome, creates the linked Return handoff, transfers the active lock, and snapshots physical lineage.
5. Any goods already accepted by Warehouse and Inventory movements remain authoritative and are referenced.
6. `SL-001` requests only remaining Customer-held goods and creates a physical handoff deadline for them.
7. `SL-001` applies COD hold, destination, Refund, payout, receipt, and completion rules without repeating physical effects.

### 8.3 Excess Successful Payment

1. Signed provider evidence records every successful PaymentAttempt.
2. The first accepted collection becomes the immutable primary payment for fulfillment.
3. Another successful transaction for the same Order creates a distinct excess-payment Refund obligation keyed to that provider transaction.
4. Order remains `Paid`; the excess obligation is visible in the aggregate financial projection.
5. Provider failure/unknown remains on that Refund obligation only.
6. Financial settlement is complete only after all required obligations reach verified or approved no-payout terminal outcomes.

## 9. Global Invariants

1. `RefundedAmount` for any obligation shall not exceed the amount verified collected by the Customer for that obligation's source transaction/business event; Carrier remittance/settlement is not a substitute for Customer collection evidence. The sum of active plus completed Refund allocations against one source collection shall never exceed its verified CustomerCollectedAmount.
2. Whole-Order Return Refund remains exactly `Order.TotalAmount` and is created only after full Customer collection is verified. A COD-recovery Refund is a distinct exception equal to the conclusively verified positive `CustomerCollectedAmount` after complete goods recovery; zero Customer collection creates no Refund.
3. No actor may enter or alter COD expected amount, Return Refund amount, or an excess-payment Refund amount.
4. One physical movement identity may affect Inventory at most once, even after conversion, retry, resend, or later after-sales case.
5. At most one active after-sales lock exists per Order, and transfer during conversion has no unlocked gap.
6. `Delivered`, `Paid`, `Refunded`, `Returned`, and `MoneyObligationsSettled` prove different facts and never substitute for one another.
7. PaymentAttempt, COD, Carrier, Warehouse, destination, payout, Audit, and notification evidence is append-only and attributable.
8. External timeout, failure, unknown, or duplicated callback never becomes business success without verified evidence.
9. Notification, Audit, and report records never grant mutation authority over their target object.
10. Full destination and raw evidence payloads never enter broad cross-cutting projections.

## 10. UI and Data Contract

- Customer Order detail shows one **Đổi/Trả hàng** entry when an applicable right exists, then separate Exchange and Return choices.
- A COD-held case visibly states that the timely request was recorded and identifies whether Customer-collection reconciliation, Carrier-settlement reconciliation, goods recovery, Warehouse accounting, destination verification, or an exact server-derived recovery Refund is outstanding; it does not ask Customer or Staff to enter or alter an amount.
- Exchange no-stock UI offers exactly **Chờ đúng sản phẩm** and **Chuyển sang trả hàng/hoàn tiền**; repeated clicks show processing/already-recorded feedback.
- Exchange surfaces show payer and rationale as information only, with no shipping charge/payment/refund control.
- Staff/CSKH sees evidence-backed reconciliation actions but no editable amount or Customer-confirmed destination field.
- Warehouse sees physical lineage and the movements already posted, but no refund destination or payout controls.
- Admin reports expose aggregate/refund identities and masked references, never full destination or raw evidence content.
- APIs return stable conflict/hold codes and the current case identity so the UI can link to the existing outcome.

## 11. Acceptance Examples

| AT ID | Given / When / Then evidence | Classification |
|---|---|---|
| AT-205 | Given an owned `Delivered + Unpaid` COD Order with an open discrepancy, when Customer submits complete Return evidence before/equal to the deadline, then exactly one held case is created and the timely instant is preserved. | `approved-requirement` |
| AT-206 | Given that held case, when Staff or a retry attempts destination approval, Return Refund creation, payout, or completion before verified full Customer collection, then the command is denied with no money effect. | `approved-requirement` |
| AT-207 | Given evidence that full COD collection occurred at delivery, when reconciled, then Payment becomes Paid at DeliveredAt, one CompletedSale is established at DeliveredAt, and the normal after-sales path may continue once. | `approved-requirement` |
| AT-208 | Given full Customer collection later, verified zero Customer collection, verified positive Customer under-collection, or unresolved Customer-collection evidence, when reconciled, then respectively CompletedSale uses actual later `PaidAt`; complete goods recovery closes `Returned/Cancelled` with no Refund; complete recovery creates exactly one Refund equal to verified `CustomerCollectedAmount` and closes only after verified payout; or the case remains held with no false terminal outcome. Carrier settlement/remittance is evaluated separately. | `approved-requirement` |
| AT-209 | Given Staff-approved Exchange eligibility and failed exact reservation, when the decision commits, then the case becomes `AwaitingExactStockChoice`, no reservation exists, and no `ApprovedAt/ShipByAt` is created. | `approved-requirement` |
| AT-210 | Given a waiting case and newly available exact stock, when Staff retries approval, then reservation, ApprovedAt, and three-day ShipByAt commit atomically once. | `approved-requirement` |
| AT-211 | Given Customer chooses conversion, when the command succeeds or is retried, then exactly one linked Return handoff exists, remaining reservations are released once, the active lock transfers without a gap, and the original timely instant is retained. | `approved-requirement` |
| AT-212 | Given Warehouse already posted accepted original units before conversion, when Return later processes the whole Order, then those movement identities are referenced and no duplicate Inventory transaction is created. | `approved-requirement` |
| AT-213 | Given a Rejected/Cancelled/Expired case before the applicable deadline, when Customer submits new reason/evidence under a new idempotency identity, then one new case may be created; after the deadline it is rejected. | `approved-requirement` |
| AT-214 | Given a completed Exchange, when later rights are evaluated, then Order remains Delivered, replacement units use only their replacement Exchange deadline, and the original Return deadline is unchanged. | `approved-requirement` |
| AT-215 | Given two successful provider transactions for one Order, when the second is verified, then one stays the primary Paid collection and one distinct excess Refund obligation is created without changing Order to RefundPending. | `approved-requirement` |
| AT-216 | Given multiple independently required Refunds, when one completes or fails, then only that obligation changes and aggregate settlement remains false while another required obligation is non-terminal. | `approved-requirement` |
| AT-217 | Given duplicate refund-trigger commands or provider callbacks, when replayed, then the same obligation/result is returned and no second payout/audit/business effect occurs. | `approved-requirement` |
| AT-218 | Given an Order completed a sale and later a whole Return, when projections are generated, then Admin Gross retains the sale and reports the Refund separately while the current public best-seller projection excludes the returned Order. | `approved-requirement` |
| AT-219 | Given tied public best sellers, inactive Products, and an empty qualifying window, when requested, then SL-006 quantity/value/SKU rules apply and the empty case uses the explicit “Sản phẩm mới” fallback. | `approved-requirement` |
| AT-220 | Given a failed delivery attempt/reschedule or terminal DeliveryFailed event, when the owning event commits, then Customer email and in-app notifications are queued once and delivery failure cannot roll back the source state. | `approved-requirement` |
| AT-221 | Given an evidence upload with spoofed MIME/signature, executable/vector/archive type, size/count overflow, malware result, foreign owner, or unauthorized read, when processed, then it is rejected or quarantined without Staff/Warehouse exposure. | `approved-requirement` |
| AT-222 | Given destination data flows through API, persistence, logs, Audit, outbox, Notification, report, and role projections, when inspected, then only the authorized encrypted/full or masked/minimum representation appears and every full read is attributable. | `approved-requirement` |
| AT-223 | Given a COD Order where Carrier evidence proves the Customer paid the full `CODExpectedAmount` at delivery but Carrier remits only part or remits later, when reconciliation runs, then `Payment=Paid` and the evidenced `PaidAt`/`CompletedSaleAt` remain unchanged, a separate settlement-reconciliation work item is opened, and no Refund or second COD portion is created. | `approved-requirement` |
| AT-224 | Given physical delivery with no conclusive proof that `CustomerCollectedAmount = CODExpectedAmount`, when recorded, then `Order=Delivered`, `Payment=Unpaid`, one `CODDiscrepancy` opens, and no normal after-sales payout path opens; a settlement delay alone does not satisfy this condition. | `approved-requirement` |
| AT-225 | Given conclusive evidence that `0 < CustomerCollectedAmount < CODExpectedAmount` and Warehouse has accounted for every returned line, when recovery is finalized, then exactly one server-derived COD-recovery Refund equal to `CustomerCollectedAmount` is created after destination verification; Customer and Staff have no amount field. | `approved-requirement` |
| AT-226 | Given any duplicate Carrier collection/settlement callback, retry, or attempted split/installment COD input, when processed, then the existing evidence/reconciliation result is returned, no second COD portion or duplicate Refund is created, and the fixed `CODExpectedAmount` is unchanged. | `approved-requirement` |

## 12. Preliminary G3 Traceability Matrix

| Decision ID | Requirement ID | Slice/use case | Interface or API | Implementation location | Acceptance test ID | Evidence | Status |
|---|---|---|---|---|---|---|---|
| BD-110 | BR-106, BR-107 | SL-001 request/hold; SL-004 COD reconciliation | Customer after-sales submit; Staff COD reconciliation; payout readiness | Return/Refund, Staff Order, Payment, CODDiscrepancy models/services/routes/UI | AT-205 through AT-208 | Local packages plus current conflicting Staff COD/Return services | ready |
| BD-111 | BR-108, BR-119 | SL-004 delivery/COD; SL-009 report | COD evidence ingestion; CompletedSale projection | Fulfillment/payment/report services and immutable event storage | AT-207, AT-208, AT-218 | Current report uses mutable current state | ready |
| BD-112 | BR-109, BR-110 | SL-002 no-stock/conversion; SL-001 handoff | Exchange decision/choice/conversion APIs; Return handoff | New Exchange case/lineage/reservation orchestration plus Return/Inventory integration | AT-209 through AT-212 | No Exchange implementation currently exists | ready |
| BD-113 | BR-111, BR-112 | Shared after-sales guard | Return/Exchange submit and terminal completion | After-sales lock, physical-unit lineage, Order detail UI | AT-213, AT-214 | Existing combined flow does not model replacement lineage/windows | ready |
| BD-114 | BR-113 through BR-115 | SL-003 payment/refund; SL-009 reporting | Provider callback/reconciliation; Refund list/detail; settlement projection | PaymentAttempt, Refund, payment service, report service | AT-215 through AT-217 | Current one-Order refund record and mutable attempt status conflict | ready |
| BD-115 | BR-116 | SL-002 shipping payer | Staff Exchange decision/status only | Exchange model/service/UI; no payment adapter | SL-002 AT-031, AT-038 | Must prevent accidental money fields during implementation | ready |
| BD-116 | BR-117, BR-118 | SL-001/002 evidence/destination | Upload/read; secure destination; role projections | Upload/storage validation, Return destination model/service, logging/outbox serializers | AT-221, AT-222 | Current generic upload and destination implementation do not satisfy this profile | ready |
| BD-117 | BR-106 through BR-108, BR-113 through BR-115, BR-121 | SL-003/004 COD collection versus Carrier settlement | Carrier collection/settlement ingestion; COD discrepancy/reconciliation; payment/refund projections | Separate collection and settlement evidence models/services; Payment/CompletedSale/Refund guards; Staff reconciliation UI | AT-223 through AT-226 | Current terminology can conflate delayed remittance with Customer under-collection | ready |
| BD-050, BD-101 | BR-120 | SL-004/009 notification handoff | Failed-attempt/reschedule and DeliveryFailed event consumers | DomainOutbox, Notification, EmailOutbox/templates | AT-220 | SL-009 matrix previously omitted these SL-004-required events | ready |

The reconciled Google SRS revision has been read back. G3 remains `ready`, not `passed`, until every row is expanded to exact API contracts, model/service/UI locations, planned red-test files, and release evidence.

## 13. Applied Local Package Addenda

1. `SL-001` now records the COD hold, the distinction between Customer collection and Carrier settlement, conversion lineage, terminal resubmission rules, and `BR-RR-13`/`BR-RR-16` G3 traceability.
2. `SL-002` now records explicit no-stock choice/wait states, atomic conversion mechanics, off-system shipping settlement, common evidence security, and `BD-015` G3 traceability.
3. `SL-003` now separates primary payment from multiple Refund obligations, aggregate settlement, and Carrier remittance reconciliation.
4. `SL-004` now records explicit CODDiscrepancy resolution states, Customer-collection versus Carrier-settlement facts, and after-sales hold effects.
5. `SL-006` now distinguishes public best sellers from the historical Admin gross report.
6. `SL-009` now records later COD CompletedSale timing, distinct Refund obligations, and failed-attempt/reschedule plus DeliveryFailed notification rows.
7. `SL-005`, `SL-007`, and `SL-008` now point to the reconciled SRS revision; their package-owned rules are unchanged because CR-001 only binds their referenced shared Inventory, security, and privacy boundaries.

## 14. Confirmed Conflicts Closed by This Revision

1. `SL-004 BR-041` allowed `Delivered + Unpaid`, while `SL-001` could derive and pay a full Refund from any Delivered Order.
2. `SL-002` mentioned no-stock wait/conversion but lacked an initial no-stock state, atomic handoff boundary, remaining-goods deadline, and Inventory-lineage rule.
3. The one-active-case rule did not define which terminal outcomes release the lock or which deadlines apply afterward.
4. `SL-003` permitted multiple excess-transaction Refunds while the current data model and order-level payment label can represent only one mutable pending refund cleanly.
5. Google SRS public best-seller wording conflicted with the approved distinction between the SL-006 current public projection and SL-009 historical report.
6. `SL-009` omitted SL-004-required failed-attempt/reschedule and DeliveryFailed Customer notifications.
7. Evidence upload and refund destination security were not testable enough to enter G4 safely.
8. `SL-002` shipping payer could be misread as a GreenHouse charge despite the approved no-money Exchange boundary.
9. The older phrase “COD chưa thu đủ” could be misread as a normal split-payment feature or as a Carrier remittance delay; v2.1 now defines fixed COD, separate collection/settlement facts, and the only exceptional recovery path.

## 15. Quality Gate and Next Phase

| Artifact | Status | Evidence still required for `passed` |
|---|---|---|
| G0 Authority | passed | SRC-055 through SRC-059 and named Project Business Approver are recorded |
| G1 Actors | passed | Section 4 preserves package actor ownership and forbidden actions |
| G2 Requirements | passed | Sections 5–11 define triggers, guards, alternatives, calculations, invariants, permissions, states, and acceptance examples |
| G3 Traceability | ready | Exact API/code/test/evidence rows; the reconciled Google SRS revision and local addenda are already read back/verified |
| G4 Red tests | not-started | Observe AT-205 through AT-226 fail for the approved reasons |
| G5 Implementation | not-started | Minimal coherent implementation and relevant regression evidence |
| G6 Actor acceptance | not-started | Customer, Staff/CSKH, Warehouse, Admin, Carrier, and payOS handoff walkthroughs |
| G7 Release closure | not-started | SRS, tests, code, deployed behavior, and residual-gap reconciliation |

Archived SWR guidance requires requirements to be derived from business rules, complete, consistent, verifiable, and connected through a traceability matrix. Archived SWD guidance models state-dependent behavior through explicit current state, event, guard, action, and next state. Those sources guide the artifact structure only; GreenHouse policy comes from SRC-055 and the already approved package decisions.

No code or migration begins from this document alone. The bounded package addenda and Google SRS v2.1 clarification are complete; the immediate next step is exact G3 interface/code/test mapping, followed by G4 red tests before implementation.
