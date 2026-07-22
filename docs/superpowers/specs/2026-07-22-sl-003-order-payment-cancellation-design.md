# SL-003 Order, Payment, and Cancellation Design

**Date:** 2026-07-22

**Status:** Fast-track business package approved; implementation not started

**Business approver:** Project Business Approver (user in this Codex task)

**Implementation baseline:** `2cd0b9518b42a6d1860951b20cdcfdfa2e398ca5`

**SRS baseline:** Google Docs revision `AIroW37xl-9inybbV_Kt8cUUhLWLjhfImasxQ_JiEqN2hcPklBhnb6W4yZNbueA2tCWVmMd5XfIbQTkiJLGM6ni-TNQx-hc6-YKXxEmQoPE`; Drive revision `4842`

## 1. Scope and Gate Status

`SL-003` covers four connected outcomes:

1. Customer creates exactly one valid Order from one checkout submission.
2. Customer pays an online Order through verifiable payOS evidence or keeps COD unpaid until delivery.
3. An eligible Order is cancelled exactly once with its exact reservation released.
4. Any money collected for a cancelled Order or collected in excess enters a traceable refund workflow without reopening the Order.

Physical stock export, packing, shipping, and delivery are downstream and will be completed in the fulfillment package. Return/Refund and Exchange remain governed by `SL-001` and `SL-002`.

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Next evidence |
|---|---|---|---|---|---|---|---|---|---|
| SL-003 | passed | passed | passed | ready | not-started | not-started | not-started | not-started | Reconcile the approved package to SRS, interfaces, code, tests, and release evidence |

No unresolved business decision remains inside the approved `SL-003` package.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-018 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Revisions in the document header | Candidate UC-CS-04/05/06/10, UC-ST-02/06, FR-ORD, FR-PAY, BR-ORD, and BR-PAY text | Candidate source only where adopted by the approved package | SRS contributors; Project Business Approver approves policy | Blocks Customer cancellation while payment is Pending/Paid and does not fully model payOS Payout or excess payment |
| SRC-019 | Explicit fast-track approval, “duyệt gói SL-003” | 2026-07-22 | BD-029 through BD-038 and this complete package | Normative business authority for SL-003 | Project Business Approver | Approver display name is not recorded |
| SRC-020 | Repository `D:\GreenHouse_System-main` | HEAD `2cd0b9518b42a6d1860951b20cdcfdfa2e398ca5`; inspected 2026-07-22 | Current Order, Payment, payOS, cancellation, UI, and tests | `observed-behavior` only | Engineering team | Current states, deadline storage, cancellation guards, attempt/refund states, and refund model conflict with this design |
| SRC-021 | [payOS public API](https://payos.vn/docs/api/), [Node SDK](https://payos.vn/docs/sdks/back-end/node/), and [signature guidance](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/) | Accessed 2026-07-22 | Payment links, link cancellation, webhook verification, Payout destination/idempotency/status, and separate signatures | Provider evidence, not GreenHouse business authority | payOS | Cancelling an unpaid link is not a refund of collected money; Payout requires separate destination and configuration |
| SRC-022 | Archived SWR material, Hassan Gomaa Chapter 6 and SWR Chapter 17 | Local archive accessed 2026-07-22 | Actor/use-case structure, alternate paths, consistency, traceability, and acceptance validation | Method guidance only | SWR archive | Does not decide GreenHouse policy |
| SRC-023 | Approved `SL-001` and `SL-002` designs | 2026-07-22 | Shared secure destination, fixed-amount refund, actor privacy, and one-active-after-sales-case boundaries | Normative for referenced cross-slice rules | Project Business Approver | SL-003 cancellation refunds have no Warehouse receipt prerequisite |

## 3. Approved Business Decision Log

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-029 | SL-003 | How is total calculated in the current release? | Variable delivery fee; fixed fee; free delivery | `ShippingFee = 0` and `TotalAmount = sum(OrderDetail.Subtotal)` for the current release; a future fee requires a separate approved package | Remove an unspecified amount component from payment/refund calculations | Project Business Approver | 2026-07-22 | BR-022 |
| BD-030 | SL-003 | Are waiting/expiry payment concepts Order states? | Duplicate Order states; separate Order and Payment states | A pre-confirmation online Order remains `OrderStatus=Pending` while `PaymentStatus/PaymentAttemptStatus` represents waiting or expiry; `WaitingForPayment` and `Expired` are not business Order states | Prevent two state machines from expressing the same fact inconsistently | Project Business Approver | 2026-07-22 | BR-024 |
| BD-031 | SL-003 | What commits during checkout? | Best-effort writes; split writes; atomic and idempotent checkout | Validate and atomically create Order/details/reservations/payment initialization/cart cleanup; repeated idempotency key returns the same Order | Prevent duplicate Orders, partial reservation, and cart/order divergence | Project Business Approver | 2026-07-22 | BR-023, BR-032 |
| BD-032 | SL-003 | How long is online stock held? | No deadline; attempt-only deadline; immutable Order deadline | Store immutable `PaymentDeadlineAt` from the setting effective at Order creation; default setting is 15 minutes; reserve stock until payment, cancellation, or deadline | Protect stock while making existing rights independent of later setting changes | Project Business Approver | 2026-07-22 | BR-025 |
| BD-033 | SL-003 | What evidence controls payOS payment state? | Browser redirect; mutable payment record; verified append-only attempts | One active Pending link at a time; each retry is a new attempt; verified and matched payOS webhook/reconciliation controls payment state; redirects are informational | Browser redirects are not authoritative transaction evidence | Project Business Approver | 2026-07-22 | BR-026 |
| BD-034 | SL-003 | When may Customer self-cancel? | Paid only via Staff; until export; only while Order is Pending | Customer may cancel one owned `Pending` Order, including Paid, with a reason. Non-paid cancellation releases stock; Paid cancellation releases stock and opens the fixed full-refund workflow | Give Customer a deterministic self-service boundary before Staff accepts fulfillment | Project Business Approver | 2026-07-22 | BR-027, BR-029 |
| BD-035 | SL-003 | When may Staff cancel? | Any pre-delivery state; Pending only; Pending/Confirmed before export completion | Staff may cancel `Pending` or `Confirmed` before stock export completes and must record a reason. `Packed` and later cannot be cancelled | Preserve a controlled exception after Customer self-service closes without reversing fulfilled stock | Project Business Approver | 2026-07-22 | BR-028 |
| BD-036 | SL-003 | How is a cancellation refund paid? | Original-source assumption; arbitrary Staff amount; shared secure payout flow | Refund the full captured amount, derived by backend. No Warehouse receipt is required. Use the SL-001 secure destination and payOS Payout/manual evidence workflow; Customer never enters amount | Align financial privacy and evidence while removing an irrelevant goods-return prerequisite | Project Business Approver | 2026-07-22 | BR-029 |
| BD-037 | SL-003 | What happens after late or excess successful payment? | Reopen Order; overwrite accepted attempt; refund each collected transaction | Never reopen a cancelled Order. Every verified paid transaction remains Paid evidence; each excess or post-cancellation collection has its own refund case linked to that provider transaction | Preserve stock safety and complete money reconciliation | Project Business Approver | 2026-07-22 | BR-030 |
| BD-038 | SL-003 | What consistency and feedback rules apply? | Best effort; generic errors; atomic and idempotent effects | Group state/reservation/refund handoff atomically; notifications occur after commit; repeated commands return existing result with clear feedback; email failure never rolls back business state | Prevent partial outcomes and duplicate user actions without silent UI | Project Business Approver | 2026-07-22 | BR-031 through BR-033 |

## 4. Actor Responsibility Matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Customer | Create, pay, view, and cancel only owned eligible Orders | Checkout; select COD/online; start/retry payOS; cancel owned `Pending` Order with reason; submit refund destination after Paid cancellation | Set price, total, status, provider evidence, stock, refund amount, or another Customer's data | Initiates Order creation, PaymentAttempt creation, and eligible Customer cancellation; provider/System performs final mechanical transition | Own cart, delivery input, owned Orders/attempts/refunds, masked destination/status | Checkout to System; payment to payOS; paid cancellation destination to Staff verification | Invalid/stale/foreign input denied; duplicate submit returns existing result; provider uncertainty remains visible without false success |
| Staff / CSKH | Accept fulfillment responsibility and handle controlled cancellation/refund exceptions | Confirm eligible Order; cancel `Pending/Confirmed` before export completion with reason; verify cancellation-refund destination | Confirm unpaid online Order; cancel `Packed` or later; edit provider evidence or Customer-confirmed destination; select refund amount | `Pending -> Confirmed` and eligible Staff cancellation | All operational Orders and minimum payment/refund evidence; authorized financial data only for verification | Confirmed Order to Warehouse; cancelled Paid Order to refund workflow | Stale/exported state rejects cancellation; unknown payment/refund evidence stays unresolved |
| Warehouse Manager | Receive a valid stock-export request in the downstream package | No direct SL-003 command | Create/cancel Customer payment, approve refund, or change Order total | None within SL-003 | Sees confirmed export demand only after handoff | Receives exactly one confirmed export request downstream | No export action is allowed from a cancelled Order |
| payOS | Provide payment-link, webhook, cancellation, and Payout evidence | Process authenticated System requests and send signed webhook data | Decide Order eligibility/cancellation, change GreenHouse amount, or treat browser redirect as final | Provider attempt and payout outcomes only | Exact authorized request fields and provider evidence | Verified results to System reconciliation | Invalid signature/mismatch rejected; processing/unknown remains non-terminal |
| Email Service | Deliver post-commit business notifications | Process queued email requests | Decide or roll back Order, Payment, Inventory, or Refund state | None | Minimum recipient/template payload | Delivery result to retry/audit | Failure is recorded and retried without repeating business effects |
| GreenHouse System | Keep Order, money, and reservation consistent | Validation, atomic commands, idempotency, deadlines, provider matching, audit | Replace Customer/Staff action or invent provider success | Mechanical transitions after actor action and guards | Enforces least privilege and append-only evidence | Coordinates all handoffs | Rolls back grouped writes; reconciles races; returns existing outcome for duplicates |

Admin manages future settings in another package but cannot change an existing Order's immutable `PaymentDeadlineAt`.

## 5. Business Slice Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-003 | Customer creates one Order, establishes payment, or cancels before the approved fulfillment boundary with correct stock and refund consequences | Checkout, payOS action/webhook, cancellation, or payment deadline | Authenticated actor; valid owned/cart/Order state; exact amount; valid reservation; authorized role | Execute UC-ORD-01, UC-PAY-01, or UC-CAN-01 | Apply AF-003 branches without partial or duplicate effects | Free delivery current release; immutable 15-minute-default deadline; exact full cancellation refund; one active Pending payOS link; one refund per excess collection | Order and Payment state remain separate; stock release once; cancelled Order never reopens; provider evidence append-only | Actor matrix above | AT-040 through AT-058 | `approved-requirement` |

## 6. Normative Requirements

| Requirement ID | Approved requirement | Source |
|---|---|---|
| BR-022 | Current release sets `ShippingFee = 0`; `Subtotal = sum(UnitPriceSnapshot * Quantity)` and `TotalAmount = Subtotal`. Payment and refund amount must equal the captured Order total. | BD-029 |
| BR-023 | Checkout must revalidate active products, accepted current price, positive quantity, available stock, payment method, and delivery input; one transaction creates Order, immutable details, exact reservations, initial payment state, and exact cart cleanup. | BD-031 |
| BR-024 | Every new Order uses `OrderStatus=Pending`. COD starts `PaymentStatus=Unpaid`; online starts `PaymentStatus=Pending`. Payment waiting/expiry lives in payment state, not `OrderStatus`. | BD-030 |
| BR-025 | Online Order stores immutable `PaymentDeadlineAt = CreatedAt + PAYMENT_TIMEOUT_MINUTES` using the value effective at creation; default setting is 15 minutes. At or after the deadline without accepted payment, System cancels once and releases the exact reservation once. | BD-032 |
| BR-026 | Each payOS attempt references one owned Order and exact amount. At most one attempt is Pending. Retry creates a new attempt. Only authenticated, matched, idempotent provider webhook/reconciliation may establish Paid/Failed/Cancelled; browser redirect has no final business effect. | BD-033 |
| BR-027 | Customer may cancel only an owned `Pending` Order and must provide a reason. Non-paid cancellation sets Order to `Cancelled`, retires any active payOS link/attempt when possible, and releases exact reservation atomically. Paid cancellation additionally creates the cancellation refund handoff. | BD-034 |
| BR-028 | Staff may cancel `Pending` or `Confirmed` only before stock export completion and with a reason. It must cancel open export demand and release/correct reservation atomically. `Packed`, `Shipped`, `Delivered`, `Returned`, or already `Cancelled` cannot be newly cancelled. | BD-035 |
| BR-029 | A Paid cancellation creates one fixed refund for the accepted captured transaction, sets Order payment to `RefundPending`, opens the authenticated secure destination flow immediately, and requires `Cancelled + DestinationVerified` for payout readiness; Warehouse receipt is not required. | BD-034, BD-036 |
| BR-030 | A verified Paid result after cancellation or deadline never reopens the Order or reservation. Each post-cancellation or excess Paid provider transaction remains immutable Paid evidence and receives its own refund case linked to that transaction. | BD-037 |
| BR-031 | Customer sees only owned Orders, attempts, cancellation refunds, and masked destinations. Staff cannot alter provider evidence, Customer-confirmed destination, or server-derived amount. Warehouse cannot operate payment/refund. | BD-038 |
| BR-032 | Checkout, cancellation, deadline, provider callback, stock release, refund handoff, and payout commands are idempotent and concurrency-safe; grouped business effects commit all or none. | BD-031, BD-038 |
| BR-033 | UI shows Order and Payment statuses separately, derives permitted actions from current server eligibility, disables a pending submit, and returns clear processing/already-recorded feedback. Notifications are queued after commit and failure never reverses business state. | BD-038 |
| BR-034 | Staff may confirm only a `Pending` Order whose online payment is `Paid` or whose COD payment is `Unpaid` and whose exact reservation is intact. One atomic confirmation changes it to `Confirmed` and creates exactly one StockExportRequest; duplicate or stale confirmation creates no second request. | Approved actor boundary, BD-031, BD-038 |

## 7. UC-ORD-01 — Place Order

### Preconditions

1. Customer is authenticated.
2. Cart is non-empty and every item references an active product.
3. Customer supplies valid delivery data, selects COD or online payment, and submits an idempotency key.

### Main Flow

1. Customer reviews cart, delivery details, free shipping, and total.
2. Customer selects COD or online and confirms checkout.
3. System revalidates product status, price, quantity, and available stock.
4. System calculates and snapshots Order detail values and total.
5. In one transaction, System creates one `Pending` Order, exact details, exact reservations, initial Payment/PaymentStatus, immutable online `PaymentDeadlineAt`, and removes exactly purchased cart items.
6. System commits and returns the Order.
7. System queues audit and Order-created notification after commit.
8. For online payment, Customer may start UC-PAY-01 before the deadline.

## 8. UC-PAY-01 — Pay Online

### Preconditions

1. Customer owns the online `Pending` Order.
2. Current time is before `PaymentDeadlineAt`.
3. Order is not Paid or Cancelled and has no active Pending payOS link.

### Main Flow

1. Customer selects **Thanh toán qua payOS**.
2. System creates a new Pending PaymentAttempt for exact `Order.TotalAmount` and requests one payOS link with matching expiry.
3. Customer completes or leaves payOS checkout.
4. Browser return/cancel navigation displays provisional information only.
5. System receives, authenticates, stores, and matches payOS webhook/reconciliation evidence.
6. A first valid matching success marks the attempt Paid and Order payment Paid; Staff may later confirm the Order.
7. A valid failure/cancellation marks only that attempt terminal and allows a new retry before the immutable deadline.

## 9. UC-CAN-01 — Cancel Order

### Customer Path

1. Customer opens an owned `Pending` Order and selects **Hủy đơn**.
2. System shows consequences and requires a reason.
3. Customer confirms.
4. System revalidates ownership, `Pending` status, payment state, reservation, and concurrency.
5. In one transaction, System sets Order `Cancelled`, releases exact reservation once, and:
   - for non-paid payment, retires the active payOS link/attempt when applicable and records no Refund;
   - for Paid payment, preserves Paid transaction evidence, creates one cancellation Refund handoff, and sets Order payment `RefundPending`.
6. System queues notification and audit after commit.
7. For Paid cancellation, System opens the secure destination form; payout follows `Cancelled + DestinationVerified`.

### Staff Path

1. Staff opens `Pending` or `Confirmed` Order and supplies a cancellation reason.
2. System verifies stock export is not completed and state is still eligible.
3. In one transaction, System cancels open export demand, releases/corrects reservation, sets Order `Cancelled`, and creates the Paid refund handoff when needed.
4. System queues notification and audit after commit.

## 10. Alternative and Failure Paths

| Branch | Condition | Required outcome |
|---|---|---|
| AF-003-01 | Empty cart, inactive product, stale price, invalid quantity, insufficient stock, invalid delivery/payment input | Reject checkout; commit no Order, detail, reservation, payment, or cart cleanup |
| AF-003-02 | Duplicate checkout key | Return the existing Order and create no additional effect |
| AF-003-03 | One reservation/write fails inside checkout | Roll back the entire checkout |
| AF-003-04 | Payment link request fails | Mark that attempt Failed with evidence; Order and reservation remain until retry/cancel/deadline |
| AF-003-05 | Browser hits payOS return or cancel URL | Show provisional result; do not finalize payment or cancel the GreenHouse Order |
| AF-003-06 | Webhook signature, provider identity, attempt, Order, or amount mismatch | Store/reject according to security policy; change no business state |
| AF-003-07 | Duplicate callback | Return existing processing result and repeat no state/refund/notification effect |
| AF-003-08 | Deadline reaches an unpaid online Order | Atomically cancel Order, expire/retire active attempt/link, release reservation once, audit, and notify |
| AF-003-09 | Customer cancels a Paid Pending Order | Cancel and release once; create exact full refund handoff; do not erase Paid evidence |
| AF-003-10 | Customer cancels Confirmed or Staff cancels after export completion/Packed | Reject with current status and change nothing |
| AF-003-11 | Verified Paid callback arrives after cancellation/deadline | Keep Order Cancelled; keep transaction Paid; create one transaction-linked refund; never re-reserve or reopen |
| AF-003-12 | Multiple distinct provider transactions are Paid | Accept at most one for the Order; create one separate refund case for each excess transaction |
| AF-003-13 | Destination missing/invalid after Paid cancellation | Keep Refund waiting; require new Customer-confirmed version; never mark Refunded |
| AF-003-14 | Cancellation or stock release fails inside transaction | Roll back the cancellation group and retain the prior valid state |
| AF-003-15 | Email fails | Keep committed business outcome and retry notification without duplicate effects |

## 11. State and Data Invariants

1. Order pre-confirmation business state is `Pending` regardless of online attempt status.
2. `PaymentStatus` is Order-level money state; `PaymentAttemptStatus` is per provider attempt; `RefundStatus` is per refund case.
3. Paid attempt evidence must never be rewritten to `RefundPending` or `Refunded`.
4. An Order may have multiple attempts and multiple excess-transaction refunds, but only one accepted payment for fulfillment.
5. At most one payOS attempt is Pending for one Order.
6. A cancelled Order never returns to Pending/Confirmed and never reacquires reservation.
7. Exact reservation is released at most once.
8. `Order.PaymentStatus=RefundPending` means at least one required cancellation refund is incomplete; it does not overwrite provider transaction history.
9. Provider event/transaction identity produces business side effects at most once.
10. Every price, total, deadline, actor action, reason, provider message, reservation movement, refund case, payout attempt, and notification result is traceable.

## 12. UI Contract

- Checkout shows item snapshots, `ShippingFee=0`, total, delivery data, and COD/online choice before confirmation.
- A single pending checkout or cancellation submit is disabled and labeled as processing.
- Order detail shows Order status and Payment status as separate fields.
- PayOS return/cancel screen explicitly says final state comes from verified webhook/reconciliation.
- Customer sees **Hủy đơn** only when server reports owned `Pending` eligibility; the confirmation requires a reason and explains stock/refund consequence.
- Staff sees cancellation only for `Pending/Confirmed` before export completion and must enter a reason.
- A Paid cancellation links to the secure destination/refund status; Customer never enters refund amount.
- Repeated action shows the existing Order/cancellation/refund and a clear already-recorded message.

## 13. Acceptance Examples

| AT ID | Given / When / Then evidence | Classification |
|---|---|---|
| AT-040 | Given a valid cart and checkout, when submitted, then exactly one Pending Order, immutable details, exact reservation, initial payment state, deadline when online, and exact cart cleanup commit together. | `approved-requirement` |
| AT-041 | Given any validation/reservation/write failure, when checkout runs, then no partial Order, detail, reservation, payment, or cart cleanup remains. | `approved-requirement` |
| AT-042 | Given the same completed idempotency key is submitted repeatedly, then the same Order is returned with no duplicate effect. | `approved-requirement` |
| AT-043 | Given COD and online Orders, when created, then both are Order Pending while payment is Unpaid and Pending respectively; no WaitingForPayment Order state is used. | `approved-requirement` |
| AT-044 | Given PAYMENT_TIMEOUT_MINUTES changes after Order creation, when deadline is evaluated, then the existing immutable PaymentDeadlineAt is unchanged. | `approved-requirement` |
| AT-045 | Given an unpaid online Order at or after its deadline, when expiry runs repeatedly, then Order cancels and exact reservation releases once. | `approved-requirement` |
| AT-046 | Given a valid signed payOS success matched to provider identity, attempt, Order, and amount, when processed, then the attempt becomes Paid and effects occur once. | `approved-requirement` |
| AT-047 | Given only browser return/cancel navigation, when displayed, then no final payment or GreenHouse cancellation state changes. | `approved-requirement` |
| AT-048 | Given a Failed/Cancelled attempt before deadline and no Pending attempt, when Customer retries, then a new attempt is created without overwriting history. | `approved-requirement` |
| AT-049 | Given an owned non-paid Pending Order, when Customer cancels with reason, then Order cancels and exact reservation releases atomically with no Refund. | `approved-requirement` |
| AT-050 | Given an owned Paid Pending Order, when Customer cancels with reason, then Order cancels, reservation releases, Paid evidence remains, and one exact full refund handoff is created. | `approved-requirement` |
| AT-051 | Given Pending/Confirmed before export completion, when Staff cancels with reason, then cancellation consequences commit atomically. | `approved-requirement` |
| AT-052 | Given Confirmed after export completion or Packed/later, when cancellation is attempted, then it is rejected and no state changes. | `approved-requirement` |
| AT-053 | Given a verified Paid result after cancellation/deadline, when processed, then Order stays Cancelled, no stock is reacquired, and one transaction-linked refund is created. | `approved-requirement` |
| AT-054 | Given two distinct successful provider transactions for one Order, when reconciled, then one is accepted and the excess transaction receives its own refund case without overwriting either transaction. | `approved-requirement` |
| AT-055 | Given a Paid cancellation without DestinationVerified, when payout readiness is checked, then no payout starts; a verified destination enables the exact fixed payout without Warehouse receipt. | `approved-requirement` |
| AT-056 | Given repeated checkout, cancellation, callback, deadline, release, or refund-handoff commands, when processed, then each business effect occurs at most once and existing result is returned clearly. | `approved-requirement` |
| AT-057 | Given unauthorized/foreign access or notification failure, when handled, then data is denied or email retried while committed Order/Payment/Inventory/Refund state remains correct. | `approved-requirement` |
| AT-058 | Given an eligible Pending Order with an intact reservation, when Staff confirms, then `Confirmed` and exactly one StockExportRequest commit together; unpaid online, stale, duplicate, or incomplete-reservation confirmation changes nothing. | `approved-requirement` |

## 14. Preliminary G3 Traceability

| Decision | Requirements | Use case/interface | Implementation evidence | Acceptance | Status |
|---|---|---|---|---|---|
| BD-029, BD-031 | BR-022, BR-023, BR-032 | Checkout UI/API and Order transaction | `server/src/services/order.service.js` | AT-040 through AT-042 | ready |
| BD-030, BD-032 | BR-024, BR-025 | Order model, deadline worker, Customer history | `server/src/models/order.model.js` lacks `PaymentDeadlineAt` and includes duplicate Order states | AT-043 through AT-045 | ready |
| BD-033 | BR-026, BR-032 | Payment request, webhook, result UI | `server/src/services/payment.service.js` and `server/src/config/payos.js` | AT-046 through AT-048, AT-056 | ready |
| BD-034, BD-035 | BR-027, BR-028, BR-032 | Customer/Staff cancellation APIs and UI | `order.service.js`, `staffOrder.service.js`, Customer/Staff Order detail pages | AT-049 through AT-052, AT-056 | ready |
| BD-036, BD-037 | BR-029, BR-030 | Cancellation Refund, destination form, payout/reconciliation | `refundPending.model.js` is unique by Order and current attempt state mixes payment and refund | AT-050, AT-053 through AT-055 | ready |
| BD-038 | BR-031 through BR-033 | Authorization, audit, notifications, all actor surfaces | Current code has partial idempotency and post-commit notification patterns | AT-056, AT-057 | ready |
| BD-031, BD-038 | BR-034 | Staff confirmation and Warehouse handoff | Current Staff confirmation and stock-export request creation are separate actions | AT-058 | ready |

## 15. Confirmed Current Conflicts

The following are `observed-behavior`, not approved policy:

1. `order.model.js` contains `WaitingForPayment` and `Expired` Order states and no immutable `PaymentDeadlineAt`.
2. `order.service.js` creates online Orders as `WaitingForPayment` and creates a `MOCK` attempt during checkout.
3. Current Customer cancellation permits Pending payment but not Paid payment, while the candidate SRS blocks both Pending and Paid; BD-034 supersedes both.
4. Staff confirmation and stock-export request creation occur as separate actions instead of the candidate SRS atomic handoff.
5. `payment.service.js` can rewrite a Paid/late PaymentAttempt to `RefundPending`, mixing provider attempt evidence with refund state.
6. `refundPending.model.js` is unique by Order and cannot represent more than one excess paid transaction refund for the same Order.
7. Current payOS configuration has payment-link, webhook, and link-cancellation operations but no implemented Payout workflow.
8. Current Customer cancellation UI does not require a reason and does not expose the approved Paid-Pending cancellation path.

These conflicts will become exact G3 rows and G4 red acceptance evidence only after the full business baseline is closed.

## 16. Method Basis and Next Phase

The archived SWR guidance requires actor/use-case requirements to be complete, consistent, feasible, and verifiable and recommends deriving acceptance criteria during requirements development. GreenHouse business policy here comes only from SRC-019 and approved cross-slice decisions.

No implementation plan or code change is authorized by this document alone. The project will continue through the remaining business packages, then perform one cross-system consistency audit before freezing the SRS baseline.
