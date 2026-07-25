# Staff Order Confirmation and Stock Export Handoff Design

**Date:** 2026-07-25

**Scope:** COD reservation verification, Staff order queue/detail, and
`Pending -> Confirmed` handoff

**Status:** Approved for implementation

**Business approver:** Project owner (approved in the Codex task on 2026-07-25)

**Implementation branch:** `feature/staff-order-confirm`

**Implementation baseline:** `db2fbbaec31a05777b7fb853b02624fe7ae95dde`

## 1. Goal

Complete and harden this bounded part of the COD flow:

`Successful checkout -> exact reservation -> Pending Order -> Staff review
-> Staff confirmation -> Confirmed Order -> one StockExportRequest`

The result must preserve stock, actor, state, idempotency, concurrency, and
audit invariants. It must not process the Warehouse export or reduce physical
stock.

## 2. Source-of-Truth Ledger

| Source | Revision/date | Authority | Evidence used |
| --- | --- | --- | --- |
| Project owner request for reservation and Staff confirmation | 2026-07-25 | Approved requirement | Scope, actors, state transition, atomicity, duplicate protection, and required tests |
| `2026-07-22-sl-003-order-payment-cancellation-design.md` | 2026-07-22, BR-034 and AT-058 | Approved requirement | COD confirmation eligibility, intact reservation, and exactly one export request |
| `2026-07-25-phase2-business-guards-design.md` | 2026-07-25, BR-124 and AT-229 | Approved requirement | Staff confirmation idempotency and concurrency behavior |
| Repository source and tests | Commit `db2fbba` inspected 2026-07-25 | Observed behavior | Existing models, transactions, RBAC, Staff pages, APIs, and test coverage |

If observed code conflicts with this approved design, this design controls the
bounded implementation. Existing online-payment confirmation remains supported
only when its payment status is `Paid`; the current checkout UI remains COD-only.

## 3. Actor Responsibility Matrix

| Actor | Goal and permitted actions | Must not perform | State/data scope | Handoff and failure |
| --- | --- | --- | --- | --- |
| Customer | Create a valid owned `Pending` COD Order and view only owned Orders | List operational Orders, confirm an Order, create an export request, or supply role/status/price authority | Own cart, address, checkout, Orders, details, and reservation outcome | Checkout hands one reserved `Pending` Order to Staff; invalid or insufficient stock rolls back checkout |
| Staff | List/filter operational Orders, view details, and confirm one eligible Order | Confirm a stale, cancelled, unpaid online, invalid COD, or incompletely reserved Order; process Warehouse stock | Reads operational Orders; owns `Pending -> Confirmed` and the initial export request handoff | A successful confirmation creates one initial `Pending` StockExportRequest |
| Warehouse Manager | Receive the later stock export task | Confirm an Order or process stock in this slice | Read/use of export request is downstream | Any direct call to Staff confirmation is rejected with `403 ROLE_FORBIDDEN` |
| System | Enforce authentication, RBAC, validation, transaction, idempotency, concurrency, and audit | Trust client role, user ID, totals, state, or inventory decisions | All writes are server-derived and transaction-scoped | Any failed precondition or write leaves the prior business state unchanged |

## 4. Inventory Vocabulary and Invariants

The existing inventory design is retained:

| Term | Existing representation | Meaning in this slice |
| --- | --- | --- |
| Physical/on-hand stock | `onHandQuantity` virtual | Sellable, quarantined, and damaged units physically present |
| Sellable stock | `sellableQuantity` | Physical units eligible to fulfill orders |
| Reserved stock | `reservedQuantity` and active `OrderReservation` rows | Sellable units held for accepted checkout demand |
| Available stock | `sellableQuantity - reservedQuantity` while inventory health is normal | Maximum additional quantity that new checkout may reserve |

Required invariants:

1. Checkout increases `reservedQuantity` and creates exact
   `OrderReservation` rows; it does not reduce `sellableQuantity` or physical
   stock.
2. Each OrderDetail has exactly one active reservation with the same
   `orderId`, `orderDetailId`, `productId`, and quantity.
3. Repeated checkout does not create a second Order or reservation set.
4. Staff confirmation does not change any inventory quantity.
5. Confirmation requires normal inventory health, sufficient sellable stock,
   and an aggregate reserved counter that still covers every product required
   by the Order.
6. Any multi-document failure rolls back the complete command.

## 5. Design Alternatives and Approved Decision

Three StockExportRequest item designs were considered:

1. **Approved — normalized existing model.** Store Order/cycle references on
   StockExportRequest and resolve exact items from immutable OrderDetails plus
   OrderReservations. Return the resolved items in the Staff API DTO.
2. Embed another `items[]` snapshot in StockExportRequest. This duplicates
   immutable order facts and may drift from the reservation ledger.
3. Add a StockExportRequestLine collection. This adds another persistence
   model without a current business need.

The approved normalized design follows the current repository architecture.
It avoids duplicated persistent item facts while still giving Staff and the
future Warehouse step an exact, easy-to-read item list.

## 6. API Contract

### 6.1 Staff list

`GET /api/staff/orders?status=Pending`

- Requires an authenticated active `Staff`.
- Supports the existing status/date filters.
- Returns operational Orders only; Customer ownership filtering remains on
  Customer Order APIs.

### 6.2 Staff detail

`GET /api/staff/orders/:id`

- Requires an authenticated active `Staff`.
- Returns the Order, immutable OrderDetails, payment/reservation eligibility,
  confirmation evidence, and any initial StockExportRequest.

### 6.3 Staff confirm

`POST /api/staff/orders/:id/confirm`

Headers:

```text
Authorization: Bearer <staff-token>
Idempotency-Key: <8-to-128-safe-characters>
```

Optional request body:

```json
{
  "note": "Đơn hợp lệ, chuyển kho chuẩn bị hàng"
}
```

The authenticated session supplies `staffId` and role. The body must not
contain trusted `userId`, role, Order status, Payment status, inventory facts,
or item quantities.

Successful response includes:

- the updated `Confirmed` Order;
- `confirmedBy` and `confirmedAt`;
- one initial `Pending` StockExportRequest;
- resolved request `items` containing `orderDetailId`, `productId`,
  `productNameSnapshot`, and `quantity`;
- a replay indicator when the same command was already committed.

## 7. Confirmation Preconditions

Before changing state, the server must prove all of the following:

1. The caller is an authenticated, active `Staff`.
2. `Idempotency-Key` is present, valid, and bound to the Order plus normalized
   note facts.
3. The Order exists and is currently `Pending`.
4. The Order is not cancelled and has at least one immutable OrderDetail.
5. For COD, `paymentMethod=COD` and `paymentStatus=Unpaid`.
6. If the existing online path is used, its payment must be `Paid`.
7. Every detail has exactly one active `Reserved` OrderReservation with exact
   Order, detail, product, and quantity values.
8. Inventory health is normal for every product; sellable stock and aggregate
   reserved stock cover the required quantities.
9. No successful initial StockExportRequest already exists except the result
   addressed by the same idempotency key.

No StockExportRequest may be created when any state or reservation check fails.

## 8. Atomic State Transition and Persistence

One MongoDB transaction performs the confirmation:

1. Recheck Staff assignment/active-role eligibility.
2. Load and validate Order, OrderDetails, OrderReservations, Payment, and
   Inventory projections.
3. Atomically claim only `OrderStatus=Pending`.
4. Set `OrderStatus=Confirmed`, `confirmedBy`, `confirmedAt`,
   `staffConfirmIdempotencyKey`, and the normalized request hash.
5. Create exactly one initial FulfillmentCycle.
6. Create exactly one initial `StockExportRequest` with:
   - Order and cycle references;
   - `requestKind=Initial`;
   - `requestedBy=<authenticated staff id>`;
   - `status=Pending`;
   - normalized optional note.
7. Write the canonical AuditLog inside the same transaction with a stable
   business event identity, authenticated actor, correlation/idempotency key,
   and `Pending -> Confirmed` state evidence.
8. Commit all writes together.

If audit or any other write fails, Order, cycle, request, and audit all roll
back. Notifications, if later used, must run after commit and must not repeat
the business command.

The StockExportRequest database record does not duplicate item lines. Its API
DTO resolves items from the immutable details and reservations. The Order
schema stores the confirmer reference as `confirmedBy`.

## 9. Idempotency and Concurrency

1. Same key and same normalized facts return the already committed result,
   including the same FulfillmentCycle and StockExportRequest.
2. Same key with different facts returns `409 ORDER_CONFIRM_KEY_REUSED`.
3. A different key after the Order is already `Confirmed` returns
   `409 ORDER_CONFIRM_STALE_STATE`.
4. Concurrent requests are serialized by the conditional
   `Pending -> Confirmed` claim, the MongoDB transaction, and existing unique
   indexes for the initial cycle/request.
5. For two same-key concurrent requests, one commits and the other resolves to
   the same committed result.
6. For two different-key concurrent requests, one may commit; the other
   returns a stable `409`. Only one Order transition, cycle, request, and audit
   event exist.
7. Duplicate-key or transaction write-conflict errors must be translated into
   the stable replay or stale-state result, not leaked as an internal `500`.

## 10. Error Contract

| HTTP | Code | Simple meaning |
| --- | --- | --- |
| 400 | `STAFF_CONFIRM_IDEMPOTENCY_KEY_REQUIRED` | Thiếu mã chống gửi lặp |
| 400 | `STAFF_CONFIRM_IDEMPOTENCY_KEY_INVALID` | Mã chống gửi lặp không hợp lệ |
| 401 | existing authentication code | Chưa đăng nhập hoặc phiên đăng nhập hết hạn |
| 403 | `ROLE_FORBIDDEN` | Tài khoản không phải Staff được phép xử lý |
| 404 | existing Order-not-found code | Không tìm thấy đơn hàng |
| 409 | `ORDER_CONFIRM_PAYMENT_INVALID` | Trạng thái thanh toán chưa phù hợp để xác nhận |
| 409 | `ORDER_CONFIRM_RESERVATION_MISSING` | Dữ liệu giữ hàng không còn đầy đủ |
| 409 | `ORDER_CONFIRM_KEY_REUSED` | Mã gửi lặp đã được dùng cho nội dung khác |
| 409 | `ORDER_CONFIRM_STALE_STATE` | Đơn đã đổi trạng thái hoặc không còn được xác nhận |

All rejected commands leave Order, Payment, Inventory, Reservation,
FulfillmentCycle, StockExportRequest, and AuditLog unchanged.

## 11. Frontend Contract

The existing Staff pages and service remain the base:

- the queue defaults to or filters `Pending`;
- detail displays current server state and resolved item information;
- the confirm button exists only for an eligible `Pending` Order;
- an immediate in-memory lock and disabled loading state block rapid repeat
  clicks;
- one stable idempotency key is reused for a retry of the same user command;
- server messages are shown in simple Vietnamese;
- refresh reads committed state from backend and does not recreate the command.

Frontend visibility is guidance only. Backend authentication, RBAC, state, and
reservation guards remain authoritative.

## 12. Required TDD and Acceptance Evidence

| Acceptance ID | Required evidence |
| --- | --- |
| AT-SC-01 | Valid `Pending + COD + Unpaid` Order with intact reservations becomes `Confirmed` and creates one initial cycle/request |
| AT-SC-02 | Customer receives `403 ROLE_FORBIDDEN`; handler creates no mutation |
| AT-SC-03 | Warehouse Manager receives `403 ROLE_FORBIDDEN`; handler creates no mutation |
| AT-SC-04 | Already `Confirmed` and `Cancelled` Orders return stable `409` and create no second request |
| AT-SC-05 | Missing, duplicated, short, mismatched, or non-Reserved reservation rejects confirmation with zero mutation |
| AT-SC-06 | Insufficient aggregate `reservedQuantity`, insufficient sellable stock, or unhealthy inventory rejects confirmation |
| AT-SC-07 | Two same-key concurrent requests return one business result with one cycle, request, and audit event |
| AT-SC-08 | Two different-key concurrent requests produce one success and one stable `409`, with one cycle/request |
| AT-SC-09 | Audit write failure rolls back Order confirmation, cycle, and request |
| AT-SC-10 | Staff list/filter/detail returns correct Pending data, confirmation evidence, and resolved request items |
| AT-SC-11 | Missing/invalid/reused idempotency keys follow the defined error contract |
| AT-SC-12 | Confirmation never reduces stock, consumes reservation, or calls Warehouse processing |

Implementation uses red-green-refactor. Final evidence requires:

- focused model/service/controller/route tests;
- focused Staff frontend service/page contract tests if the contract changes;
- full backend test suite;
- full frontend test suite;
- frontend production build;
- `git diff --check`.

## 13. Traceability and Quality Gates

| Gate | Required proof before completion |
| --- | --- |
| G0 — Scope | Only reservation verification, Staff review, and confirmation handoff are changed |
| G1 — Business | Actor, payment, inventory, state, and one-request invariants match sections 3–9 |
| G2 — Contract | API, DTO, RBAC, error codes, and frontend behavior match sections 6, 10, and 11 |
| G3 — Evidence | AT-SC-01 through AT-SC-12 and full regression commands pass with recorded output |

This slice is classified as `approved-requirement`. There are no unresolved
business decisions in its implementation scope.

## 14. Security Requirements

- Authentication and role are read only from the verified token/session.
- Staff and resource IDs are validated as server-side identifiers.
- Request input is allow-listed, trimmed, length-limited, and never used as
  trusted state.
- Staff list/detail/confirm routes use the existing authentication and exact
  Staff-role middleware.
- Responses expose only operational fields needed by Staff and do not expose
  secrets or raw internal errors.
- Audit records the authenticated actor and stable business event without
  storing credentials or tokens.
- Error messages are clear but do not reveal another user's private data.

## 15. Out of Scope

- Warehouse processing or completing StockExportRequest;
- consuming reservations or reducing sellable/physical stock;
- packing, shipping, delivery, or COD collection;
- online checkout, payOS, return, exchange, refund, reporting, or carrier
  integration;
- rewriting the inventory or order architecture;
- changing SRS or SDS documents.
