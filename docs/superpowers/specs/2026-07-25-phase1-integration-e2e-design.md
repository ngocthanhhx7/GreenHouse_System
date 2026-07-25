# GreenHouse Giai đoạn 1 Integration and E2E Design

**Status:** Business design approved in conversation; implementation not started.

**Scope:** Integrate and verify the already-approved COD ordering flow from Customer checkout through Customer order history. This document adds no new domain business rule.

**Target disposable database:** `greenhouse_e2e`

## 1. Authority and scope

The current user request is the normative release objective for this bounded integration slice. Existing SL-003, SL-004, SL-005, SL-006, and SL-007 designs remain the authority for their own business rules. Code and tests are observed evidence, not a replacement for those approved rules.

This slice is a release/integration slice, not a new product feature. It composes:

`Authentication/RBAC → Catalog/Cart → Checkout/Reservation → Staff confirmation → Warehouse export → Packing/Handoff/Delivery → Customer history`

Return/refund, online payment, carrier API integration, reports, and unrelated actor workflows remain outside the implementation scope.

## 2. Source-of-truth ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority | Conflicts |
|---|---|---|---|---|---|
| SRC-G1-001 | User integration request in this task | 2026-07-25 | Required end-to-end flow, seed accounts, history fields, negative cases, output report | Normative for this release integration | None inside the bounded scope |
| SRC-G1-002 | `docs/superpowers/specs/2026-07-25-cod-fulfillment-delivery-design.md` | Commit `c2ba1ad`, 2026-07-25 | Manual handoff, Shipment, Delivered/COD, failure and idempotency rules | Normative for SL-004 delivery behavior | Production signed-Carrier guard remains an environment policy |
| SRC-G1-003 | Existing SL-003/SL-005/SL-006/SL-007 approved local designs | Repository design history | Checkout, reservation, inventory, catalog/cart, authentication and RBAC contracts | Normative for package-owned rules | Integration must not redefine them |
| SRC-G1-004 | `server/src/config/seedDemoData.js` and `server/src/demo-data/demoFixtures.js` | Current checkout | Existing fixture accounts, products, addresses, orders and graph validation | Observed implementation evidence | `seed:demo` write path is currently gated |
| SRC-G1-005 | `server/src/routes/*.routes.js`, services and models | Current checkout | Current endpoints, states, ownership and transaction boundaries | Observed implementation evidence | Order response lacks a customer-facing shipping summary |
| SRC-G1-006 | Existing server/client tests | Current checkout | Encoded acceptance and regression behavior | Verification evidence | Unit/service tests do not prove a live API/browser chain |

## 3. Actor responsibility matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Customer | Buy products and track owned orders | Login, catalog read, cart commands, owned checkout, owned history/detail | Confirm, export, pack, ship, deliver, read another Customer's order | Owns checkout creation at `Pending`; reads later states | Own User, Cart, Address, Order and Shipment projection | Checkout to Staff queue | Invalid token, stale cart, insufficient stock, foreign order, invalid ID |
| Staff | Process orders and record manual delivery | Confirm `Pending`, submit packing checklist, handoff, shipment events | Process warehouse stock export, use another role's authorization, alter another Customer's data | `Pending → Confirmed`, `Confirmed → Packed`, `Packed → Shipped`, `Shipped → Delivered/failed` | Operational order, export result, Shipment evidence; no foreign Customer data | Confirmation to Warehouse; packing/handoff to delivery tracking | Duplicate command, invalid state, missing export/checklist/evidence, missing failure reason |
| Warehouse Manager | Complete physical export | Process the matching StockExportRequest | Customer checkout, Staff confirm, packing, delivery, payment | StockExportRequest pending/processing → `Completed`; inventory deduction | Warehouse, reservation and export records | Completed export to Staff packing | Missing request, wrong order/status, stale reservation, duplicate processing |
| Admin | System administration only | Login and existing admin surfaces | Participate in Customer/Staff/Warehouse order commands in this slice | None in the COD fulfillment chain | Admin-authorized data only | None | RBAC denial for fulfillment commands |
| External carrier | Not integrated in this release | No API call from GreenHouse | Login, mutate order directly, create local order | No direct local state ownership | No live integration | Staff records manual evidence | No carrier API dependency; signed evidence route remains existing optional boundary |

## 4. Technical integration design

### 4.1 Guarded seed and reset

`npm run seed:demo` becomes a real deterministic upsert command. It connects only to the configured database and uses existing `seedDemoData()` fixtures.

`npm run seed:demo -- --reset --confirm=RESET:greenhouse_e2e` performs a guarded reset before a later seed command. Reset is allowed only when:

- `NODE_ENV` is not `production`;
- `DEMO_SEED_ALLOW_RESET=true`;
- `MONGODB_URI` points to loopback MongoDB;
- the parsed database name is exactly `greenhouse_e2e`;
- the database supports transactions;
- confirmation exactly equals `RESET:greenhouse_e2e`.

The reset deletes demo-owned collections in dependency order and never deletes the shared `roles` collection. Seed accounts, passwords, product identities and scenario records remain fixed across runs. A failed seed reports the failing step and can be safely rerun on the disposable database.

### 4.2 Order history projection

The existing Customer order endpoints remain the boundary:

- `GET /api/orders/my`
- `GET /api/orders/:id`

The response will add a derived, read-only shipping projection:

```js
{
  shippingStatus: "HandedOff" | "AttemptFailed" | "Delivered" | null,
  shipping: {
    providerName: String,
    trackingCode: String,
    handedOverAt: String,
    deliveredAt: String | null,
    note: String
  } | null
}
```

The latest Shipment for the owned Order supplies the projection. The backend continues to enforce Customer ownership before loading details or Shipment data. No new persisted state is introduced.

The Customer history and detail pages will render:

- order code and creation time;
- immutable product snapshots and quantities;
- total amount;
- OrderStatus and PaymentStatus;
- ShippingStatus;
- carrier/tracking information when a Shipment exists;
- a clear error state for 401, 403, 404 and backend failures.

### 4.3 Live E2E runner

Add one repeatable API-level runner against `greenhouse_e2e`. It will:

1. Log in as the fixed Customer.
2. Read an Active product and the Customer's saved address.
3. Add one product to the Customer Cart.
4. Checkout COD with a stable idempotency key.
5. Assert `Pending`, `Unpaid`, OrderDetail snapshots and an active reservation.
6. Log in as Staff and confirm the Order.
7. Assert `Confirmed` and exactly one StockExportRequest.
8. Log in as Warehouse Manager and process the request.
9. Assert one inventory deduction and `StockExportRequest=Completed`.
10. Log in as Staff, submit an exact packing checklist and assert `Packed`.
11. Submit manual carrier name, tracking reference, handoff time, evidence and optional note.
12. Record `DELIVERED` with the fixed COD collection result and evidence.
13. Assert `Delivered`, Shipment `Delivered`, Payment `Paid`, `PaidAt`, and no duplicate payment evidence.
14. Log in as Customer again, read history/detail, and assert the shipping projection survives a fresh request.
15. Run the required negative cases against the same real HTTP boundary.

The runner prints a JSON report with step name, HTTP result, IDs, state assertions and failure details. It uses no online payment or external carrier API.

## 5. State and invariant contract

| Current state | Command/actor | Allowed result | Required invariant |
|---|---|---|---|
| Cart with valid lines | Customer checkout | Order `Pending`, Payment `Unpaid`, reservation created | Backend price/stock/ownership validation; one idempotent Order |
| `Pending` | Staff confirm | `Confirmed` | Exactly one valid StockExportRequest |
| `Confirmed` + completed export | Warehouse process then Staff | Export `Completed`, then Order `Packed` | One physical deduction; exact checklist |
| `Packed` | Staff handoff | Order `Shipped`, Shipment `HandedOff` | Carrier/tracking/time/evidence required; no carrier API |
| `Shipped` | Staff delivery result | `Delivered` + COD `Paid` or failed attempt | Payment only becomes Paid when fixed COD is fully collected |
| `Shipped` | Staff failed attempt | Order stays `Shipped` | Failure reason required; Payment not Paid |
| Any terminal/foreign state | Any forbidden actor or jump | 401/403/404/409/400 as appropriate | No state, stock, payment or duplicate-record mutation |

## 6. Traceability and acceptance evidence

This integration slice uses new acceptance labels `AT-235` through `AT-246` so existing package acceptance IDs are not reused:

| Acceptance ID | Evidence |
|---|---|
| AT-235 | Seed upsert creates the four fixed accounts, active catalog, stock and Customer address |
| AT-236 | Guarded reset clears only `greenhouse_e2e` demo-owned data and can be followed by seed |
| AT-237 | Customer checkout creates Pending/Unpaid Order, details, snapshots and reservation |
| AT-238 | Customer cannot read a foreign Order or invalid Order ID |
| AT-239 | Staff confirm creates exactly one StockExportRequest |
| AT-240 | Warehouse export completes once and deducts inventory once |
| AT-241 | Staff cannot pack before completed export; exact packing moves Order to Packed |
| AT-242 | Manual handoff creates one Shipment and moves Order to Shipped |
| AT-243 | Delivered full COD changes Payment and Order exactly once |
| AT-244 | Failed delivery preserves Shipped/Unpaid and requires an allowlisted reason |
| AT-245 | Customer history/detail includes status, products, totals and shipping projection after refresh |
| AT-246 | Live negative matrix denies wrong roles, state jumps, duplicates, over-stock and foreign access |

## 7. Explicit non-goals and residual conditions

- No new business state or actor is introduced.
- No online payment path is exercised.
- No GHN/GHTK or other carrier API is called.
- Return/refund, exchange, reports and unrelated dashboards are not part of the runner.
- Existing production behavior that requires signed Carrier evidence for production COD reconciliation is preserved; the disposable E2E runner uses the approved development/demo policy.
- Full live E2E evidence is not yet available until implementation and local services are run.

## 8. Quality gate target

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 |
|---|---|---|---|---|---|---|---|---|
| Giai đoạn 1 integration | passed | passed | passed | ready | not-started | not-started | not-started | not-started |

Exit requires:

1. red tests for each previously missing seed/history/E2E contract;
2. implementation with no unrelated architectural rewrite;
3. full backend and frontend tests passing;
4. guarded reset + seed on `greenhouse_e2e`;
5. one live Customer-to-Delivered/Paid run;
6. negative matrix and Customer refresh/history verification;
7. a final report listing remaining risks and non-goals.

