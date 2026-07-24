# SL-008 G3 Traceability: Product Review and Support

Date: 2026-07-24
Owner: Lê Vũ Cường `<levucuong0319@gmail.com>`
Baseline: clean `origin/main` `2490fe2` (server `792/792`, client `206/206`)
Status: `RED_ACCEPTANCE_CONTRACT_DEFINED — IMPLEMENTATION_NOT_STARTED`

This document is the binding SL-008 contract. It replaces the legacy per-order
`ProductReview` and mutable `SupportRequest` flow. SL-003 owns Order/Payment
transactions, SL-004 delivery facts, SL-005 Inventory, SL-006 Product/Category
publication, and SL-007 Active-account/assignment coordination.

## Actor and permission matrix

| Actor | Allowed | Denied |
|---|---|---|
| Guest | Public Review list/count/one-decimal mean for Active Product + Active Category | All Review/Support mutations and all Support data |
| Customer | Own Review create/update/publication; own Support create/read/message/withdraw/reopen | Foreign records, moderation, claim, priority, transfer, resolve, raw ObjectIds/internal contact data |
| Staff | Review moderation; Support queue/read, claim/recovery, and current-Active-assignee Support operations | Customer publication, foreign/disabled-assignee operations |
| Admin / WarehouseManager | No SL-008 command | Every SL-008 route/control |
| System | Validate; append histories/audit/outbox atomically | Invent ownership, include text/sensitive data in audit/outbox, mutate foreign domains |

## State maps

### Review

| Dimension | States | Command | Invariant |
|---|---|---|---|
| Customer publication | `Published`, `Withdrawn` | owning Customer `setPublication` | Independent of moderation; append history |
| Staff moderation | `Allowed`, `HiddenByStaff` | Staff `moderate(reason)` | Independent of publication; append history |
| Public visibility | derived | none | `Published && Allowed && Product.Active && Category.Active` |

One durable identity is exactly `(customerId, productId)`. Create uses an
eligible supplied `orderDetailId`; otherwise selects the owned delivered detail
by `Order.deliveredAt DESC, OrderDetail._id DESC`. Repeat purchases, returns,
refunds, and same-SKU exchanges never create another identity. Rating is integer
1–5; normalized optional text is 0–1000; content/state history is immutable.

### Support

| State | Transition | Guard/effect |
|---|---|---|
| `New` | Staff claim → `InProgress` | Atomic first claim, unassigned, Normal priority |
| `New` | Customer withdraw → `Withdrawn` | Owner only and still unassigned |
| `InProgress` | message/priority/transfer/resolve | Current Active assignee only; append histories; reason 5–500 |
| `InProgress` unassigned after disable | Staff claim → `InProgress` | Recovery; retain messages/history/priority; emit `ASSIGNEE_CLEARED` once |
| `InProgress` | resolve → `Resolved` | Atomically append final message and exact `resolvedAt` |
| `Resolved` | Customer message/reopen → `InProgress` | Owner only at/before `resolvedAt + 72h` exactly |
| `Withdrawn` | none | terminal |

Types are `Order`, `Payment`, `ReturnRefund`, `Exchange`, `Product`, `Account`,
`Other`. Order-related types require an owned Order. Product requires an Active
Product. Any supplied Product+Order must match OrderDetail. Account/Other may
omit refs, but supplied refs must be valid. Subject is 5–120; initial message
10–2000; later/final message 1–2000. Create is unique ticket code, New,
unassigned, Normal. `SupportMessage` is append-only.

## Exact route contract

All lists default `page=1`, `pageSize=20`, max 50. Every command requires an
8–128 `Idempotency-Key` header; every state mutation has JSON `expectedVersion`.
Replay returns previous/current result; stale races have no aggregate/history/
audit/outbox effect.

| Route | Actor | Contract |
|---|---|---|
| `GET /api/products/:productId/reviews?page&pageSize` | Guest | `{items,total,averageRating,page,pageSize,totalPages}` public projection |
| `POST /api/products/:productId/reviews` | Customer | `{orderDetailId?,rating,content?,expectedVersion}` |
| `PATCH /api/reviews/:reviewId` | owning Customer | `{rating,content?,expectedVersion}` |
| `PATCH /api/reviews/:reviewId/publication` | owning Customer | `{publicationStatus,expectedVersion}` |
| `PATCH /api/staff/reviews/:reviewId/moderation` | Staff | `{moderationStatus,reason,expectedVersion}` |
| `GET /api/staff/reviews?page&pageSize&productId&state` | Staff | minimum moderation projection |
| `POST /api/support-requests` | Customer | `{type,subject,initialMessage,orderId?,productId?,expectedVersion}` |
| `GET /api/support-requests/my?page&pageSize` | Customer | own ticket projection and message page |
| `POST /api/support-requests/:ticketId/messages` | owning Customer | `{message,expectedVersion}` in New/InProgress |
| `PATCH /api/support-requests/:ticketId/withdraw` | owning Customer | `{expectedVersion}` only unassigned New |
| `POST /api/support-requests/:ticketId/reopen` | owning Customer | `{message,expectedVersion}` at/before 72h boundary |
| `GET /api/staff/support-requests?page&pageSize&status&priority&assigneeId` | Staff | server-paged minimum operational projection |
| `GET /api/staff/support-requests/:ticketId?page&pageSize` | Staff | Staff-safe ticket/messages/histories |
| `POST /api/staff/support-requests/:ticketId/claim` | Staff | `{expectedVersion}` atomic New/recovery claim |
| `POST /api/staff/support-requests/:ticketId/messages` | current Active assignee | `{message,expectedVersion}` |
| `PATCH /api/staff/support-requests/:ticketId/priority` | current Active assignee | `{priority,reason,expectedVersion}` |
| `PATCH /api/staff/support-requests/:ticketId/transfer` | current Active assignee | `{assigneeId,reason,expectedVersion}`; target Active Staff |
| `POST /api/staff/support-requests/:ticketId/resolve` | current Active assignee | `{finalMessage,expectedVersion}` |

Public Review DTO has only masked current display name, verified label, rating,
content, createdAt, updatedAt. It never has Customer/Order/OrderDetail/email/
phone/internal moderation IDs. Visible list/count/mean use the exact same set.

## Data, index, migration, and atomicity contract

| Data | Required records/indexes |
|---|---|
| Review | unique `{customerId,productId}`, selected `orderDetailId`, version, independent states, immutable content/publication/moderation histories, public `{productId,publicationStatus,moderationStatus,createdAt:-1,_id:-1}` index |
| Support | unique `ticketCode`, version/status/assignee/priority/resolvedAt, ordered append-only `SupportMessage`, append-only assignment/priority/resolution histories, list indexes customer/status/priority/assignee/createdAt |
| Commands | immutable scoped command key/fingerprint/result records, unique actor/key indexes |
| Cross-cutting | aggregate + history + Audit + `DomainOutbox` share transaction; audit/outbox have IDs/metadata only, never full text/email/phone/sensitive data |

Events: `REVIEW_CREATED`, `REVIEW_UPDATED`, `REVIEW_PUBLICATION_CHANGED`,
`REVIEW_MODERATION_CHANGED`, `SUPPORT_CREATED`, `SUPPORT_CLAIMED`,
`SUPPORT_MESSAGE_APPENDED`, `SUPPORT_PRIORITY_CHANGED`, `SUPPORT_TRANSFERRED`,
`SUPPORT_WITHDRAWN`, `SUPPORT_RESOLVED`, `SUPPORT_REOPENED`,
`ASSIGNEE_CLEARED`.

`migrateSl008ReviewSupport.js` preflights and fails on ambiguous duplicate
Customer+Product Reviews or legacy mutable-history ambiguity. It never deletes,
chooses canonical data, invents history/commands, or rewrites foreign domains;
creates/verifies indexes and is repeat-safe. Deployment owner runs backup/dry
run/apply only after implementation.

## Requirement → code → test map

Planned code is prospective during RED; the following acceptance files are the
executable gate, and no production code changed in this task.

| Requirement | Planned code boundary | Test evidence |
|---|---|---|
| BR-083 | Review model/repository/service/routes/controller/panel | AT-150–153 |
| BR-084 | Review validation/state/history and Customer/Staff UI | AT-154,155,159 |
| BR-085 | public query/DTO/aggregate/index and Product panel | AT-156–158 |
| BR-086 | Review command/idempotency transaction/audit/outbox/migration | AT-159–160 |
| BR-087 | Support reference validator/create and Customer form | AT-161–164 |
| BR-088 | SupportMessage model/repository/service/message UI | AT-165 |
| BR-089 | claim/assignee/priority/transfer/history/disable adapter | AT-166–170 |
| BR-090 | withdraw/resolve/reopen transaction and controls | AT-171–172 |
| BR-091 | RBAC routes/DTO mappers/UI absence checks | AT-173 |
| BR-092 | shared command/idempotency/version/audit/outbox | AT-160,174 |
| BR-093 | foreign-domain isolation guards | AT-174 |
| AT-150 | Review atomic eligibility | server test 1 |
| AT-151 | deterministic detail fallback | server test 1 |
| AT-152 | repeat identity | server test 1 |
| AT-153 | return/exchange preserve identity | server test 1 |
| AT-154 | validation boundaries | server test 2; client test 1 |
| AT-155 | independent state dimensions | server test 2; client test 2 |
| AT-156 | public projection/privacy | server test 3; client test 1 |
| AT-157 | immutable Review history | server test 4; client test 2 |
| AT-158 | aggregate/paging | server test 3; client test 3 |
| AT-159 | Review atomic/replay/race/stale | server test 4; client test 3 |
| AT-160 | Review delivery-safe command | server test 4; client test 3 |
| AT-161 | type/reference matrix | server test 5; client test 4 |
| AT-162 | missing/foreign Order denial | server test 5; client test 4 |
| AT-163 | invalid/inactive/mismatched Product | server test 5; client test 4 |
| AT-164 | Account/Other optional refs | server test 5; client test 4 |
| AT-165 | immutable messages/paging | server test 6; client test 5 |
| AT-166 | actor/assignee messaging and claim | server test 6; client test 6 |
| AT-167 | assignee-only matrix | server test 7; client test 6 |
| AT-168 | priority/transfer validation/history | server test 7; client test 6 |
| AT-169 | disabled-assignee recovery | server test 7; client test 7 |
| AT-170 | approved transitions/final response | server test 7; client tests 6–7 |
| AT-171 | withdraw/final atomicity | server test 8; client test 5 |
| AT-172 | exact reopen boundary | server test 8; client tests 5,7 |
| AT-173 | ownership/filter projection/privacy | server test 9; client test 8 |
| AT-174 | atomic/replay/delivery/foreign isolation | server test 9; client test 8 |

## Baseline discrepancies, dependencies, and current RED evidence

Baseline Review is unique Customer+Order+Product, requires legacy `orderId`,
uses `Visible|Hidden`, exposes customer/order IDs, and lacks version,
idempotency, immutable history, outbox, stable paging, and safe DTO. Baseline
Support is a mutable content/response document; has no Exchange/Account,
ticket-code uniqueness, append-only messages/histories, first claim/assignee
guard/reopen boundary, idempotency/version, or SL-008 outbox. Customer Support
uses a raw Order input; Staff Support has only legacy response mutation.

SL-008 consumes delivered Order/OrderDetail proof, Active Product/Category,
Active Staff state, Audit/DomainOutbox and transaction helpers. It never mutates
Order, Payment, Return, Exchange, Shipment, or Inventory. Notification consumes
outbox events but is outside this slice.

```text
server> node --test src/acceptance/sl008.acceptance.test.js
tests 9; pass 0; fail 9

client> node --test src/acceptance/sl008UiContract.test.js
tests 8; pass 0; fail 8
```

Expected failures are missing locked Review interfaces and independent states;
missing Support commands/type matrix/messages/histories/recovery; absent
ProductReviewPanel; raw Customer Support order input; absent Staff paging/claim/
assignee/transfer/recovery UI; and absent client command header/version methods.
They are absent/legacy SL-008 behavior failures, not syntax or import failures.
