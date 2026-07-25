# Staff Flow Business and Queue Hardening Design

**Date:** 2026-07-26

**Scope:** Staff COD fulfillment, failed-delivery recording, Return/Exchange/COD
guards, Staff operational queues, Damage Report continuity, and atomic
audit/outbox closure

**Status:** Design approved in conversation; written specification pending final
review

**Business approver:** Project owner (approved option 2 in the Codex task on
2026-07-26)

**Implementation branch:** `feature/phase2-business-guards`

**Implementation baseline:** `6b8e4cc02d21a1b4f28b25ac43b8107601e83287`

## 1. Goal

Harden every Staff-owned transition already in scope without adding a new
business feature or changing the project architecture.

The release must preserve the successful COD path:

`Pending -> Confirmed -> Packed -> Shipped -> Delivered`

and make the following behavior reliable:

1. Staff can record approved manual Carrier and COD evidence in every runtime.
2. A failed delivery does not falsely mark an Order as successfully delivered
   or paid.
3. Return, Exchange, Refund, and COD reconciliation reject stale or
   contradictory commands.
4. Domain state, audit facts, and required outbox facts commit together for the
   protected transitions changed by this scope.
5. Staff queues remain usable after refresh, show loading and errors clearly,
   and use bounded server pagination.
6. Damage Reports created by a Staff member remain visible to that Staff member
   after refresh.

The scope does not add Carrier API integration, payment methods, return
reasons, advanced analytics, full-text customer search, or a new status model.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-060 | Project owner approval in the current Codex task | 2026-07-26 | Option 2 scope, preservation of the current happy path, and authorization to fix the audited Staff gaps together | Approved requirement | Project owner | None |
| SRC-061 | Current SRS Google Doc, Staff/COD/Carrier/after-sales sections | Read 2026-07-26 | Staff is CSKH, Carrier is external, manual Carrier evidence is the approved release behavior, amounts are server-derived, and protected transitions require attributable evidence | Approved requirement | Project owner | Older repository design files and tests still encode legacy evidence labels and `DeliveryFailed` Order writes |
| SRC-062 | `docs/superpowers/specs/2026-07-22-sl-003-order-payment-cancellation-design.md` | 2026-07-22 | Staff confirmation/cancellation boundary and refund handoff | Approved requirement | Project owner | Audit/outbox implementation is incomplete for cancellation |
| SRC-063 | `docs/superpowers/specs/2026-07-22-sl-004-fulfillment-delivery-design.md` plus current SRS correction | Inspected 2026-07-26 | Fulfillment custody, failed attempts, terminal evidence, payment consequences, and legacy behavior | Approved requirement with later correction | Project owner | The older file uses terminal `OrderStatus=DeliveryFailed`; the later approved SRS correction keeps the Order projection at `Shipped` and records terminal failure as shipment/incident evidence |
| SRC-064 | `docs/superpowers/specs/2026-07-23-sl-008-product-review-customer-support-design.md` | 2026-07-23 | Review moderation is `Allowed <-> HiddenByStaff`; Support is `New -> InProgress -> Resolved` | Approved requirement | Project owner | The supplied external review incorrectly described Review as `Pending -> Approved/Rejected` and counted a non-canonical Support `Open` state |
| SRC-065 | Repository source and tests | Commit `6b8e4cc`, inspected 2026-07-26 | Existing routes, RBAC, transactions, queues, pagination gaps, Damage Report continuity gap, and regression baseline | Observed behavior | Engineering team | Current code/tests disagree with SRC-061 and the later correction in SRC-063 |
| SRC-066 | Dirty `fix/after-sales-business-rules` worktree | Based on `59aa9ce`, inspected 2026-07-26 | Uncommitted Return/Exchange/COD guard fixes and tests that must be reconciled instead of overwritten | Observed behavior | Engineering team | Changes are not present on the implementation branch |

When observed behavior conflicts with the later approved SRS correction, the
approved correction controls new writes. Existing legacy data remains readable.

## 3. Actor Responsibility Matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Staff / CSKH | Process Orders and Customer operational cases safely | Confirm/cancel eligible Orders; pack; record manual Carrier/COD evidence; decide and reconcile approved Return/Exchange/Refund cases; create and withdraw own Damage Reports; moderate Reviews; process assigned Support | Complete Warehouse export/inspection; choose arbitrary refund/COD amounts; fabricate Carrier evidence; mutate another role's authority; read another Staff member's private Damage Report by direct ID | `Pending -> Confirmed`; eligible cancellation; `Confirmed -> Packed`; `Packed -> Shipped`; evidence-backed `Shipped -> Delivered`; Staff-owned after-sales transitions | Operational Order/case data and minimum Customer data needed for the task; own Damage Reports; no password, token, full payment secret, or unrestricted personal search | Confirmed Order to Warehouse; exported parcel to external Carrier; returned parcel to Warehouse; verified payout/recovery facts to Customer | Stale state, missing stock/evidence, duplicate command, role mismatch, or amount mismatch leaves the prior state unchanged |
| Customer | Receive accurate Order/case outcomes | Own checkout, Return/Exchange request, destination, handoff, and review content actions already approved | Use Staff endpoints; see another Customer's or Staff's operational data; set Staff/Carrier/payment authority | Customer-owned transitions only | Own Orders, cases, addresses, destinations, evidence, and reviews | Customer request to Staff; physical item to shop/Warehouse | Invalid ownership or stale state is denied without leaking target existence |
| Warehouse Manager | Own inventory/export/receipt facts | Complete export; inspect returned items; reconcile warehouse receipt and damaged stock | Confirm/pack/deliver an Order; record Staff COD collection; moderate Review or Support | Warehouse-owned stock/export/receipt transitions | Inventory and Warehouse queues only | Completed export to Staff; receipt/inspection facts to Staff | Duplicate inventory command cannot double-move stock |
| External Carrier | Physically transport parcels | No authenticated internal role in this release | Call an invented Carrier integration or determine internal Order/payment state | None in the application | No direct application access; Staff records approved evidence | Evidence supplied outside the system and recorded by Staff | Missing or inconsistent evidence blocks the Staff transition |
| System | Enforce state, permissions, idempotency, concurrency, pagination, audit, and outbox invariants | Server-derived validation and atomic writes | Trust frontend role, amount, total, status, Customer ID, or search input | Applies only transitions owned by the authenticated actor | Minimum required data | Durable outbox after the owning transaction | A failed grouped command commits no partial domain/audit/outbox state |

## 4. Approved Decisions

| Decision ID | Slice | Question | Options considered | Approved decision | Rationale | Approver | Date | Requirements |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BD-119 | Staff fulfillment | How should approved manual Carrier/COD evidence work outside development? | Block production; invent Carrier API; allow evidence-backed Staff recording | Allow authenticated Staff recording in every runtime; never invent a Carrier integration | Manual handling is the approved release architecture | Project owner | 2026-07-26 | BR-130, BR-131 |
| BD-120 | Failed delivery | How should new failed delivery facts affect Order status? | Immediately create `DeliveryFailed`; mark Delivered; keep Order Shipped and record append-only shipping/incident outcome | Keep new failed attempts and terminal failed-delivery resolutions on the `Shipped` Order projection; distinguish them by Shipping/incident evidence and money resolution | Prevents a failed attempt from becoming success and follows the later SRS correction | Project owner | 2026-07-26 | BR-132 |
| BD-121 | Compatibility | What happens to old evidence labels and `DeliveryFailed` records? | Migrate/delete all; reject legacy; read legacy and write canonical values | Read legacy values, write only the canonical source and corrected state behavior, and do no destructive bulk migration | Keeps demo data and existing records usable | Project owner | 2026-07-26 | BR-131, BR-132 |
| BD-122 | Staff queues | How much queue functionality should be added now? | No change; bounded pagination and code search; full customer/date analytics | Add stable bounded pagination, explicit loading/retry, and direct code search only | Improves reliability without expanding sensitive search scope or architecture | Project owner | 2026-07-26 | BR-137, BR-138 |
| BD-123 | Damage Reports | How should Staff continue work after refresh? | Keep only local state; allow all Staff to see all reports; list only the authenticated Staff member's reports | Add an owned paginated Staff list and use the existing operational evidence uploader | Preserves continuity and least privilege | Project owner | 2026-07-26 | BR-139 |
| BD-124 | Existing working pages | Should Support and Review be changed to match the supplied report? | Rewrite states; leave untouched; retain canonical states and add only missing loading/retry behavior | Preserve canonical Support and Review state models; do not add `Pending/Approved/Rejected` Review states or a new Support `Open` state | The report's state descriptions are not authoritative | Project owner | 2026-07-26 | BR-140 |

## 5. Requirements and Invariants

### BR-130 — Manual Carrier and COD operation

Authenticated Staff may record the approved manual Carrier handoff, delivery
evidence, and COD collection in development, test, staging, and production.
Runtime environment alone must not reject an otherwise valid Staff command.

### BR-131 — Canonical evidence source

Every new manual Carrier/COD evidence record created by Staff uses
`STAFF_RECORDED_CARRIER_EVIDENCE`. Models and readers may continue to accept
legacy `STAFF_EVIDENCE` and `STAFF_RECONCILIATION` values only for backward
compatibility. New writes and audit facts must not emit the legacy values.

### BR-132 — Failed-delivery projection

An unsuccessful delivery attempt:

1. leaves `OrderStatus=Shipped`;
2. records `ShippingStatus=Failed` or the equivalent shipment event;
3. requires a failure reason and attributable evidence;
4. does not set COD to `Paid`;
5. is append-only and idempotent.

A later terminal failed-delivery resolution also does not rewrite the Order to
`Delivered`. It records a terminal incident/resolution fact and executes the
approved money consequence exactly once. Existing `DeliveryFailed` records
remain readable as legacy records.

### BR-133 — Return/Refund guards

Normal Return/Refund approval for unpaid COD requires an open COD discrepancy.
Staff may verify a refund destination only while the request remains in a
receivable or received state. A terminal, rejected, expired, cancelled, or
completed request cannot be reopened by destination verification.

### BR-134 — Exchange guards

Exchange-to-Return conversion loads and validates the Order and Payment,
preserves the payment link, derives any COD hold from the authoritative
payment/discrepancy facts, and never trusts client-supplied money state.
Customer cancellation is denied after physical handoff or while an incident
requires operational resolution.

### BR-135 — COD discrepancy synchronization

Order COD fields and the `CodDiscrepancy` record remain synchronized for
collection, settlement, recovery receipt, recovery progress, and closure. A
replayed command must return the existing result without creating another
financial obligation.

### BR-136 — Atomic protected facts

For the Staff transitions changed in this scope, the owning domain change,
attributable Audit record, and required DomainOutbox record commit in the same
MongoDB transaction. Notification delivery remains asynchronous and must not
roll back an already committed transaction.

### BR-137 — Stable bounded queues

Order, Return/Refund, Exchange, and owned Damage Report Staff lists support:

- default `page=1` and `pageSize=20`;
- maximum `pageSize=100`;
- stable `createdAt DESC, _id DESC` ordering;
- `items`, `total`, `page`, `pageSize`, and `totalPages`;
- status validation using the canonical state set;
- no unbounded result when pagination parameters are omitted.

Existing consumers that read `items` and `total` remain compatible.

### BR-138 — Safe direct-code search

The bounded queues may search only direct operational identifiers:

- Order: `orderCode`;
- Return/Refund: `requestCode`;
- Exchange: `requestCode`.

Search is trimmed, length-bounded, escaped before any regular expression use,
and cannot search unrestricted Customer personal data in this release.

### BR-139 — Staff Damage Report continuity

Staff can list only Damage Reports where `reportedBy` equals the authenticated
Staff ID. The creation form uses the existing operational image uploader rather
than requiring a manually typed evidence reference. Created and withdrawn
reports remain visible after refresh. Direct access to another Staff member's
report remains denied.

### BR-140 — Preserve canonical Support and Review states

Support remains `New -> InProgress -> Resolved` with the approved withdraw and
reopen behavior. Review moderation remains
`Allowed <-> HiddenByStaff`, independent of Customer publication. No new
`Open`, `Pending`, `Approved`, or `Rejected` state is added merely to match the
supplied review.

## 6. API and UI Design

### Existing commands retained

All current Staff command paths remain unchanged. Request bodies remain
server-validated, and backend RBAC remains the authority.

### List contracts

| Queue | Endpoint | Added query parameters | Ownership |
| --- | --- | --- | --- |
| Orders | `GET /api/staff/orders` | `status`, `q`, `page`, `pageSize`, existing date filters | All operational Orders visible to Staff |
| Return/Refund | `GET /api/staff/return-refunds` | `status`, `q`, `page`, `pageSize` | All operational Return/Refund requests visible to Staff |
| Exchange | `GET /api/staff/exchanges` | `status`, `q`, `page`, `pageSize` | All operational Exchange requests visible to Staff |
| Damage Reports | `GET /api/staff/damage-reports` | `status`, `page`, `pageSize` | Only reports created by the authenticated Staff member |

Every list page shows:

1. an initial loading indicator;
2. a disabled/busy state while changing a filter or page;
3. an actionable error with a retry button;
4. an explicit empty state;
5. previous/next controls when more than one page exists.

The Dashboard:

- computes open Support from canonical `New + InProgress` totals;
- removes the synthetic `openSupport: { total: 0 }` argument;
- retains the last successfully loaded values when a refresh fails;
- exposes a retry action.

Review already has server pagination. It receives only missing loading/retry
handling; its state vocabulary is unchanged.

## 7. Data and Compatibility

No destructive migration is part of this scope.

1. Existing Orders with `DeliveryFailed` remain valid for reads, invoice
   eligibility, history, and old reports.
2. Existing Staff evidence source strings remain accepted by model readers.
3. New evidence writes use the canonical value.
4. Queue responses add pagination metadata without removing `items` or `total`.
5. No existing route is renamed or removed.
6. The uncommitted after-sales worktree is treated as source evidence. Its
   relevant guarded changes are reconciled into this branch; unrelated files
   and operational-evidence uploads are not copied or deleted.

## 8. Error Handling and Security

1. RBAC stays enforced by backend middleware and service-level ownership/state
   checks; frontend route hiding is not authorization.
2. Invalid page, page size, status, and search parameters return a handled
   `400`, not a `500`.
3. Invalid or foreign IDs return the existing non-leaking `403/404` behavior.
4. Search input is escaped and cannot become a regular-expression injection or
   unrestricted personal-data lookup.
5. Financial amounts, payment state, Staff role, Customer ID, and Order status
   remain server-derived.
6. Duplicate or concurrent commands cannot double-deliver, double-pay,
   double-refund, double-move inventory, or create duplicate outbox facts.
7. Error responses and queue DTOs do not include secrets, credentials, raw
   gateway payloads, or full refund destinations.

## 9. Acceptance Tests

| Test ID | Acceptance behavior | Classification |
| --- | --- | --- |
| AT-247 | A valid Staff manual Carrier/COD command succeeds under a production runtime and writes the canonical evidence source | Approved requirement |
| AT-248 | A failed attempt keeps the Order Shipped, records failure evidence, and leaves COD unpaid | Approved requirement |
| AT-249 | Replaying or concurrently sending a failed/terminal delivery command creates one business effect | Approved requirement |
| AT-250 | Unpaid COD Return approval without an open discrepancy is denied | Approved requirement |
| AT-251 | Destination verification after a terminal Return/Refund state is denied | Approved requirement |
| AT-252 | Exchange-to-Return derives payment/COD hold from persisted Order, Payment, and discrepancy facts | Approved requirement |
| AT-253 | Customer cannot cancel an Exchange after physical handoff or during incident resolution | Approved requirement |
| AT-254 | COD discrepancy collection and Order COD fields stay synchronized through recovery and closure | Approved requirement |
| AT-255 | Each changed protected Staff transaction writes domain, Audit, and required DomainOutbox facts atomically | Approved requirement |
| AT-256 | Order, Return, Exchange, and Damage queues reject invalid paging and return stable bounded metadata | Approved requirement |
| AT-257 | Direct-code search matches only escaped, bounded order/request codes | Approved requirement |
| AT-258 | Dashboard totals equal canonical pending Order/Return and `New + InProgress` Support totals and can retry after failure | Approved requirement |
| AT-259 | A Staff member refreshes Damage Reports and sees own prior report, but cannot list or open another Staff member's report | Approved requirement |
| AT-260 | Damage creation uploads operational evidence and a duplicate submission does not quarantine stock twice | Approved requirement |
| AT-261 | Review remains `Allowed/HiddenByStaff` with working pagination, loading, and retry | Approved requirement |
| AT-262 | Full backend tests, full frontend tests, frontend production build, and the COD happy-path regression pass | Approved requirement |

## 10. Implementation Order

1. Add red tests for production manual evidence, canonical source, and failed
   delivery projection.
2. Reconcile and test the pending Return/Exchange/COD guards.
3. Add transactional audit/outbox closure for the changed protected commands.
4. Add paginated query contracts and direct-code search.
5. Add Dashboard and queue loading/retry behavior.
6. Add owned Damage Report list and operational evidence UI.
7. Preserve Review/Support state vocabulary and add only missing reliability
   behavior.
8. Run targeted tests after every slice, then full backend/frontend/build and
   COD regression verification.

## 11. Out of Scope

- External Carrier API, webhook, map, or automatic tracking.
- Online-payment redesign.
- New Return/Exchange reasons or refund amount selection.
- Customer-name, phone, email, or address search.
- Advanced reports, analytics, export files, or real-time dashboard.
- Bulk migration or deletion of legacy `DeliveryFailed` and evidence-source
  records.
- Pagination refactors for unrelated Admin/Warehouse/Customer pages.

## 12. Self-Review

- No placeholder or unresolved implementation decision remains.
- The happy COD path and actor boundaries are unchanged.
- The later approved failed-delivery correction is explicit and legacy data is
  preserved.
- Review and Support are protected from the incorrect state descriptions in
  the supplied report.
- Pagination/search scope is bounded and backward compatible.
- Data ownership, error handling, idempotency, concurrency, audit, outbox, and
  verification evidence are all testable.
