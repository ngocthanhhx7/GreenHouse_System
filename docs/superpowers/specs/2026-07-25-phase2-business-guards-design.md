# Phase 2 Business Guards Design

**Date:** 2026-07-25

**Slice:** SL-010

**Status:** Approved for implementation

**Business approver:** Project owner (approved in the Codex task on 2026-07-25)

**Implementation branch:** `feature/phase2-business-guards`

## 1. Goal

Protect the completed COD order flow against invalid, repeated, concurrent, and
unauthorized actions. The server remains the authority for every business
decision. The client prevents accidental repeated clicks and explains the
server result in simple Vietnamese.

This slice hardens these eight paths:

1. insufficient stock at checkout;
2. repeated checkout;
3. repeated Staff confirmation;
4. repeated Warehouse stock export;
5. invalid state transition;
6. wrong role accessing a protected API;
7. Customer cancellation while the Order is `Pending`;
8. failed delivery and rescheduling.

## 2. Sources and conflicts

| Source | Revision | Authority | Evidence |
| --- | --- | --- | --- |
| Project owner Phase 2 request | 2026-07-25 | Approved requirement | The eight required guard paths |
| `docs/member-plans/03_NGUYEN_QUANG_HUY_PLAN.md` | checkout snapshot at merge commit `13842df` | Approved implementation addendum | Paid Customer cancellation creates one refund workflow; repeated commands use idempotency |
| `docs/srs-sds-reconciliation/03_NGUYEN_QUANG_HUY_PLAN.md` | checkout snapshot at merge commit `13842df` | Approved reconciliation result | Paid cancellation keeps immutable payment evidence and creates `ReadyForRefund` plus `RefundPending` |
| Current code and tests | merge commit `13842df` | Observed behavior | Existing transactions, state claims, idempotency, RBAC, export and failed-delivery behavior |

Two conflicts must be corrected:

- `OrderDetailPage.jsx` offers cancellation for `Pending + Paid`, but
  `order.service.js` rejects it even though the approved addendum requires the
  refund handoff.
- the final atomic stock reservation can fail with an English message and no
  stable checkout error code, so the Customer does not receive a clear
  business explanation.

## 3. Approved decision

`BD-118`: repeated commands must be safe, state transitions must be claimed
atomically, and no client-side check may replace server-side enforcement.

For the same logical command:

- the same `Idempotency-Key` and same facts return the original committed
  result without another side effect;
- the same key with different facts returns `409 IDEMPOTENCY_KEY_REUSED`;
- a different key against an already-changed state returns a state-specific
  `409`;
- a wrong authenticated role returns `403 ROLE_FORBIDDEN`;
- an unauthenticated request remains `401`.

## 4. Actor boundaries

| Actor | May initiate | Must not perform | State owned | Handoff and failure |
| --- | --- | --- | --- | --- |
| Customer | Checkout, cancel an owned `Pending` Order | Confirm, export, pack, ship, or record delivery | `Pending -> Cancelled` for an owned Order | Cancellation releases reservation once; paid cancellation opens one refund obligation |
| Staff | Confirm a `Pending` Order; pack, hand off, and record delivery evidence | Consume Warehouse inventory directly | `Pending -> Confirmed`, `Confirmed -> Packed`, `Packed -> Shipped`, `Shipped -> Delivered` | Confirmation creates one initial stock export request |
| WarehouseManager | Process the exact stock export request | Confirm Customer Orders or record Staff delivery outcomes | Stock export `Pending/Failed -> Processing -> Completed` | Consumes each exact reservation and stock movement once |
| System | Enforce transaction, idempotency, RBAC, outbox and audit rules | Invent a business result after a failed claim | No actor-owned manual transition | Returns a stable error with no partial mutation |

## 5. Guard contracts

### BR-122 — Insufficient stock

Checkout performs the final stock check and reservation inside the same
transaction as Order creation.

- If any line is short, return `409 CHECKOUT_STOCK_INSUFFICIENT` with a simple
  Vietnamese message.
- No Order, OrderDetail, Payment, PaymentAttempt, reservation, or cart checkout
  mutation may remain.
- The Customer can refresh the cart and choose another quantity.

### BR-123 — Repeated checkout

- The client keeps one checkout key for the current submission and locks the
  submit action while the request is in flight.
- Replaying the same key and facts returns the original Order.
- Only one Order, one set of OrderDetails, one Payment projection, and one set
  of reservations exist.
- Changed checkout facts with the old key return
  `409 IDEMPOTENCY_KEY_REUSED`.

### BR-124 — Repeated Staff confirmation

- Only `Pending` can be confirmed.
- One successful confirmation creates one `Confirmed` Order, one initial
  FulfillmentCycle, and one open StockExportRequest.
- A replay with the same key returns the original result and displays that the
  action was already processed.
- A new confirmation command after the state changed returns `409`.

### BR-125 — Repeated Warehouse export

- Export requires the matching `AwaitingExport` cycle, a `Confirmed` Order,
  intact reservations, and enough sellable stock.
- A replay returns the completed export without another inventory deduction,
  reservation consumption, InventoryTransaction, or audit entry.
- Concurrent different commands receive a stable `409` while one command owns
  the active processing lease.

### BR-126 — Invalid state transition

The server rejects skipped, backward, or terminal transitions. Examples:

- a non-`Pending` Order cannot be confirmed;
- packing requires `Confirmed` and a completed stock export;
- handoff requires `Packed`;
- delivery and failed-attempt events require `Shipped`;
- a completed or cancelled export cannot be processed as a new export.

Every rejected transition leaves Order, Payment, inventory, shipment, audit,
and outbox state unchanged.

### BR-127 — Wrong role

Protected APIs enforce the exact actor role at runtime:

- `/orders` and Customer cancellation: `Customer`;
- `/staff/orders/:id/confirm` and Staff shipment events: `Staff`;
- `/warehouse/stock-exports/:id/process`: `WarehouseManager`.

The response is `403 ROLE_FORBIDDEN`, the handler is not called, and no domain
mutation occurs.

### BR-128 — Customer cancels a Pending Order

The Customer may cancel only an owned `Pending` Order and must provide a
reason and command key.

- COD `Unpaid`: Order becomes `Cancelled`; Payment and COD attempt remain
  `Unpaid`.
- Online `Pending` or `Failed`: Order and Payment become `Cancelled`; only the
  active provider attempt/link is retired.
- Online `Paid`: Order becomes `Cancelled`; immutable paid evidence remains
  `Paid`; exactly one `ReadyForRefund` case linked to one fixed
  `RefundPending` obligation is created.
- Every reservation is released exactly once.
- `Confirmed` or later Orders cannot be cancelled by the Customer.

### BR-129 — Failed delivery

- `ATTEMPT_FAILED` requires evidence, reason, and an active `Shipped` Order.
- The attempt is appended once, the Order remains `Shipped`, Payment is not
  rewritten, and the Customer receives a failed-attempt notification.
- `RESCHEDULED` appends the rescheduling event and notifies the Customer.
- Reusing the same event key returns the prior result without duplicate event
  or notification.
- Terminal `DeliveryFailed` resolution remains in the existing incident and
  return/refund workflow; this slice does not invent a new terminal rule.

## 6. Error and UI rules

- Customer-facing text is Vietnamese and avoids internal model names.
- Buttons are disabled while a command is running and guarded by an immediate
  ref so two rapid clicks cannot start two client requests.
- A replay message says the action was processed earlier.
- `409` explains that the state changed or the action is no longer allowed.
- UI visibility is only guidance; direct API calls remain protected by server
  authorization and state checks.

## 7. TDD and acceptance evidence

| Acceptance ID | Required evidence |
| --- | --- |
| AT-227 | Insufficient checkout stock returns the stable `409`, rolls back every write, and preserves the active cart |
| AT-228 | Two identical checkout submissions return one Order and one set of financial/inventory effects |
| AT-229 | Two Staff confirmations create one confirmation and one export request |
| AT-230 | Two Warehouse export submissions deduct stock and write movement/audit evidence once |
| AT-231 | Invalid transition examples return `409` with zero mutation |
| AT-232 | Runtime HTTP tests prove wrong roles receive `403 ROLE_FORBIDDEN` and handlers are not called |
| AT-233 | Pending COD, unpaid online, and paid online cancellation each follow the approved payment/refund rule and release stock once |
| AT-234 | Failed delivery remains `Shipped`, records and notifies once, and supports rescheduling |

Each missing behavior is implemented with red-green-refactor. Existing passing
tests are retained as regression evidence. Final verification requires:

- focused Phase 2 server acceptance tests;
- focused client guard tests;
- full server tests;
- full client tests;
- client production build;
- `git diff --check`.

## 8. Out of scope

- integrating a real carrier or shipper account;
- choosing a maximum number of delivery attempts;
- redesigning the existing Order, Payment, Refund, Shipment, or Inventory state
  machines beyond the conflicts above;
- changing return/exchange deadlines, refund amounts, or COD policy;
- modifying SRS or SDS documents.
