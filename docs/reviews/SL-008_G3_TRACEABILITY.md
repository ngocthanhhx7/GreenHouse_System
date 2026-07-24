# SL-008 G3 Traceability: Product Review and Support

Date: 2026-07-24
Owner: Lê Vũ Cường `<levucuong0319@gmail.com>`
Baseline: clean `origin/main` `2490fe2` (server `792/792`, client `206/206`)
Status: `RED_ACCEPTANCE_CONTRACT_DEFINED — IMPLEMENTATION_NOT_STARTED`

This is the binding G3 map for BR-083–093 and AT-150–174. The acceptance
files intentionally describe wished-for behavior through the existing
`createReviewService` and `createSupportService` factories. Production code is
unchanged in this task.

## Actor and permission matrix

| Actor | Allowed SL-008 behavior | Explicit denial |
|---|---|---|
| Guest | Public Review list/count/one-decimal mean only | Review commands; all Support reads/commands |
| Customer | Own Review create/read/update/publication; own Support create/read/message/withdraw/reopen | Foreign records; moderation; claim; priority; transfer; resolve |
| Staff | Minimum Review moderation projection/command; Support operational projection; claim/recovery; current-Active-assignee message/priority/transfer/resolve | Customer publication/content edit/delete; commands on another assignee's ticket |
| Admin | None | All SL-008 routes and controls, including direct navigation |
| WarehouseManager | None | All SL-008 routes and controls, including direct navigation |
| System | Eligibility/reference validation; atomic aggregate/history/audit/outbox; durable replay | Invent ownership; leak full user text/sensitive data; mutate foreign domains |

## State maps

### Review independent state dimensions

| Dimension | State | Allowed transition | Visibility effect |
|---|---|---|---|
| Customer publication | `Published` | Customer → `Withdrawn` | Hidden, irrespective of moderation |
| Customer publication | `Withdrawn` | Customer → `Published` | Visible only if moderation/catalog dependencies also pass |
| Staff moderation | `Allowed` | Staff → `HiddenByStaff` with reason | Hidden, irrespective of publication |
| Staff moderation | `HiddenByStaff` | Staff → `Allowed` with reason | Visible only if publication/publication dependencies also pass |
| Derived public state | none persisted | no command | `Published && Allowed && Product.Active && Category.Active` |

Content, publication and moderation histories are append-only. There is no
Review delete command and Staff cannot edit rating/content or Customer
publication.

### Support state and assignment

| Current state | Actor/command | Required next state/effect |
|---|---|---|
| `New`, unassigned | first Active Staff `claim` | `InProgress`, assigned once; concurrent loser has no effects |
| `New`, unassigned | owning Customer `withdraw` | `Withdrawn` |
| `New` / `InProgress` | owning Customer `appendMessage` | state unchanged; immutable message appended |
| `InProgress`, assigned | current Active assignee message/priority/transfer | append message/history; state remains `InProgress` |
| `InProgress`, assigned | current Active assignee `resolve` | atomically append final message/history and set exact `resolvedAt` |
| `InProgress`, assignee disabled | system clear | assignee null once; retain state/priority/messages/history |
| `InProgress`, unassigned recovery | first Active Staff `claim` | assigned recovery; state remains `InProgress` |
| `Resolved` | owning Customer `reopen` with message at/before deadline | `InProgress`; retain the current assignee when that Staff account is Active, otherwise clear the inactive assignee; message/history appended |
| `Resolved` after exact deadline | any reopen | denial and no effects |
| `Withdrawn` | any transition | denial and no effects |

## Exact HTTP route contract

| Method/route | Actor | Request/read contract |
|---|---|---|
| `GET /api/products/:productId/reviews?page&pageSize` | Guest | Exact public visible projection and aggregate |
| `GET /api/customer/reviews?page&pageSize` | Customer | Own safe Review management page with publication/moderation/version/history summary |
| `POST /api/products/:productId/reviews` | Customer | `{orderDetailId?,rating,content?,expectedVersion}` |
| `PATCH /api/reviews/:reviewId` | owning Customer | `{rating,content?,expectedVersion}` |
| `PATCH /api/reviews/:reviewId/publication` | owning Customer | `{publicationStatus,expectedVersion}` |
| `GET /api/staff/reviews?page&pageSize&productId&publicationStatus&moderationStatus` | Staff | Minimum moderation projection |
| `PATCH /api/staff/reviews/:reviewId/moderation` | Staff | `{moderationStatus,reason,expectedVersion}` |
| `POST /api/support-requests` | Customer | `{type,subject,initialMessage,orderId?,productId?,expectedVersion}` |
| `GET /api/support-requests/my?page&pageSize` | Customer | Own minimum tickets |
| `GET /api/support-requests/:ticketId?page&pageSize` | owning Customer | Own ticket and chronological message page |
| `POST /api/support-requests/:ticketId/messages` | owning Customer | `{message,expectedVersion}` |
| `PATCH /api/support-requests/:ticketId/withdraw` | owning Customer | `{expectedVersion}` |
| `POST /api/support-requests/:ticketId/reopen` | owning Customer | `{message,expectedVersion}` |
| `GET /api/staff/support-requests?type&dateFrom&dateTo&status&priority&assigneeId&page&pageSize` | Staff | Server-filtered minimum operational page |
| `GET /api/staff/support-requests/:ticketId?page&pageSize` | Staff | Staff-safe ticket/messages/histories |
| `POST /api/staff/support-requests/:ticketId/claim` | Active Staff | `{expectedVersion}` |
| `POST /api/staff/support-requests/:ticketId/messages` | current Active assignee | `{message,expectedVersion}` |
| `PATCH /api/staff/support-requests/:ticketId/priority` | current Active assignee | `{priority,reason,expectedVersion}` |
| `PATCH /api/staff/support-requests/:ticketId/transfer` | current Active assignee | `{assigneeId,reason,expectedVersion}` |
| `POST /api/staff/support-requests/:ticketId/resolve` | current Active assignee | `{finalMessage,expectedVersion}` |

## Data, index, and event contract

| Aggregate/data | Required state/index |
|---|---|
| `ProductReview` | Durable unique `{customerId,productId}`; chosen `orderDetailId`; rating/content; independent publication/moderation; version; createdAt/updatedAt |
| Review histories | Append-only content, publication and moderation records; aggregate/version/actor/timestamp; no update/delete |
| Public Review query | Compound visible query/order index ending `createdAt DESC, _id DESC`; list/count/mean share identical predicate |
| `SupportRequest` | Unique `ticketCode`; Customer/type/subject/refs/status/priority/assignee/resolvedAt/version/timestamps |
| `SupportMessage` | Append-only ticket/actor/content/timestamp; chronological paging index; unique command identity |
| Support histories | Append-only assignment, priority and resolution records |
| Command records | Actor + aggregate + operation + idempotency key unique; immutable fingerprint/result/current-result identity |
| Cross-cutting | Domain + history + audit + DomainOutbox in one transaction/session |

Event names are locked as `REVIEW_CREATED`, `REVIEW_UPDATED`,
`REVIEW_PUBLICATION_CHANGED`, `REVIEW_MODERATION_CHANGED`,
`SUPPORT_CREATED`, `SUPPORT_CLAIMED`, `SUPPORT_MESSAGE_APPENDED`,
`SUPPORT_PRIORITY_CHANGED`, `SUPPORT_TRANSFERRED`, `SUPPORT_WITHDRAWN`,
`SUPPORT_RESOLVED`, `SUPPORT_REOPENED`, and `ASSIGNEE_CLEARED`.
Audit/outbox payloads contain identifiers and minimum event metadata, never
full Review/Support text, email, phone, or other sensitive data.

## Technical implementation locks

The following are implementation decisions needed to make approved BR/AT
behavior deterministic, retry-safe, and testable. They do **not** add or alter
business permissions, states, eligibility, or transitions.

| Lock | Exact decision | Why it is needed without changing BR/AT behavior |
|---|---|---|
| Review evidence selection | Optional `orderDetailId`; otherwise `Order.deliveredAt DESC`, then `OrderDetail._id DESC` | Gives AT-151 one deterministic result when multiple already-approved eligible details exist |
| Support reference interpretation | Order/Payment/ReturnRefund/Exchange require owned Order; Product requires Active Product and may include owned Order; Account/Other refs optional but valid when supplied | Makes the approved type/reference matrix executable and privacy-safe |
| Reason size | Priority/transfer reason is normalized 5–500 characters | Persists useful immutable history while bounding input; does not grant a transition |
| Paging | Default `page=1`, `pageSize=20`; maximum `pageSize=50` | Prevents unbounded reads and makes AT-159/165/173 stable |
| Command identity | Every mutation has `Idempotency-Key` header, normalized 8–128 characters; public services receive it only as the separate final options argument while JSON retains `expectedVersion` and never embeds the key | Provides the durable retry/race identity required by AT-160/174 without mixing transport metadata into command facts |
| Optimistic state | Create uses `expectedVersion=0`; later state mutation must match current non-negative integer version in JSON | Gives stale losers a deterministic no-effect conflict under AT-160/174 |
| Atomicity | Aggregate, immutable history, audit, command result, and DomainOutbox share one transaction | Enforces approved all-or-none effects and delivery retry |
| Migration | Fail fast on ambiguous duplicate Customer+Product Reviews or legacy mutable-history ambiguity; never delete or choose canonical data | Preserves approved one-identity and immutable-history semantics without inventing facts |

## BR → code → acceptance mapping

| BR | Exact approved behavior | Planned code boundary | Executable evidence |
|---|---|---|---|
| BR-083 | One Customer+Product Review identity with delivered owned evidence | Review aggregate/repository/create command | AT-150–153, AT-155, AT-160 |
| BR-084 | Rating/text validation and eligibility privacy | Review validation/eligibility | AT-150, AT-154–156 |
| BR-085 | Independent publication/moderation and immutable Review histories | Review state commands/histories/command transaction | AT-157, AT-158, AT-160 |
| BR-086 | Safe public Review projection, exact aggregate/paging, and concurrency | Review public mapper/query/index/transaction | AT-156, AT-159, AT-160 |
| BR-087 | Seven Support types and exact reference validation | Support create/reference validator | AT-161–164 server/client |
| BR-088 | Immutable initial/later messages and authorized messaging | SupportMessage repository/commands | AT-165 **and AT-166** server/client |
| BR-089 | Approved Support lifecycle, including atomic claim and withdraw/resolve/reopen transitions | Support claim/transition service | AT-167, AT-171, AT-172 |
| BR-090 | Assignment, priority, transfer, disable recovery, and current-assignee operations | Support assignment/priority service and SL-007 adapter | AT-167–170 |
| BR-091 | Private denials and Guest/Customer/Staff minimum projections; no Admin/Warehouse commands | Routes/RBAC/mappers/UI guards | AT-155, AT-156, AT-166, AT-168, AT-173 |
| BR-092 | Support never mutates Order/Payment/Return/Exchange/Shipment/Inventory | Repository dependency boundary | AT-174 foreign-domain snapshot assertions |
| BR-093 | Idempotency/version plus atomic domain/history/audit/outbox | Shared command transaction/persistence | AT-160 and AT-174 Review/Support server/client |

## AT-150–174 requirement → code → test matrix

Every row has a distinct actor, invariant, state, API/UI boundary, executable
evidence, baseline discrepancy, and current status.

| AT | Actor | Exact rule/invariant | Required data/state | API/command or read boundary | Required UI evidence | Executable server/client test | Baseline discrepancy | Status |
|---|---|---|---|---|---|---|---|---|
| AT-150 | Customer | Create atomically from exact owned delivered OrderDetail | Customer+Product unique Review; supplied eligible detail; content history/audit/outbox | `createReview`; `POST /products/:id/reviews` | ProductDetail imports/mounts ProductReviewPanel; authorized selector; no raw ID input; submit handler | Server `AT-150 creates one Review...`; client `AT-150 imports and mounts...` | Legacy create accepts raw orderId and unique Customer+Order+Product | RED |
| AT-151 | Customer/System | No supplied detail chooses newest deliveredAt, then greatest detail ID | Owned delivered Orders/details | `createReview` fallback | Server-issued eligible display selector | Server `AT-151 deterministically falls back...` | Legacy requires an order and has no deterministic fallback | RED |
| AT-152 | Customer | Repeat purchase does not create second Customer+Product identity | Unique Customer+Product index; multiple eligible details | `createReview` identity conflict | Existing Review shown instead of another create form | Server `AT-152 keeps one...` | Legacy uniqueness permits one Review per Order | RED |
| AT-153 | Customer/System | Later return/refund/same-SKU exchange preserves Review identity | Durable Review independent of current after-sales state | `listPublic` after downstream state changes | Same Review remains represented | Server `AT-153 preserves Review...` | Legacy identity is bound to selected Order | RED |
| AT-154 | Customer | Rating integer 1–5; normalized optional text 0–1000 | Validation before writes; immutable normalized content | `createReview`/`updateReview` | 1–5 rating; optional textarea; live 0/1000 counter | Server `AT-154...boundary` plus nine subtests (including missing/nonnumeric rating); client `AT-154 binds...` | Legacy requires nonblank content and has no max | RED |
| AT-155 | Customer/foreign Customer | Invalid, foreign, or non-delivered evidence returns private denial and zero effects | Owned delivered detail predicate; no command/history/audit/outbox on denial | `createReview`; generic 404-style eligibility error | Field/general error without foreign IDs | Server `AT-155 denies invalid...`; client reference/field-error contracts | Legacy varies 400/404/409 and can disclose delivery/containment facts | RED |
| AT-156 | Guest | Public DTO exact safe keys; only Active Product+Category dependencies | masked current display name; verified label; visible Review | `listPublic`; public GET | PublicReviewList safe fields only | Server `AT-156 returns only...`; client `AT-156 renders only...` | Legacy exposes Customer/Order IDs and does not enforce Category Active | RED |
| AT-157 | Customer/Staff | Publication and moderation change independently | `Published/Withdrawn`; `Allowed/HiddenByStaff`; separate histories | `setPublication`, `moderate` | Customer withdraw/republish separate from Staff reasoned moderation | Server/client `AT-157...` | Legacy one `Visible/Hidden` status | RED |
| AT-158 | Customer/Staff | Histories immutable; no delete; Staff cannot edit content/publication | append-only content/publication/moderation records | `updateReview`; no delete; Staff edit forbidden | Customer edit handler; no delete; Staff moderation-only UI | Server/client `AT-158...` | Legacy overwrites document and has no histories | RED |
| AT-159 | Guest | List/count/one-decimal mean share exact visible set; createdAt DESC+ID DESC paging; edit does not reposition | public query/index; immutable createdAt; updatedAt changes only | `listPublic`; public GET paging | aggregate/totalPages/pageSize/toFixed(1) | Server/client `AT-159...` | Legacy unbounded list/in-memory mean; no stable ID tie break | RED |
| AT-160 | Customer/Staff/System | Replay/race applies once; stale loser has no aggregate/history/audit/outbox effects; key is service options/header metadata, never JSON | command key/fingerprint/result; version; transaction | All Review commands; separate final `{idempotencyKey}` options and JSON `expectedVersion` | Four mocked command requests verify header key+JSON version; pending locks block repeated UI submit/click | Server `AT-160 applies distinct/same-key races...`; client command/pending tests | Legacy has no key/version/transactional outbox | RED |
| AT-161 | Customer | Seven types enforce approved reference matrix; create unique/New/unassigned/Normal + immutable initial message | ticket code; SupportRequest; initial SupportMessage | `createRequest`; Support POST | All seven type values and type-dependent selectors | Server `AT-161 accepts all seven...`; client `AT-161 binds...` | Legacy lacks Exchange/Account and stores mutable content | RED |
| AT-162 | Customer/foreign Customer | Missing/foreign required Order is private denial with no effects | owned Order predicate | `createRequest` | Server-authorized Order selector and private field errors | Server `AT-162 denies...`; client `AT-162/163/164...` | Legacy optional raw Order input | RED |
| AT-163 | Customer | Missing/inactive Product or Product+Order mismatch is denied without effects | Active Product and matching OrderDetail | `createRequest` | Active Product selector conditional on type | Server `AT-163 denies...`; client type/reference tests | Legacy lacks Active/match validation | RED |
| AT-164 | Customer | Account/Other may omit refs; supplied refs must still be owned/valid | nullable refs plus validators | `createRequest` | Selectors optional only for Account/Other | Server `AT-164 permits...`; client type/reference tests | Legacy Other accepts loose optional Order and has no Account | RED |
| AT-165 | Customer/Staff | Initial/later messages immutable, chronological, paged, and command-idempotent | append-only SupportMessage + command identity | `appendMessage`; ticket read page | Message timeline/page; no edit/delete | Server/client `AT-165...` | Legacy mutable content/response fields | RED |
| AT-166 | Customer/Staff | Owner may message New/InProgress; only current Active assignee may Staff-message | ownership, status, assignee Active | `appendMessage` customer/staff routes | Owner status guard; assignee-only Staff message control | Server/client `AT-166...` | Legacy Staff response implicitly assigns and overwrites | RED |
| AT-167 | two Active Staff | Simultaneous claim has exactly one winner/history | New or recovery-unassigned ticket; conditional version update | `claim`; Staff claim POST | Queue claim/recovery action | Server `AT-167 makes a two-Staff claim race...`; client `AT-167 binds...` | Legacy has no claim command/race guard | RED |
| AT-168 | Customer/Staff/Admin/Warehouse | Only current Active assignee can message/change priority/transfer/resolve | assignee ID/status and actor role | four assignee-only commands | Controls under one current-assignee condition | Server/client `AT-168...` | Legacy any Staff may respond/transition | RED |
| AT-169 | current Active assignee | Priority enum and transfer Active Staff/reason validated; histories append | priority/assignment histories; Active Staff target | `changePriority`, `transfer` | enum, reason, Active Staff selector/handlers | Server/client `AT-169...` | Legacy no priority/transfer/history | RED |
| AT-170 | System/Active Staff | Disable clears assignee once, retains InProgress/priority/messages/history, permits reclaim | active-assignment adapter; `ASSIGNEE_CLEARED`; recovery unassigned | `clearDisabledAssignee`, `claim` recovery | recovery label/reclaim; retained detail | Server/client `AT-170...` | Legacy handledBy stays disabled and has no recovery | RED |
| AT-171 | owning Customer/current assignee | Withdraw only unassigned New; resolve atomically appends final response and deadline; no generic transitions | approved state map; final SupportMessage; resolution history | `withdraw`, `resolve` | New+unassigned withdraw; final response form; no generic status dropdown | Server/client `AT-171...` | Legacy generic response/status mutation | RED |
| AT-172 | owning Customer | Reopen by message is allowed through exact resolvedAt+72h and denied at +1ms; retain an Active current assignee and clear only an inactive one | resolvedAt/deadline; reopen history/message; `InProgress`; conditional assignee retention/clear | `reopen` | server deadline display and disabled expired action | Server/client `AT-172...` | Legacy Resolved is terminal | RED |
| AT-173 | Guest/Customer/Staff/Admin/Warehouse | Customer own Reviews and owner/Staff Support projections are paged/private; invalid filters rejected; direct navigation obeys RBAC | safe DTOs; Customer own Review publication/moderation/version/history summary; protected Customer route and role guards | public Review, protected `GET /customer/reviews`, own Support, Staff moderation/operational reads | ProductReviewPanel loads/paginates own safe management DTO; filters and field errors; Customer/Staff routes only | Server `AT-173 protects Review management...`; client own-read/navigation/projection tests | Legacy leaks internal IDs/content and has partial filters; no Customer own/Staff Review routes | RED |
| AT-174 | System/all command actors | Every Review/Support mutation family restores the exact grouped-write snapshot on injected failure and same-key replay returns the identical result with one exact delta/event/version; audit/outbox omit text; foreign gateways remain unused | aggregate/history/message/command/audit/outbox in one transaction; injected foreign-domain gateway spies | 14-row matrix: Review create/update/publication/moderation; Support create/append/claim/priority/transfer/withdraw/resolve/reopen/disabled-clear/recovery | Review and Support pending locks; four Review and nine Support mocked commands verify header key+JSON version | Server `AT-174 table-drives...`; client command/pending tests | Legacy Support audit contains subject/text and has no outbox/idempotency/version | RED |

## Baseline discrepancies and dependency boundaries

Baseline Review uses Customer+Order+Product uniqueness, requires raw `orderId`,
requires content, has one `Visible/Hidden` state, exposes `customerId` and
`orderId`, and has no immutable histories, version, idempotency, outbox, or
stable server paging.

Baseline Support stores mutable `content` and `response` on one request,
supports only Order/Product/Payment/ReturnRefund/Other, accepts raw optional
Order input, has no first-claim command, no current-assignee matrix, no
priority/transfer/history/disable recovery/reopen window, and no durable
idempotency/version/outbox.

SL-008 may read Order/OrderDetail delivery and ownership, Product/Category
Active state, and User/active-assignment state. It may use shared Mongo
transaction, Audit and DomainOutbox infrastructure. It never changes Order,
Payment, Return, Exchange, Shipment or Inventory; those snapshots are asserted
unchanged by AT-174. Notification delivery consumes SL-008 outbox events but is
outside this slice.

## Migration contract

The planned `migrateSl008ReviewSupport.js`:

1. preflights duplicate Customer+Product Reviews, duplicate ticket codes,
   mutable legacy message/response ambiguity, and index conflicts;
2. fails before business writes when canonical identity/history cannot be
   proven;
3. never deletes, silently chooses canonical data, invents history/commands,
   or rewrites after-sales/foreign-domain records;
4. creates/verifies Review, Support, history, message and command indexes; and
5. is repeat-safe, with a second run producing zero business-data writes.

Production migration remains a deployment-owner action after backup and dry
run.

## Current RED evidence

Exact commands executed after this rework:

```text
server> node --test src/acceptance/sl008.acceptance.test.js
tests 36; pass 0; fail 36
(25 AT tests plus nine explicit AT-154 boundary subtests)

client> node --test src/acceptance/sl008UiContract.test.js
tests 39; pass 0; fail 39
```

Representative expected failures:

- server `createReview` is absent on the legacy Review service;
- server `createRequest` is absent on the legacy Support service;
- ProductDetail does not import/mount `ProductReviewPanel`;
- client Review/Support services lack the locked command methods and therefore
  cannot send `Idempotency-Key` plus JSON `expectedVersion`;
- legacy Customer Support still renders a raw `orderId` input and legacy Staff
  Support has no claim/current-assignee/priority/transfer/recovery UI.

All test modules load and execute. Failures are assertions for missing SL-008
behavior/interface, not syntax, missing-module, or test-fixture setup failures.
