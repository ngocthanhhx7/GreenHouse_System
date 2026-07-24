# SL-009 Implementation Plan

**Slice:** Notification, Audit, Reporting, and Configuration

**Normative design:** `docs/superpowers/specs/2026-07-23-sl-009-notification-audit-reporting-configuration-design.md`

**Business rules:** BR-094 through BR-105

**Acceptance criteria:** AT-175 through AT-204

**Integration reviewer:** Nguyen Ngoc Thanh

## 1. Ownership and delivery strategy

SL-009 is delivered in one feature branch and one pull request so it remains one
reviewable slice. Commits are separated by the documented owner and use that
owner's exact Git identity.

| Area | Owner | Commit identity |
|---|---|---|
| Audit, DomainOutbox foundation, EmailOutbox delivery, final integration | Nguyen Ngoc Thanh | `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>` |
| Notification domain, inbox API/UI, event consumption | Nguyen Quang Huy | `Nguyễn Quang Huy <quanghuyn267@gmail.com>` |
| Reports and System Settings | Le Vu Cuong | `Lê Vũ Cường <levucuong0319@gmail.com>` |

Branch: `feature/sl-009-notification-audit-reporting-config`.

Implementation order is foundation, Notification/Email, Reporting/Settings,
then integration. Independent code and test work may run in parallel after the
foundation contract is fixed, but shared files and migrations are integrated
serially.

## 2. Actor and permission matrix

| Actor | Allowed | Explicitly denied |
|---|---|---|
| Guest | Receive identity/security email when the flow permits it | Inbox, Audit, Reports, Settings |
| Customer | Own in-app notifications; read then archive; follow authorized customer target links | Other users' notification IDs; internal targets; Audit, Reports, Settings |
| Staff | Own internal notifications and authorized operational targets | Other users' inboxes; Admin reports/settings/audit |
| WarehouseManager | Own warehouse notifications and authorized warehouse targets | Other users' inboxes; Staff/Admin mutations through a target link |
| Admin | Own notifications; read Audit; read Reports; update allowlisted Settings | Mutating Audit; bypassing target authorization; warehouse-only mutations |
| System | Emit attributed audit/outbox events and delivery results | User-session impersonation |
| payOS, Carrier, EmailService | Emit attributed integration evidence only through verified adapters | User permissions or unverified state changes |

Every protected endpoint rechecks the current actor, role, target ownership,
target state, and field-level authority. A notification target is navigation
metadata and never an authorization grant.

## 3. State machines

### 3.1 In-app notification

`Unread -> Read -> Archived`

- `Read` is idempotent.
- Archive is owner-only and only valid after Read.
- Archive removes the item from active/unread results but retains the record.
- There is no hard-delete route.

### 3.2 Email delivery

`Pending -> Processing -> Sent`

Failure from Processing moves to `RetryScheduled` while total attempts are less
than five. The fifth failed attempt moves to terminal `Failed`. A stale
Processing lease may be reclaimed exactly once by a valid worker. Every attempt
is append-only evidence; finalization is lease-token conditional.

### 3.3 Domain outbox

`Pending -> Processing -> Completed` with bounded retry/reclaim semantics.
Source state, mandatory Audit, and DomainOutbox are committed in one MongoDB
transaction. External delivery occurs only after commit.

### 3.4 Settings batch

One accepted batch creates exactly one new version. Duplicate idempotency keys
with the same canonical facts replay; different facts conflict. A stale expected
version, unknown key, invalid value, missing reason, or any injected audit/outbox
failure rejects the whole batch.

## 4. Business-rule decisions

### Notification and email

- Logical uniqueness is `(businessEventId, recipientIdentity,
  notificationType, channel)`.
- Identity/security events use email and may use in-app only when an accessible
  account exists.
- Customer order, payment, refund, return, exchange, review moderation, and
  customer-visible support results use email plus in-app.
- Internal assignment, inventory, damage, replenishment, and operational events
  use in-app only.
- Packing is audit-only.
- Payloads and templates exclude credentials, OTP/token/session/cookie values,
  full address, refund destination, raw provider callbacks, raw evidence, and
  full Review/Support content.

### Audit

- Audit is append-only and has no update/delete API.
- Required attribution supports User, System, payOS, Carrier, and EmailService.
- Required facts include actor/role snapshot, source, action, target, outcome,
  correlation/business event, reason when applicable, state version, and time.
- API is Admin-only with stable `(timestamp, _id)` cursor paging and validated
  filters for period, actor, role, action, target, and outcome.
- An allowlist serializer is used; arbitrary `before`/`after` objects are never
  exposed or newly persisted.

### Reports

- Periods use Asia/Ho_Chi_Minh half-open boundaries.
- Omitted period means current month; all-time is explicit.
- Every result includes `generatedAt` and `dataAsOf`.
- A CompletedSale is immutable and exists only after Delivered plus verified
  full customer collection. Its event time is DeliveredAt when collection is
  already complete, otherwise PaidAt.
- Carrier settlement never controls sale recognition.
- Refund deductions use the distinct Refund obligation's RefundedAt.
- Gross remains stable after later returns/refunds; Net = Gross - Refund and may
  be negative.
- Period event metrics remain separate from current-state snapshots.

### Settings

- The only keys are `PAYMENT_TIMEOUT_MINUTES` and
  `LOW_STOCK_DEFAULT_THRESHOLD`.
- Payment timeout defaults to 15 and accepts integers 5 through 60. It is
  snapshotted only into future online orders.
- Low-stock default is a non-negative integer. A Product override wins.
- `RETURN_WINDOW_DAYS` does not exist; Return/Exchange rights remain fixed at
  five days.
- A successful threshold version change triggers idempotent re-evaluation
  without rewriting history or duplicating open alerts.

## 5. Data changes

| Data area | Required change |
|---|---|
| DomainOutbox | Safe allowlisted payload, business event identity, bounded claim/retry evidence, shared atomic producer contract |
| Notification | Business event/recipient/type/channel unique key, explicit in-app lifecycle, archive timestamp, safe target metadata |
| EmailOutbox | RetryScheduled, maximum five attempts, next attempt time, lease token, append-only attempt evidence |
| AuditLog | Immutable audit ID, actor/source/outcome/correlation/version/reason schema and stable cursor indexes |
| Reporting projections | Immutable CompletedSale and Refund event facts or equivalent authoritative projections; snapshot `dataAsOf` |
| Settings | Versioned batch and history with expected version, reason, idempotency identity, effective time |

The migration must be repeat-safe and fail closed on ambiguous legacy identity.
It must not invent historical sales/refunds or fabricate private audit facts.
Legacy `RETURN_WINDOW_DAYS` is removed from active configuration and demo data.

## 6. Current-code discrepancies

1. Source mutations do not consistently commit Audit and DomainOutbox in the
   same transaction; several audits occur after commit.
2. Notification uniqueness is only `(userId, eventId)`, lifecycle is
   `isRead/deletedAt`, and Email-channel notifications do not reliably enqueue
   EmailOutbox.
3. Email delivery has no RetryScheduled state, terminal five-attempt rule, or
   append-only attempt history.
4. Audit lacks non-user actor attribution, role/outcome/correlation/version
   facts, privacy allowlisting, and stable cursor/filter support.
5. Reports derive revenue from mutable current Order/Return status and load
   large datasets into memory; current-month/all-time semantics and detailed
   report definitions are absent.
6. Settings permit `RETURN_WINDOW_DAYS`, silently ignore unsupported keys, and
   update keys sequentially without version, reason, idempotency, compare-and-
   swap, audit, or outbox atomicity.
7. The current UI deletes notifications, has no archive/history view, exposes
   incomplete Audit/report filters, and has no versioned Settings form.

## 7. Acceptance-first implementation sequence

### Phase A - Atomic foundation (Thanh)

1. Add RED acceptance tests for AT-175, AT-176, AT-182 through AT-189.
2. Add safe event/audit serializers and one transaction-aware producer.
3. Upgrade DomainOutbox, AuditLog, EmailOutbox models and repository contracts.
4. Add stable audit query and immutable route tests.

### Phase B - Notification and email (Huy + Thanh)

1. Add RED tests for AT-177 through AT-181.
2. Upgrade Notification identity/lifecycle, policy resolver, event consumer,
   owner-safe API, target resolver, and client inbox/bell/detail.
3. Extend EmailOutbox worker/templates with bounded attempts and delivery audit.
4. Retrofit minimum-safe domain events at approved source seams.

### Phase C - Reporting (Cuong)

1. Add RED tests for AT-190 through AT-198.
2. Introduce immutable sale/refund reporting facts from existing source events.
3. Implement bounded aggregation endpoints for Revenue, Order, Product,
   Customer, Staff, and Inventory plus current snapshots.
4. Implement current-month/all-time metadata and Admin UI.

### Phase D - Configuration (Cuong)

1. Add RED tests for AT-199 through AT-204.
2. Implement versioned atomic batch Settings and exact validation.
3. Snapshot payment timeout on future orders and re-evaluate low-stock using
   Product override precedence.
4. Remove RETURN_WINDOW_DAYS from API, UI, fixtures, seeds, and validators.

### Phase E - Migration and integration (Thanh)

1. Add preflight, dry-run, apply, verifier, and second-run zero-write tests.
2. Run all SL-001 through SL-009 regression suites and production client build.
3. Verify Guest, Customer, Staff, WarehouseManager, Admin, System, payOS,
   Carrier, and EmailService boundaries directly.
4. Write G3 traceability, release audit, and handoff before review.

## 8. Acceptance trace matrix

| Acceptance | Planned evidence |
|---|---|
| AT-175-176 | Atomic producer rollback/replay and channel-level deduplication tests |
| AT-177-182 | Channel matrix, safe templates, inbox lifecycle, target recheck, bounded email retry tests |
| AT-183-189 | Actor attribution, denied/failed outcomes, privacy serializer, immutable Admin cursor API tests |
| AT-190-198 | Vietnam period, immutable sale/refund, negative net, detailed report, snapshot and RBAC tests |
| AT-199-204 | Exact allowlist, timeout bounds/snapshot, threshold override/re-evaluation, forbidden legacy key, atomic versioned batch tests |

## 9. Verification gates

- Focused tests turn RED for the intended missing rule before implementation.
- Server and client full regression pass.
- Production client build passes.
- Migration preflight and verifier pass; the second apply performs zero business
  writes.
- Actor and direct-navigation authorization are verified.
- No source mutation can commit without its mandatory audit/outbox facts.
- No secret, `.env`, runtime upload, local output, `docs/superpowers`, or
  `docs/ui-prompts` file is committed.
