# SL-001 Return/Refund Design

**Date:** 2026-07-22

**Status:** Business design approved; implementation not started

**Business approver:** Project Business Approver (user in this Codex task)

**Implementation baseline:** `2cd0b9518b42a6d1860951b20cdcfdfa2e398ca5`

**SRS baseline:** Google Docs revision `AIroW372r8j-BncuGRhIEqFwCQa2PLXsnMT53H_cxn5r7E_t-NkRjh2gJg2UEves9dhsAFtoTr0qoSWM8Lt1qYAOQzSFBEWVaj2Ap2eXHQI`; one tab `t.0`; read back 2026-07-23

## 1. Scope and Gate Status

`SL-001` starts when an authenticated Customer selects **Return/Refund** for one owned `Delivered` Order and ends only when the whole Order has been received and classified, the fixed refund has been verifiably paid, the request is `Completed`, and the Order is `Returned`.

Exchange is outside this slice and is governed by `SL-002`. One Order may have only one active after-sales case across Return/Refund and Exchange.

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Next evidence |
|---|---|---|---|---|---|---|---|---|---|
| SL-001 | passed | passed | passed | ready | not-started | not-started | not-started | not-started | Complete exact G3 API/interface/code/test/release-evidence mapping against the reconciled SRS revision |

No unresolved business decision remains inside `SL-001`.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-001 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Google Docs revision `AIroW372r8j-BncuGRhIEqFwCQa2PLXsnMT53H_cxn5r7E_t-NkRjh2gJg2UEves9dhsAFtoTr0qoSWM8Lt1qYAOQzSFBEWVaj2Ap2eXHQI`; one tab `t.0`; read back 2026-07-23 | Candidate UC-CS-12, FR-RR, BR-RR, state, and acceptance text plus the adopted CR-001 v2.1 addendum | Candidate source except where an approved decision adopts it; CR-001 v2.1 is normative for its bounded cross-slice rules | SRS contributors; Project Business Approver approves policy | Legacy paragraphs remain candidate; the normative v2.1 addendum supersedes conflicting Return/COD wording |
| SRC-002 | Explicit approvals in this Codex task | 2026-07-22 | BD-001 through BD-005 | Normative business authority for the first SL-001 decisions | Project Business Approver | Approver display name is not recorded |
| SRC-003 | Repository `D:\GreenHouse_System-main` | HEAD `2cd0b9518b42a6d1860951b20cdcfdfa2e398ca5`; inspected 2026-07-22 | Current Return/Refund routes, models, services, UI, and tests | `observed-behavior` only | Engineering team | Current inspection, Inventory, destination, payout, and amount-presentation behavior conflict with this design |
| SRC-004 | `docs/RETURN_REFUND_RECONCILIATION.md` | Repository baseline above | Existing local implementation boundary | Historical design evidence only | Engineering team | Its no-Inventory-mutation inspection rule conflicts with BD-001 |
| SRC-005 | [payOS API](https://payos.vn/docs/api/) and [Node SDK](https://payos.vn/docs/sdks/back-end/node/) | Accessed 2026-07-22 | Payout destination, idempotency, validation, processing, and reconciliation capabilities | Provider evidence, not GreenHouse business authority | payOS | Payout is not an assumed reversal to the original payer account |
| SRC-006 | Archived SWR material, Hassan Gomaa Chapter 6 and SWR Chapter 17 | Local archive accessed 2026-07-22 | Actor/use-case structure and validation guidance | Method guidance only | SWR archive | Does not decide GreenHouse policy |
| SRC-017 | Fast-track approvals of BD-006, BD-007, and BD-008 in this Codex task | 2026-07-22 | Staff discretion with reason/evidence, request and handoff deadlines, and secure-form timing | Normative business authority for the remaining SL-001 decisions | Project Business Approver | Supersedes the unresolved markers in `SL-001_RETURN_REFUND_G2_DRAFT.md` |
| SRC-024 | Approved `SL-002 Exchange Design` and its explicit approval source SRC-012 | Commit `fbe9c57`; 2026-07-22 | BD-021 one-active-after-sales-case boundary shared with Return/Refund | Normative cross-slice authority for BR-RR-13 | Project Business Approver | The 2026-07-22 SRS snapshot lacked the shared guard; current SRC-001 contains the bounded CR-001 v2.1 closure |
| SRC-055 | [`CR-001 v2.1`](2026-07-23-cr-001-cross-slice-business-closure-v2.md) | Approved 2026-07-23 | COD after-sales hold, separate Customer collection/Carrier settlement facts, Exchange conversion lineage, terminal-case resubmission, independent money obligations, and shared sensitive-data constraints | Normative cross-slice authority | Project Business Approver | Refines package handoffs without changing the normal paid whole-Order Return amount |

## 3. Approved Business Decision Log

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-001 | SL-001 | Which lifecycle is normative? | Atomic whole-Order lifecycle; current split lifecycle | Whole-Order return with atomic Warehouse receipt, Inventory movements, one Return Refund obligation, and payout handoff | Prevent partial receipt, lost stock, duplicate Return Refund, and inconsistent state | Project Business Approver | 2026-07-22 | BR-RR-01, BR-RR-02, BR-RR-07 through BR-RR-14 |
| BD-002 | SL-001 | Who owns each responsibility? | Shared ownership; explicit Customer/Staff/Warehouse/payOS boundaries | Customer initiates and confirms destination; Staff/CSKH decides and verifies; Warehouse inspects; payOS executes authorized Payout; System enforces rules | Make permissions, prohibitions, handoffs, and failures testable | Project Business Approver | 2026-07-22 | All SL-001 requirements |
| BD-003 | SL-001 | How is the refund destination obtained? | Payer data; separate CSKH actor; secure Customer form | CSKH is Staff. Staff opens a secure authenticated form; Customer confirms bank destination; payout waits for `Received + DestinationVerified` | Avoid unknown destinations and keep Warehouse outside financial personal data | Project Business Approver | 2026-07-22 | BR-RR-05, BR-RR-06, BR-RR-09, BR-RR-15 |
| BD-004 | SL-001 | What is valid destination data and who bears wrong-data responsibility? | Customer always; Shop always; causation-based | Store an immutable Customer-confirmed snapshot. Staff may verify/reject but not edit. Customer bears direct consequence only when the exact wrong Customer-confirmed snapshot was used; Staff/System/payOS mismatch is not Customer responsibility | Tie responsibility to attributable evidence and prevent automatic duplicate payout | Project Business Approver | 2026-07-22 | BR-RR-06, BR-RR-10, BR-RR-11 |
| BD-005 | SL-001 | Where is the refund amount shown? | Every form; read-only form; final receipt only | Customer forms neither display nor accept the amount. Backend derives `Order.TotalAmount`; final receipt shows actual transferred amount | Avoid implying Customer control while preserving final evidence | Project Business Approver | 2026-07-22 | BR-RR-02, BR-RR-12 |
| BD-006 | SL-001 | Who decides acceptable reasons? | Fixed catalogue; automated policy; Staff judgment | Customer supplies free-text reason and evidence. System checks completeness and eligibility, not the truth of the reason. Staff decides and records a reason | Preserve business discretion while keeping each decision attributable | Project Business Approver | 2026-07-22 | BR-RR-03, BR-RR-04 |
| BD-007 | SL-001 | What are the request and physical-handoff deadlines? | One five-day deadline; no handoff deadline; separate deadlines | Submit at or before `DeliveredAt + 5 days`. After approval, hand off to carrier/shop at or before `ShipByAt = ApprovedAt + 3 days`. Timely handoff proof controls; Warehouse receipt may occur later | A day-five request still needs time to ship, while approved cases cannot remain open indefinitely | Project Business Approver | 2026-07-22 | BR-RR-01, BR-RR-04 |
| BD-008 | SL-001 | When is the destination form opened? | Initial request; after approval; outside System | Open only after Staff approval, through the authenticated Customer account, in parallel with physical return | Minimize financial-data exposure without delaying the return | Project Business Approver | 2026-07-22 | BR-RR-05, BR-RR-06 |

## 4. Actor Responsibility Matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Customer | Return one eligible whole Order and receive one traceable refund | Submit request; submit evidence; hand off goods; submit and explicitly confirm destination versions | Decide eligibility; edit quantities or amount; inspect goods; mark payout complete; access another Customer's case | Creates `New` request and destination submissions; supplies handoff proof | Own Order, request, evidence, masked status, and own destination input | Request/evidence to Staff; goods to Warehouse through carrier/shop; destination to Staff verification | Invalid/late input is rejected; missed `ShipByAt` expires the case; wrong confirmed destination opens recovery without automatic second payout |
| Staff / CSKH | Decide eligibility and coordinate the Customer and payout | Approve/reject; open destination form; verify/reject destination; reconcile payOS; perform authorized manual fallback | Edit Customer-confirmed destination; inspect or classify stock; choose refund amount; mark success without evidence | `New -> Approved/Rejected`; destination `Submitted -> Verified/Rejected`; recovery/reconciliation decisions | Case evidence and authorized financial destination view; no Warehouse quantity mutation | Approved case to Warehouse; verified destination to payout readiness | Rejection records reason; unknown provider result remains unresolved; mismatch opens recovery |
| Warehouse Manager | Receive and classify the complete returned Order | Confirm physical receipt and complete per-line inspection | Decide eligibility; view bank data; change amount; execute payout | Atomic `Approved -> Received` goods outcome after all invariants pass | Order lines, quantities, condition evidence, Inventory; no destination data | Receipt outcome to System refund-readiness join | Missing line, quantity mismatch, stale state, or write failure commits nothing and leaves `Approved` |
| payOS | Execute an authorized Payout and return provider evidence | Process idempotent payout commands | Decide eligibility; derive destination from payer data; change amount; mutate Inventory | Provider processing outcome only; verified success supports `Refunded` | Exact authorized amount and destination; provider reference and status output | Provider evidence to System and Staff reconciliation | Processing, failure, timeout, or unknown never means `Refunded` |
| GreenHouse System | Enforce the approved lifecycle safely | Eligibility evaluation, idempotent commands, atomic receipt, payout orchestration, notifications | Replace an actor-owned approval or Customer confirmation | Mechanical transitions only when actor action and guards are valid | Minimum data needed per role; immutable and append-only evidence | Coordinates all actor handoffs | Rolls back grouped writes; retains achieved independent prerequisites; retries notification without duplicating business effects |

Admin, engineering owners, and the Project Business Approver are not runtime actors in an individual Return/Refund case.

## 5. Business Slice Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-001 | Customer returns one eligible whole Delivered Order and receives one traceable refund | Customer selects **Return/Refund** from owned Order history/detail | Authenticated owner; `Delivered`; current time `<= ReturnDeadlineAt`; no active after-sales case | Execute UC-RR-01 through Staff decision, handoff, destination verification, Warehouse receipt, payout, and completion | Apply AF-RR-01 through AF-RR-15 without bypassing guards | Whole Order; `RefundAmount = Order.TotalAmount`; `ShipByAt = ApprovedAt + 3 days`; exact verified destination; one Return Refund obligation; idempotent attempts | No payout before `Received + DestinationVerified`; no partial receipt commit; primary `Paid` remains distinct; no `Refunded` without evidence; no duplicate business effect | Actor matrix above | AT-001 through AT-018 | `approved-requirement` |

## 6. Normative Requirements

| Requirement ID | Approved requirement | Source |
|---|---|---|
| BR-RR-01 | Customer may create a request only for one owned `Delivered` Order at or before immutable `ReturnDeadlineAt = DeliveredAt + 5 days`. | BD-001, BD-007 |
| BR-RR-02 | Normal paid-Return scope is the complete Order. Backend derives its whole-Order `RefundAmount = Order.TotalAmount`; no actor may choose or alter it. This whole-Order Return Refund is created only after verified full Customer collection. CR `BR-107` separately governs the exceptional COD-recovery Refund equal to verified `CustomerCollectedAmount` after complete goods recovery; a Carrier settlement delay or partial remittance is not a partial Customer collection and creates no Refund; zero Customer collection creates no Refund. | BD-001, BD-005, BD-110, BD-117 |
| BR-RR-03 | Customer must provide a free-text reason and at least one successfully stored evidence attachment. System validates completeness, not substantive truth. | BD-006 |
| BR-RR-04 | Staff alone approves or rejects with a recorded reason. Approval creates immutable `ShipByAt = ApprovedAt + 3 days`. Timely carrier/shop handoff proof satisfies the deadline; no proof expires the case without refund or Inventory change. | BD-006, BD-007 |
| BR-RR-05 | Only after approval, System exposes the secure destination form to the authenticated owning Customer; it may be completed in parallel with shipping. | BD-003, BD-008 |
| BR-RR-06 | A destination version contains required bank, account-number, account-holder confirmation, responsibility notice, and explicit Customer confirmation. Staff may verify or reject with reason but cannot edit; correction creates a new version. | BD-003, BD-004, BD-008 |
| BR-RR-07 | Warehouse must record every purchased line exactly once and enforce `ReceivedQuantity = PurchasedQuantity` and `SellableQuantity + DamagedQuantity = ReceivedQuantity` with non-negative integers. | BD-001, BD-002 |
| BR-RR-08 | One atomic Warehouse outcome creates sellable and damaged Inventory transactions, changes the request to `Received`, and creates exactly one Return Refund obligation. The accepted primary collection remains `Paid`; the separate Refund is `Pending` and aggregate `MoneyObligationsSettled=false` until verified resolution. Any failure commits none of those effects. | BD-001, BD-114 |
| BR-RR-09 | Payout readiness requires both `Received` and `DestinationVerified`. Payout uses the exact immutable destination snapshot and backend amount under one idempotency identity. | BD-001, BD-003, BD-004 |
| BR-RR-10 | Provider processing, failure, timeout, or unknown remains non-terminal and append-only. Manual transfer is allowed only after reconciliation clears duplicate-payment risk and uses the same snapshot with processor/reference/amount/time evidence. | BD-001, BD-003 |
| BR-RR-11 | If the exact wrong Customer-confirmed snapshot was used, no automatic second payout is made and Staff opens recovery. If Staff/System/payOS altered or misrouted it, Customer is not responsible. | BD-004 |
| BR-RR-12 | Request and destination forms neither display nor accept amount. Final receipt/notification shows actual transferred amount and masked destination. | BD-005 |
| BR-RR-13 | One active after-sales case is allowed per Order across Return/Refund and Exchange; duplicate commands return the existing case or deterministic conflict without duplicate effects. | BD-001, BD-021 |
| BR-RR-14 | Normal paid-Return completion requires goods `Received`, the Return Refund obligation `Refunded`, the accepted primary collection still `Paid`, aggregate `MoneyObligationsSettled=true`, request `Completed`, and Order `Returned` exactly once. A Carrier settlement mismatch does not change a valid primary `Paid` fact. CR `BR-107` owns the separate Customer under-collection recovery closure. | BD-001, BD-110, BD-114, BD-117 |
| BR-RR-15 | Warehouse never receives refund-destination data; Customer sees only owned cases; full destination values are restricted to authorized Staff and masked elsewhere. | BD-002, BD-003 |
| BR-RR-16 | Notification failure does not roll back a committed decision, receipt, payout, or completion; retry must not repeat the business effect. | BD-001, BD-002 |

## 7. UC-RR-01 — Request Return/Refund

### Preconditions

1. Customer is authenticated and owns the Order.
2. Order is `Delivered` and current time is on or before `ReturnDeadlineAt`.
3. No active Return/Refund or Exchange case exists for the Order.

### Main Flow

1. Customer opens the owned Order and selects **Return/Refund**.
2. System shows the complete Order, deadline, and conditions without an amount field.
3. Customer enters a reason, uploads evidence, confirms whole-Order return, and submits.
4. System revalidates ownership, status, deadline, completeness, and duplicate constraints.
5. System creates exactly one `New` request; Order, payment, and Inventory remain unchanged.
6. Staff reviews the reason and evidence and approves with a recorded reason.
7. System sets `ApprovedAt` and immutable `ShipByAt = ApprovedAt + 3 days`.
8. System opens the secure destination form to the authenticated Customer.
9. Customer confirms a destination version; Staff verifies it without editing.
10. Customer hands the complete Order to carrier/shop by `ShipByAt` and supplies proof.
11. Warehouse receives and records every line's sellable and damaged quantities.
12. System validates all invariants and commits the atomic `Received`/Inventory/Refund outcome.
13. When `Received + DestinationVerified` are both true, System starts or resumes the idempotent payout workflow.
14. Verified automatic or manual success sets the Return Refund obligation to `Refunded` once, retains the accepted primary collection as `Paid`, and updates aggregate settlement without substituting the payment state.
15. System completes the request and sets the Order to `Returned` once.
16. System issues the final receipt/notification with actual amount and masked destination.

### Alternative and Failure Paths

| Branch | Condition | Required outcome |
|---|---|---|
| AF-RR-01 | Foreign Order | Deny access and reveal no case data |
| AF-RR-02 | Non-Delivered or after `ReturnDeadlineAt` | Reject with no business-state change |
| AF-RR-03 | Active after-sales case or concurrent duplicate | Return existing case or deterministic conflict; create no second case |
| AF-RR-04 | Missing reason/evidence | Reject incomplete submission; Staff does not receive a decision task |
| AF-RR-05 | Staff rejects | `New -> Rejected` with reason; Order remains `Delivered/Paid`; no Refund or Inventory change |
| AF-RR-06 | No handoff proof by `ShipByAt` | `Approved -> Expired`; no refund or Inventory change; no automatic revival |
| AF-RR-07 | Proof is timely but integration arrives late | Staff reconciles using carrier/shop timestamp and audited evidence |
| AF-RR-08 | Invalid/unsupported destination | Keep `WaitingForRefundInfo`; require a new Customer-confirmed version |
| AF-RR-09 | Staff attempts to edit destination | Deny and audit |
| AF-RR-10 | Only `Received` or only `DestinationVerified` exists | Retain achieved prerequisite; do not start payout |
| AF-RR-11 | Missing line, invalid quantity, stale update, or grouped write failure | Roll back receipt group; remain `Approved`; create no Refund or Inventory movement |
| AF-RR-12 | payOS outcome is processing, failed, timed out, or unknown | Remain non-terminal; append attempt; reconcile before retry/fallback |
| AF-RR-13 | Duplicate payout, callback, retry, or completion command | Return/reconcile existing result; repeat no side effect |
| AF-RR-14 | Exact wrong Customer-confirmed destination was paid | No automatic second payout; open traceable recovery |
| AF-RR-15 | Staff/System/payOS caused mismatch | Do not assign Customer responsibility; block false completion and correct/recover with evidence |
| AF-RR-16 | Order is physically `Delivered` but full `CustomerCollectedAmount` is not verified | Record one timely `AwaitingCODReconciliation` request. Verified full Customer collection releases the normal flow. A late/partial Carrier remittance after full Customer collection opens only settlement reconciliation and does not hold the case. Verified Customer under-collection enters `CODRecoveryInProgress`: recover/account all goods once; zero closes `ClosedByCODRecovery` with no Refund, while a positive verified `CustomerCollectedAmount` uses one exact server-derived COD-recovery Refund and closes only after verified payout. Unresolved collection evidence stays held |
| AF-RR-17 | Linked Exchange converts after Warehouse/Inventory effects already occurred | Reuse immutable physical-unit and movement identities; request only remaining Customer-held goods; never post the same Inventory movement twice |
| AF-RR-18 | Prior case is Rejected, Customer-cancelled, or Expired | Release the active lock; permit a new case only before/equal to the applicable immutable deadline with a new reason, evidence, and idempotency identity |

## 8. State and Data Invariants

Return Request business states are `AwaitingCODReconciliation`, `CODRecoveryInProgress`, `ClosedByCODRecovery`, `New`, `Approved`, `Rejected`, `Expired`, `Received`, and `Completed`. Destination and Refund have independent lifecycles; they must not be compressed into Return Request state. `ClosedByCODRecovery` is the CR-only terminal exception for a delivered COD Order whose `CustomerCollectedAmount` was conclusively below fixed `CODExpectedAmount` and whose goods plus any verified Customer-collected balance were recovered. Carrier settlement reconciliation is a separate work item, not a Return Request state.

Key invariants:

1. `New -> Approved/Rejected` only by Staff.
2. `Approved -> Expired` only when `ShipByAt` passes without valid handoff proof.
3. `Approved -> Received` only through the atomic Warehouse outcome.
4. `Received -> Completed` only after verified payout success.
5. Order remains `Delivered` until final completion; approval and receipt alone do not make it `Returned`.
6. Refund status never proves goods receipt, and goods receipt never proves payout.
7. All decisions, destination versions, inspection values, Inventory transactions, payout attempts, reconciliation, and recovery evidence are append-only and attributable.
8. `AwaitingCODReconciliation -> New` is permitted only after evidence proves `CustomerCollectedAmount = CODExpectedAmount = Order.TotalAmount`. A Carrier remittance delay does not block this transition once full Customer collection is proved. Conclusively verified Customer under-collection moves to `CODRecoveryInProgress`; it reaches `ClosedByCODRecovery` only after complete goods accounting and, for a positive Customer-collected balance, one exact verified COD-recovery Refund. Unknown/contradictory/disputed collection evidence remains held and creates no whole-Order Return Refund.
9. A conversion from Exchange references existing Warehouse/Inventory lineage and may create movements only for remaining unprocessed physical units.
10. Rejected, Customer-cancelled, and Expired cases release the active lock; Completed Return permanently closes whole-Order after-sales.

## 9. Customer, Staff, and Warehouse UI Contract

- Customer Order detail exposes one **Đổi/Trả hàng** entry and then the separate Return/Refund option when eligible.
- Return request shows whole-Order items, deadline, reason, and evidence; it has no amount input or display.
- Secure destination form appears only for an owned approved request and has no amount input or display.
- Staff sees case evidence, decision controls, destination verification, payout/recovery state, and masked/full destination only according to authorization.
- Warehouse sees only the minimum Order-line and condition evidence needed for receipt; no bank, amount-selection, or payout controls.
- Repeated submit displays processing or already-recorded feedback and links to the existing case.
- A COD recovery view shows whether money evidence, goods recovery, Warehouse accounting, destination verification, or the server-derived COD-recovery Refund is still outstanding; it never asks Customer or Staff to enter the amount.

## 10. Acceptance Examples

| AT ID | Given / When / Then evidence | Classification |
|---|---|---|
| AT-001 | Given an eligible owned Delivered Order, when Customer submits complete whole-Order reason/evidence at or before the deadline, then exactly one `New` request is created and no amount field, Refund, or Inventory change exists. | `approved-requirement` |
| AT-002 | Given foreign, non-Delivered, late, partial, active-case, completed-return, or concurrent duplicate input, when submitted, then no additional case or business state change is created. | `approved-requirement` |
| AT-003 | Given a New case, when Staff rejects with reason, then it becomes `Rejected` and Order remains `Delivered/Paid` with no Refund or Inventory change. | `approved-requirement` |
| AT-004 | Given complete Customer reason/evidence, when Staff approves with reason, then only `New -> Approved` occurs and `ShipByAt = ApprovedAt + 3 days` is stored. | `approved-requirement` |
| AT-005 | Given no handoff proof by `ShipByAt`, when deadline processing occurs, then the case expires once and no refund or Inventory mutation occurs. | `approved-requirement` |
| AT-006 | Given timely carrier/shop proof received late by System, when Staff reconciles it, then the original handoff timestamp controls and the reconciliation is audited. | `approved-requirement` |
| AT-007 | Given a non-approved case or foreign Customer, when destination form access is attempted, then access is denied and no financial data is revealed. | `approved-requirement` |
| AT-008 | Given invalid or unsupported destination input, when submitted, then it is not verified and correction requires a new Customer-confirmed version. | `approved-requirement` |
| AT-009 | Given a confirmed destination, when Staff attempts to edit it, then the write is denied and audited. | `approved-requirement` |
| AT-010 | Given only `Received` or only `DestinationVerified`, when readiness is evaluated, then payout does not start and the achieved prerequisite remains. | `approved-requirement` |
| AT-011 | Given every purchased line exactly once with valid quantities, when Warehouse confirms, then one atomic commit records Inventory, `Received`, one pending Return Refund obligation, retained primary `Paid`, and aggregate unsettled state. | `approved-requirement` |
| AT-012 | Given a missing line, invalid quantity, stale state, or injected grouped-write failure, when Warehouse confirms, then the group rolls back and the case stays `Approved`. | `approved-requirement` |
| AT-013 | Given `Received + DestinationVerified`, when payout starts, then payOS/manual processing uses exact immutable snapshot and `Order.TotalAmount` under one idempotency identity. | `approved-requirement` |
| AT-014 | Given a processing, failed, timeout, or unknown payout outcome, when reconciled, then Refund is not `Refunded` and no unsafe duplicate fallback occurs. | `approved-requirement` |
| AT-015 | Given authorized manual fallback after reconciliation, when complete transfer evidence matches the snapshot and amount, then the same Refund completes once. | `approved-requirement` |
| AT-016 | Given the exact wrong Customer-confirmed destination was paid, when reported, then no automatic second payout is created and Staff opens recovery. | `approved-requirement` |
| AT-017 | Given Staff/System/payOS changed or misrouted the destination, when reconciled, then Customer is not assigned responsibility and false completion is blocked/corrected. | `approved-requirement` |
| AT-018 | Given verified payout success and processed goods, when completion or notification is retried, then exactly one `Refunded/Completed/Returned` outcome and one final receipt exist. | `approved-requirement` |

## 11. Preliminary G3 Traceability and Known Conflicts

| Decision | Requirements | Use case/interface | Current implementation evidence | Acceptance | Status |
|---|---|---|---|---|---|
| BD-001, BD-006, BD-007 | BR-RR-01 through BR-RR-04 | Customer request; Staff decision; handoff | Current request service has no complete five-day/three-day lifecycle | AT-001 through AT-006 | ready |
| BD-003, BD-004, BD-008 | BR-RR-05, BR-RR-06, BR-RR-09 through BR-RR-11, BR-RR-15 | Destination form; Staff verification; payout/recovery | Current models contain no immutable verified destination versions | AT-007 through AT-010, AT-013 through AT-017 | ready |
| BD-001, BD-002 | BR-RR-07, BR-RR-08, BR-RR-14 | Warehouse inspection; Inventory; completion | Current service permits partial receipt and does not perform approved atomic Inventory outcome | AT-011, AT-012, AT-018 | ready |
| BD-005 | BR-RR-02, BR-RR-12 | Customer forms; final receipt | Current Staff flow accepts refund amount and current Customer form presentation conflicts | AT-001, AT-013, AT-018 | ready |
| BD-001, BD-021 | BR-RR-13 | Shared Return/Exchange active-case guard | Current combined flow lacks approved cross-use-case lock and terminal release rules | AT-002; CR AT-213, AT-214 | ready |
| BD-001, BD-002 | BR-RR-16 | Decision, receipt, payout, completion notification outbox | Current notification calls are not one complete idempotent after-sales contract | AT-018; CR AT-220 | ready |
| BD-110, BD-112, BD-113, BD-116, BD-117 | CR BR-106 through BR-108, BR-110 through BR-112, BR-117, BR-118, BR-121 | COD hold; collection/settlement separation; conversion handoff; resubmission; evidence/destination security | Return/Refund, Payment, Carrier reconciliation, Inventory, upload, destination, and shared lock surfaces | CR AT-205 through AT-214, AT-221 through AT-226 | ready; governed by SRC-055 |

Before implementation, G3 must map every row to exact SRS paragraphs, API contracts, model/service/UI locations, red tests, and release evidence. Existing passing tests remain `observed-behavior` until reconciled with this design.

## 12. CR-001 v2.1 Cross-Slice Addendum

1. `BR-RR-01` preserves a timely Customer request for `Delivered + Unpaid`, while SRC-055 holds the normal after-sales flow pending Customer-collection reconciliation.
2. `BR-RR-02` remains the normal whole-Order rule: the fixed Return Refund equals `Order.TotalAmount` only after verified full Customer collection. A Carrier settlement delay is not under-collection. Verified Customer under-collection uses the separate recovery outcome in CR `BR-107`: zero Customer collection creates no Refund; a positive verified Customer-collected balance is refunded exactly after complete goods recovery.
3. Exchange conversion transfers the active lock and timely instant atomically, reuses prior physical/Inventory facts, and gives `SL-001` exclusive ownership of destination, Refund, payout, and remaining-goods completion.
4. Terminal resubmission and replacement-unit windows follow CR `BR-111/BR-112`; completion of a whole Return permits no later after-sales case.
5. Evidence and destination data must satisfy CR `BR-117/BR-118` before G4 tests or implementation can pass.

## 13. Method Basis and Next Phase

The archived SWR guidance requires functional requirements to be structured by actors and use cases and validated for correctness, completeness, consistency, feasibility, and verifiability. GreenHouse policy in this document comes only from the Project Business Approver, not from the archive or current code.

No implementation plan or code change is authorized by this document alone. CR-001 v2.1 records the completed cross-system closure and COD terminology/settlement clarification; the next step is exact G3 mapping before red tests or implementation.
