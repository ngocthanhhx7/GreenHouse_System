# SL-009 Notification, Audit, Reporting, and System Configuration Design

**Date:** 2026-07-23

**Status:** Fast-track business package approved; implementation not started

**Business approver:** Project Business Approver (user in this Codex task)

**Implementation baseline:** `b8dbdd7ee42569a5849a59c6d7f77f1b5c53db4e`

**SRS baseline:** Google Docs revision `AIroW372r8j-BncuGRhIEqFwCQa2PLXsnMT53H_cxn5r7E_t-NkRjh2gJg2UEves9dhsAFtoTr0qoSWM8Lt1qYAOQzSFBEWVaj2Ap2eXHQI`; one tab `t.0`; read back 2026-07-23

## 1. Scope and Gate Status

`SL-009` is the final core business package before the cross-system consistency audit. It governs four cross-cutting capabilities that consume evidence from every approved domain slice:

- reliable Customer and internal notifications through in-app and email channels;
- immutable, privacy-safe audit evidence for successful, denied, failed, System, and external events;
- definition-backed Admin reporting for Revenue, Orders, Products, Customers, Staff, and Inventory;
- a small allowlist of versioned System Settings whose effects are explicit and never rewrite prior business rights or history.

The notification flow begins when an approved domain command produces a business event and ends when every required logical recipient/channel result is `Sent`, `Failed` after bounded retry, or durably available in the recipient's in-app inbox. The domain command, mandatory audit evidence, and domain outbox handoff form one commit boundary; external delivery occurs after commit.

The audit flow begins when a protected action is attempted and ends with one immutable, attributable, privacy-safe result that an Admin can retrieve through stable filtered pagination.

The reporting flow begins when an authenticated Admin selects the current month, another valid date period, or an explicit all-time view. It ends with reproducible measures whose sources, event timestamps, timezone, current-snapshot boundary, and `dataAsOf` are visible.

The configuration flow begins when an authenticated Admin submits an allowlisted setting batch with reason, idempotency identity, and expected version. It ends when one complete new version is effective, its audit/outbox evidence exists, and all affected future snapshots or low-stock evaluations follow the approved semantics.

This package includes:

- atomic domain state, audit, and outbox handoff;
- logical notification idempotency by business event, recipient, type, and channel;
- Customer-facing and internal channel policy;
- separate delivery, read, and archive states;
- bounded email retry with terminal operational failure evidence;
- owner-only inbox access and authorization re-check on linked resources;
- User, System, payOS, Carrier, and Email Service audit attribution;
- immutable audit schema, filtering, paging, retention, and data minimization;
- Asia/Ho_Chi_Minh reporting boundaries and immutable event-time calculations;
- historical Gross Sales, Refunds, and Net Sales definitions;
- period-event versus current-snapshot separation for operational reports;
- exact Customer, Staff, Product, Order, and Inventory measure semantics;
- Admin-only reporting, audit, and global System Setting authority;
- future-only payment timeout snapshots;
- Admin global low-stock default plus the Warehouse Product override boundary from `SL-005`;
- removal of configurable return/exchange windows from the current release.

This package does not introduce SMS, mobile push, marketing campaigns, recipient preference management, arbitrary email-content editing, an Admin ability to read another user's notification body, a general-purpose key/value configuration console, full event sourcing, a data warehouse, predictive analytics, an employee score/ranking system, Supplier reporting access, audit editing/deletion, or normal-function historical disposal. Delivery-provider secrets and infrastructure retry intervals remain deployment configuration rather than Admin business settings.

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Next evidence |
|---|---|---|---|---|---|---|---|---|---|
| SL-009 | passed | passed | passed | ready | not-started | not-started | not-started | not-started | Complete exact G3 API/interface/code/test/release-evidence mapping against the reconciled SRS revision |

No unresolved business decision remains inside the approved `SL-009` package.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-050 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Google Docs revision `AIroW372r8j-BncuGRhIEqFwCQa2PLXsnMT53H_cxn5r7E_t-NkRjh2gJg2UEves9dhsAFtoTr0qoSWM8Lt1qYAOQzSFBEWVaj2Ap2eXHQI`; one tab `t.0`; read back 2026-07-23 | Candidate notification/audit/report/settings text plus the bounded CR-001 event and settlement closure | Candidate source except where approved; CR-001 v2.1 is normative for the bounded cross-slice reporting/notification rules | SRS contributors; Project Business Approver approves policy | Legacy paragraphs remain candidate; the CR-001 v2.1 addendum supersedes conflicting COD, Refund, best-seller, and notification wording |
| SRC-051 | Explicit fast-track approval, “duyệt SL-009” | 2026-07-23 | `BD-098` through `BD-109` and this complete bounded package | Normative business authority for `SL-009` | Project Business Approver | Approver display name is not recorded |
| SRC-052 | Repository `D:\GreenHouse_System-main` | HEAD `b8dbdd7ee42569a5849a59c6d7f77f1b5c53db4e`; inspected 2026-07-23 | Current Notification, EmailOutbox, AuditLog, SystemSetting, Order/Refund, report services, routes, UI, demo data, and tests | `observed-behavior` only | Engineering team | Green tests encode current-state revenue, editable seven-day return window, partial email event coverage, weak audit data/query shape, unbounded retry, and disconnected settings |
| SRC-053 | Archived SWR Chapter 17 and SWD Chapters 9–11 | Local archive accessed 2026-07-23 | Requirements completeness/consistency/verifiability and explicit current-state/event/guard/action/next-state modeling | Method guidance only | SWR/SWD archive | Does not decide GreenHouse business policy |
| SRC-054 | Approved `SL-001` through `SL-008` designs | Approved 2026-07-22 through 2026-07-23 | Fixed five-day after-sales deadlines, payment/refund evidence, Inventory authority/threshold ownership, actor boundaries, domain timestamps, privacy, idempotency, and mandatory audit/outbox handoffs | Normative for referenced cross-slice rules | Project Business Approver | Current cross-cutting implementation does not yet consume all approved events or preserve every approved calculation and privacy boundary |
| SRC-055 | [`CR-001 v2.1`](2026-07-23-cr-001-cross-slice-business-closure-v2.md) | Approved 2026-07-23 | Later Customer COD collection clock, separate Carrier settlement fact, distinct Refund obligations, aggregate money settlement, public/report separation, destination/evidence privacy, and missing fulfillment notifications | Normative cross-slice authority | Project Business Approver | Refines BR-096, BR-102, BR-103, notification matrix, and report boundaries |

## 3. Approved Business Decision Log

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Decision date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-098 | SL-009 | What implementation depth should the final cross-cutting package require? | Patch current screens/queries; balanced evidence/outbox foundation; full event sourcing and data warehouse | Use the balanced foundation: domain events/outbox, separate Notification delivery/read models, immutable Audit, event-defined reports, and a small versioned setting allowlist; do not introduce full event sourcing or a BI warehouse | Correct the business failures and provide reliable cross-slice evidence without expanding the release into a platform program | Project Business Approver | 2026-07-23 | BR-094 through BR-105 |
| BD-099 | SL-009 | Which actors own notification, audit, reporting, and configuration capabilities? | Admin super-access; broad authenticated access; purpose-limited ownership | Recipient owns only their in-app inbox; Staff/CSKH and Warehouse receive only operational notifications; only Admin reads global reports/Audit and changes allowlisted global settings; Admin does not read another user's notification body; external services never decide business state | Preserve the actor boundaries already approved in `SL-001..008` and avoid treating Admin as every operational role | Project Business Approver | 2026-07-23 | BR-094 |
| BD-100 | SL-009 | How is reliable cross-cutting evidence committed and deduplicated? | Best-effort post-commit calls; synchronous external send; atomic domain/audit/outbox then asynchronous consumers | One domain command atomically commits its business state, mandatory privacy-safe Audit, and one idempotent DomainOutbox event. Failure of any mandatory write rolls back the domain command. External email/in-app consumers run after commit and deduplicate by `BusinessEventID + Recipient + NotificationType + Channel` | Prevent committed state with no recoverable handoff while ensuring provider failure cannot undo business truth | Project Business Approver | 2026-07-23 | BR-095 |
| BD-101 | SL-009 | Which notification channels apply to each event family? | Email-only candidate SRS; send every event by every channel; bounded channel matrix | Identity/security uses email and an in-app confirmation only when an accessible account exists. Customer Order/Payment/Refund/Return/Exchange milestones use email plus in-app. Review moderation and Customer-visible Support responses/results use in-app plus email. Internal assignment, approval, inventory, and low-stock handoffs use in-app only. Packing creates audit but no Customer notification | Keep important Customer events reachable without turning every internal transition into email noise | Project Business Approver | 2026-07-23 | BR-096 |
| BD-102 | SL-009 | What are the notification lifecycle, retry, and recipient controls? | Unbounded retries and delete; no retry; bounded delivery plus retained archive | Email delivery follows `Pending -> Processing -> Sent` or `RetryScheduled` and becomes terminal `Failed` after five total attempts, with operational evidence. In-app follows `Unread -> Read -> Archived`. Archive is owner-only, permitted after read, hides the item, and never deletes the historical Notification | Make failure finite and visible while keeping the current useful inbox behavior consistent with historical-retention rules | Project Business Approver | 2026-07-23 | BR-097 |
| BD-103 | SL-009 | What data may notifications contain and does a notification link grant authority? | Copy source payloads; content-only masking; minimum safe template plus authorization re-check | Store/send the minimum recipient, template, safe display values, target reference, and timestamps. Never include password/hash, raw OTP evidence, token/session/cookie, full address, refund destination, card/gateway secret, raw callback, or full Review/Support/evidence content. Opening a target always re-runs current server authorization | Stop cross-cutting convenience records from becoming a sensitive-data leak or capability token | Project Business Approver | 2026-07-23 | BR-098 |
| BD-104 | SL-009 | Which actions and actor identities must Audit represent? | Successful User mutations only; coarse text logs; complete attributable outcomes | Audit every approved protected mutation, authentication/security outcome, permission/status/configuration change, external payment/carrier result, notification delivery result, sensitive administrative read, and denied/failed attempt where safe. Identify `User`, `System`, `payOS`, `Carrier`, or `EmailService` without assigning external actions to a Customer | Preserve causal evidence across actors and integrations instead of recording only application users | Project Business Approver | 2026-07-23 | BR-099 |
| BD-105 | SL-009 | How are Audit consistency, privacy, access, and retrieval governed? | Mutable descriptions and fixed first 100; log everything raw; immutable minimized evidence with Admin query | Required successful-command Audit commits with the domain command. Rejected/rolled-back attempts produce separate privacy-safe outcomes. Audit records are append-only, not editable/deletable by any user, visible only to Admin, and retrievable with stable pagination/filtering by period, actor/role, action, target, and outcome. Sensitive values are excluded before storage | Make Audit trustworthy and useful without turning it into a second sensitive database | Project Business Approver | 2026-07-23 | BR-100 |
| BD-106 | SL-009 | What is the authoritative reporting clock and revenue formula? | Current status/updatedAt; order creation date; immutable business-event timestamps | Use Asia/Ho_Chi_Minh date boundaries, start inclusive and next-day start exclusive. A completed sale requires recorded `DeliveredAt` plus verified full Customer collection: collection at/before delivery is reported at `DeliveredAt`; actual later Customer collection is reported at later `PaidAt`. Carrier remittance/settlement time never controls the sale clock. Refunds are reported only when a Refund becomes `Refunded` at `RefundedAt`. `NetSales = GrossSales - Refunds` and may be negative | Prevent later state changes or delayed Carrier remittance from moving/erasing a sale and place money in the period where the Customer collection event occurred | Project Business Approver | 2026-07-23 | BR-101, BR-102 |
| BD-107 | SL-009 | How are non-revenue reports, defaults, and current snapshots defined? | Vague counts/current-state grouping; all-time default; explicit event measures plus labeled snapshots | Admin dashboard defaults to the current calendar month, supports a valid selected period or explicit all-time view, and displays timezone and `dataAsOf`. Period metrics use their own event timestamps; current account/backlog/Inventory/low-stock values are separately labeled snapshots. Product, Customer, Staff, Order, and Inventory denominators are explicitly defined, and no automatic employee score/ranking is created | Make every number reproducible and prevent a current snapshot from masquerading as a historical period measure | Project Business Approver | 2026-07-23 | BR-103 |
| BD-108 | SL-009 | Which values are Admin-editable settings, and is the five-day after-sales policy configurable? | Preserve three generic settings; make all deadlines configurable; narrow allowlist and fixed approved after-sales policy | Admin may change only `PAYMENT_TIMEOUT_MINUTES` and `LOW_STOCK_DEFAULT_THRESHOLD` in this release. `PAYMENT_TIMEOUT_MINUTES` defaults to 15 and accepts integers 5–60. The low-stock global default is a non-negative integer; `SL-005` Warehouse Product override remains separate. `RETURN_WINDOW_DAYS` is removed: Return and Exchange request rights remain fixed at five days from the applicable delivery event | Prevent an Admin screen from overriding approved Customer rights while retaining the two genuinely operational future-facing settings | Project Business Approver | 2026-07-23 | BR-104 |
| BD-109 | SL-009 | How do setting validation, concurrency, history, and effects work? | Last-write-wins upsert; partial batch; atomic versioned batch | Every batch requires a bounded nonblank reason, command idempotency identity, and expected version. Reject unknown keys, invalid ranges, and stale versions before any write. Commit the complete new version, Audit, and reevaluation outbox atomically. Payment timeout affects only later online Orders and never rewrites existing `PaymentDeadlineAt`. Global low-stock change applies to Products without overrides on subsequent idempotent reevaluation and never rewrites alert history | Prevent partial or stale configuration and make each policy effect inspectable and reversible only through a new version | Project Business Approver | 2026-07-23 | BR-105 |

## 4. Actor Responsibility Matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Guest | Complete identity/recovery actions without a signed-in inbox | Request registration verification, invitation acceptance, password recovery, or contact flow through its owning `SL-007` interface; receive required email | Access in-app Notification, Audit, Reports, Settings, internal delivery metadata, or another recipient's message | None in `SL-009` | No Notification inbox; receives only minimum safe email for the source flow | Email request to Email Service; authenticated result returns to `SL-007` | Delivery failure remains retryable and does not reveal whether unrelated account data exists |
| Customer | Receive timely own business updates and understand own transaction outcomes | List/open own in-app notifications; mark own Unread item Read; archive own Read item; follow an authorized target link | Read/archive another recipient's item; edit content/delivery state; retry provider delivery; view Audit/Reports/Settings; use a notification link to bypass ownership | Own `Unread -> Read -> Archived` inbox state only | Own safe Notification projection; no provider/internal error payload, foreign target, secret, or operational report | Receives Order/Payment/after-sales/Review/Support outcomes from owning slices | Foreign/missing target returns safe denial; repeated read/archive returns current result; email failure does not change the source business outcome |
| Staff / CSKH | Receive accountable operational work without global administrative access | Use own inbox for Order, after-sales, Review moderation, Support assignment/message, and relevant decision handoffs | View another user's inbox; inspect global Audit/Reports/Settings; mutate business state from the notification itself; read protected data outside owning-slice authority | Own inbox read/archive state; business transitions remain in `SL-001..008` | Own operational Notification projection and only the target view already authorized to Staff/CSKH | Domain event to own queue; Staff action returns to the owning slice | Stale/foreign link is denied; duplicate notification event creates no second logical item |
| Warehouse Manager | Receive Inventory, low-stock, export, inspection, and replenishment work | Use own inbox; set/remove a Product threshold override through `SL-005` with reason | Change the Admin global default; view global Audit/Reports/Settings; receive Customer financial destination; use notification to bypass Warehouse guards | Own inbox read/archive state; Product override transitions remain in `SL-005` | Own operational Notification projection and authorized Inventory target view | Low-stock/export/inspection/replenishment events to Warehouse workflows | Resolved/stale work opens current safe state; duplicate crossing does not create duplicate active alert/notification |
| Admin | Govern global policy and inspect system evidence without becoming every operational role | View filtered/paged Audit; view reports; change allowlisted global settings; use own notifications | Read another user's notification body; edit/delete Audit; alter fixed five-day after-sales rights; edit arbitrary keys, secrets, credentials, roles, prices, refund amounts, or Product override through Settings; perform Staff/Warehouse work merely by Admin role | Creates a new SystemSetting version; no ownership of source-domain transitions | Global aggregate reports, minimized Audit, current/setting history, own inbox; no private Support/Review body or refund destination through `SL-009` | Setting event to Order creation or low-stock reevaluation; report/audit evidence from all approved slices | Invalid/stale/unknown/partial setting batch changes nothing; unauthorized drill-down is denied; report shows data/time boundary rather than guessing |
| Email Service | Deliver a queued email and return delivery evidence | Claim an eligible delivery attempt and return accepted/message ID or failure | Decide Order/Payment/Refund/User/Inventory state; alter recipient/template; create another logical notification | `Pending/RetryScheduled -> Processing -> Sent/RetryScheduled/Failed` through System-controlled claims/results | Minimum rendered email and provider response metadata; no unrelated domain data | Delivery result to Notification/Audit | Timeout, provider error, or lost lease is recorded and retried without repeating source business effects |
| payOS / Carrier | Supply external payment or delivery facts to owning domain flows | Send authenticated callback/event through `SL-001..004` interfaces | Access inbox/Audit/Reports/Settings; directly write Audit or decide internal approval; be represented as Customer actor | None directly in `SL-009` | No direct cross-cutting read; accepted source identity/result is referenced in minimized Audit/outbox evidence | Verified external event to owning domain, then outbox to consumers | Invalid/duplicate external facts change no business state and produce attributable safe outcome evidence |
| GreenHouse System | Preserve reliable evidence, permissions, calculations, idempotency, and history | Validate/commit domain Audit/outbox; expand channel recipients; claim/retry delivery; derive reports; validate/version settings; enforce access | Invent actor decisions, expose secrets, rewrite historical timestamps/snapshots, infer events from `updatedAt`, or make current status the historical truth | Mechanical outbox/delivery/read/archive and setting-version transitions after authorized event/guard | Minimum cross-slice references, immutable event/audit/setting history, derived reports, role-specific projections | Coordinates owning slices, recipients, Email Service, Admin views, and low-stock reevaluation | Grouped write rolls back; post-commit consumer retries; stale/duplicate commands return existing result; calculation failure returns no fabricated number |

## 5. Business Slice Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-009 | Every approved domain action produces reliable recipient feedback, immutable evidence, reproducible Admin measures, and controlled future configuration without rewriting business history | An owning slice commits/attempts a protected event, a recipient uses own inbox, an Admin requests a report/Audit view, or an Admin submits an allowlisted setting batch | Approved source event/actor/recipient; current authorization; stable business timestamps/snapshots; idempotency identity; valid filter or setting values; expected version where mutating | Execute `UC-NOT-01`, `UC-NOT-02`, `UC-AUD-01`, `UC-REP-01`, or `UC-CFG-01` | Apply `AF-009` without duplicate logical delivery, missing mandatory evidence, sensitive leakage, historical rewrite, misleading calculation, partial configuration, or cross-role authority | Unique notification tuple; max five email attempts; half-open Vietnam date periods; completed-sale/refund event measures; current snapshots labeled; payment timeout 5–60/default 15; fixed five-day after-sales policy | Domain+mandatory Audit+outbox all-or-none; Audit/history immutable; archive is not deletion; report events persist despite later state; existing deadline snapshots never change; setting versions never overwrite history | Actor matrix above | AT-175 through AT-204 | `approved-requirement` |

## 6. Normative Requirements

| Requirement ID | Approved requirement | Decision |
|---|---|---|
| BR-094 | Recipient shall access and change read/archive state only for that recipient's in-app Notifications. Staff/CSKH and Warehouse shall receive only role-relevant operational notifications. Only Admin shall access global Reports, immutable Audit views, and allowlisted global Settings; Admin shall not gain another recipient's Notification body or owning-slice command merely from Admin role. Guest shall have no in-app inbox. External services shall have no direct cross-cutting read or business-decision authority. | BD-098, BD-099 |
| BR-095 | Every successful protected domain command shall atomically persist the complete business state, mandatory privacy-safe Audit, and one idempotent DomainOutbox event before success is returned. Failure of any mandatory write shall roll back the command. After commit, each logical Notification shall be unique by `BusinessEventID + RecipientIdentity + NotificationType + Channel`; duplicate/replayed source or consumer events shall return the existing result and repeat no business, Audit, or logical Notification effect. External delivery failure shall never roll back the committed source operation. | BD-098, BD-100 |
| BR-096 | Identity/security events shall use email and may add in-app confirmation only for an accessible account. Order Received, final or reconciliation-relevant Payment/Refund outcomes, Confirmed/Shipped/Delivered/Cancelled/Returned/DeliveryFailed Order transitions, evidence-backed failed delivery attempt/reschedule, and approved Return/Exchange milestones shall notify the Customer by email and in-app; Order creation shall be labeled Received, not Confirmed, and Packed shall create no Customer notification. Customer-visible Review moderation and assigned-Staff Support response/result shall use in-app plus email. Internal assignment, approval, Inventory, low-stock, export, inspection, and replenishment handoffs shall use in-app only. | BD-101, BD-050 |
| BR-097 | Email delivery shall use `Pending`, `Processing`, `RetryScheduled`, `Sent`, and `Failed` with append-only attempt evidence. A failure before five total attempts shall schedule a later attempt; the fifth failed total attempt shall become terminal `Failed` and create operational evidence. A lease timeout may be reclaimed without creating another logical Notification. In-app Notification shall use monotonic `Unread -> Read -> Archived`. Only the owner may read/archive; archive requires Read, removes the item from the active inbox/unread count, and retains the historical record. | BD-102 |
| BR-098 | Notification/outbox data shall contain only the minimum recipient identity/address snapshot, safe template/type, safe display values, business-event/target reference, status, attempts, and timestamps. Password/hash, token, cookie/session, raw OTP evidence, full address, phone where unnecessary, refund destination, payment-card/gateway secret, raw callback, and full Review/Support/evidence content shall never appear. A target link shall confer no authority and shall re-run current server authentication, role, ownership, state, and field-level authorization. | BD-103 |
| BR-099 | Audit shall cover successful protected mutations; login/security outcomes; role/account/status/settings changes; Product/Inventory/Order/Payment/Refund/Return/Exchange/Shipment/Review/Support transitions; replenishment decisions; notification attempts/results; sensitive administrative reads; and safe denied/failed attempts. Each entry shall record immutable AuditID, ActorType, nullable ActorID, ActorRole snapshot where applicable, Source, Action, TargetType/ID, previous and new state/version rather than an unrestricted object copy, required reason/reason code, Outcome, command/correlation/business-event identity, and actual event timestamp. `System`, `payOS`, `Carrier`, and `EmailService` shall not be misattributed to a Customer. | BD-104 |
| BR-100 | Audit required for a successful command shall share that command's transaction; a rolled-back or denied command shall write a separate privacy-safe `Denied` or `Failed` outcome without restoring rolled-back state. Audit shall be append-only and unavailable to edit/delete through any user function. Only Admin may retrieve it with bounded stable pagination ordered by `Timestamp DESC, AuditID DESC` and validated filters for period, actor/role, action, target, and outcome. Secrets and unnecessary personal/user-generated/raw-provider data shall be excluded before persistence, and archival/disposal shall require separately approved operational/security policy. | BD-105 |
| BR-101 | Every MVP report date uses Asia/Ho_Chi_Minh. A selected start date is inclusive at 00:00 and the end boundary is exclusive at 00:00 on the day after the selected end date. The dashboard defaults to the current calendar month; another valid bounded period or explicit all-time mode may be selected. Every result shall identify the selected period/mode, timezone, generation time, and `dataAsOf`. Period measures shall use the authoritative event timestamp defined for that measure; current snapshots shall be labeled separately and neither `updatedAt` nor current status shall invent a missing historical event. | BD-106, BD-107 |
| BR-102 | A CompletedSale event shall be established only when an Order has immutable `DeliveredAt` and verified `CustomerCollectedAmount = CODExpectedAmount`. Full Customer collection at/before delivery contributes immutable `Order.TotalAmount` to Gross Sales at `DeliveredAt`; full Customer collection that actually occurs later contributes at the actual later `PaidAt`. `CarrierSettlementAmount` and its remittance time are reported only in a separate settlement-reconciliation projection and never move, create, or erase CompletedSale. Later Return, cancellation from another technical state, or Refund does not erase that event. Refunds equal amounts of distinct Refund obligations becoming `Refunded` in the selected period at `RefundedAt`, including cancellation, verified late/excess payment, failed delivery, COD recovery, and Return triggers. A Carrier settlement mismatch alone is not a Refund trigger. `NetSales = GrossSales - Refunds` may be negative. Pending, unverified/unpaid, Customer-under-collected, Failed, Cancelled-payment, or never-validly-delivered Orders contribute no Gross Sales. | BD-106, BD-111, BD-114, BD-117 |
| BR-103 | Order period measures shall count creation, confirmation, shipment, delivery, cancellation, and return by their own immutable event times; current backlog/status counts shall be a separate `dataAsOf` snapshot. Product gross quantity/value shall come from completed-sale OrderDetail snapshots and keep return/exchange activity separate; Admin history may include inactive Products, while public best sellers retain `SL-006` visibility rules. Customer measures shall include current Customer accounts split by status, new Customers by account CreatedAt, unique ordering Customers by Order CreatedAt, and unique completed-sale Customers by immutable `CompletedSaleAt` rather than always `DeliveredAt`. Staff measures shall derive successful Order/after-sales/Support actions and response/resolution durations from attributable event/message timestamps, include historical Disabled Staff, and create no automatic score/rank. Inventory shall show current Sellable/Reserved/Quarantined/Damaged/Available/effective-threshold/low-stock/health snapshot separately from signed InventoryTransactions grouped by type and event time. | BD-107, BD-111 |
| BR-104 | The current Admin setting allowlist shall contain only `PAYMENT_TIMEOUT_MINUTES` and `LOW_STOCK_DEFAULT_THRESHOLD`. Payment timeout shall default to 15 and accept an integer from 5 through 60. The global low-stock default shall be a non-negative integer; the Warehouse Product override from `SL-005` wins where present. `RETURN_WINDOW_DAYS` and any generic Return/Exchange deadline control shall not exist: original Return, original Exchange, and eligible replacement Exchange rights remain fixed at the approved delivery event plus exactly five days. Credentials, provider secrets, roles, prices, refund amounts/destinations, and arbitrary keys shall not be System Settings. | BD-108 |
| BR-105 | An Admin setting command shall carry a bounded nonblank reason, idempotency identity, and expected current version. System shall validate the entire batch and reject unknown, invalid, duplicate-conflicting, or stale input before writing. One transaction shall append the new setting version(s), responsible Admin, reason, effective time, Audit, and reevaluation outbox; partial batch success is forbidden. A payment-timeout version shall affect only online Orders created at or after its effective time, whose immutable `PaymentDeadlineAt` never changes later. A global low-stock version shall affect each Product without an override on the next idempotent evaluation, may open/resolve an alert under `SL-005`, and shall not rewrite prior alert/setting history. A repeated command returns the existing version/effects. | BD-109 |

## 7. UC-NOT-01 — Commit and Deliver a Notification

### Preconditions

1. An owning `SL-001..008` command or approved System/external event has a stable `BusinessEventID`, event type, actual event timestamp, safe target reference, and authorized logical recipient(s).
2. The owning command has current authorization, state/version guards, and a transaction capable of committing mandatory Audit and DomainOutbox evidence.
3. The channel matrix in Section 14 identifies each required recipient/channel pair.

### Main Flow

1. Owning slice validates and executes the domain transition.
2. In the same transaction, System appends mandatory Audit and one DomainOutbox event with the minimum safe payload.
3. After commit, Notification consumer expands the channel matrix and attempts to create each logical record by the unique tuple.
4. A duplicate event/consumer attempt loads the existing logical record and changes no source domain fact.
5. In-app consumer creates an `Unread`, immediately available owner-only item.
6. Email consumer creates `Pending` delivery with recipient snapshot and safe template payload.
7. Worker atomically claims an eligible delivery as `Processing` and increments the total attempt count once.
8. Provider acceptance records `Sent`, provider message reference, and `SentAt`.
9. Provider failure before attempt five appends the failure and sets `RetryScheduled` with the next eligible time.
10. Failure on attempt five records terminal `Failed` plus operational Audit/evidence.

## 8. UC-NOT-02 — Read, Follow, and Archive an In-App Notification

### Preconditions

1. Actor is an Active authenticated User and owns the Notification.
2. Notification is not Archived for normal inbox/detail access.

### Main Flow

1. User lists own active Notifications using stable `CreatedAt DESC, NotificationID DESC` pagination and optional `Unread` filter.
2. System returns safe subject/preview/type/time/read state and unread count.
3. User opens an item; System returns it only to the owner and changes `Unread -> Read` once.
4. If the item has a target, User selects the target action and the target endpoint independently re-checks current authorization.
5. User may archive a Read item; System changes `Read -> Archived` and removes it from active lists/counts while preserving history.
6. Repeated read/archive returns the current result with explicit already-processed feedback.

## 9. UC-AUD-01 — Record and Inspect Audit Evidence

### Command Evidence

1. A protected command constructs the approved minimized Audit fields before commit.
2. Successful command state, mandatory Audit, and DomainOutbox commit together.
3. A denial before mutation or a transaction rollback writes a separate `Denied` or `Failed` Audit result where safe.
4. Actor/source is the real User, System, payOS, Carrier, or EmailService origin; the record never invents a Customer action.
5. Sensitive values are removed before persistence rather than merely hidden from the response.

### Admin Inspection

1. Authenticated Admin submits validated actor/role/action/target/outcome/period filters and bounded cursor limit.
2. System returns minimized immutable entries in stable `Timestamp DESC, AuditID DESC` order with a next cursor.
3. Admin may open a safe detail but has no edit/delete/replay control.
4. Non-Admin and malformed/oversized filters are denied without disclosing whether matching evidence exists.

## 10. UC-REP-01 — Generate Admin Reports

### Preconditions

1. Actor is an Active authenticated Admin.
2. Request selects the default current month, a valid start/end date, or explicit all-time mode.
3. Required event timestamps/snapshots exist; a missing event is not replaced by `updatedAt`.

### Main Flow

1. System converts the selected dates into the approved half-open Asia/Ho_Chi_Minh instant range.
2. It reads authoritative business events/snapshots using database-side bounded aggregation rather than loading every record into application memory.
3. Revenue derives completed-sale events by `DeliveredAt` and Refund events by `RefundedAt`.
4. Order/Product/Customer/Staff period measures apply their definitions in `BR-103`.
5. Current backlog/account/Inventory/low-stock measures are calculated as a separate snapshot.
6. System returns the requested measures with period/mode, timezone, `generatedAt`, `dataAsOf`, definitions, empty-data zeros, and no fabricated fallback/demo values.
7. Any drill-down applies the same source/permission/filter definition and stable pagination.

## 11. UC-CFG-01 — Change Allowlisted System Settings

### Preconditions

1. Actor is an Active authenticated Admin.
2. Input contains only allowlisted keys, a bounded nonblank reason, idempotency identity, and expected current version.
3. Values satisfy `BR-104`.

### Main Flow

1. System loads the current setting versions and rejects a stale expected version.
2. It normalizes aliases only at a compatibility boundary; canonical storage and response use approved keys.
3. It validates the complete batch before any write and rejects unknown or conflicting duplicate keys.
4. One transaction appends every changed value/version/effective time/Admin/reason plus Audit and one reevaluation outbox event.
5. A payment-timeout change becomes eligible only for later online Order creation.
6. A low-stock-default change makes the new effective value visible to Products without overrides and triggers idempotent reevaluation under `SL-005`.
7. Repeated command identity returns the existing version and does not repeat Audit/reevaluation effects.

## 12. Alternative and Failure Paths

| ID | Condition | Required outcome | Classification |
|---|---|---|---|
| AF-009-01 | Domain state write succeeds locally but mandatory Audit or DomainOutbox insert fails | Roll back the complete domain command and return failure; no partial success | `approved-requirement` |
| AF-009-02 | Same source event or consumer message is delivered repeatedly | Return existing logical tuple result; create no duplicate Notification/Audit/business effect | `approved-requirement` |
| AF-009-03 | One event requires both email and in-app | Create one logical record per required channel; one channel must not suppress the other | `approved-requirement` |
| AF-009-04 | Same event has different Notification types or recipients | Preserve one logical record per exact tuple; do not collapse distinct authorized outcomes | `approved-requirement` |
| AF-009-05 | Email provider is disabled, unavailable, times out, or rejects | Keep source outcome; append attempt failure; schedule retry before attempt five or become Failed at five | `approved-requirement` |
| AF-009-06 | Worker lease expires or stale worker returns a result | Only current claim finalizes; reclaim safely without another logical record or source effect | `approved-requirement` |
| AF-009-07 | Provider may have accepted but acknowledgment was lost | Retain uncertain attempt/correlation evidence; any transport redelivery repeats no domain effect and never claims guaranteed physical exactly-once delivery | `approved-requirement` |
| AF-009-08 | User reads or archives own item repeatedly | Return current state with already-processed feedback | `approved-requirement` |
| AF-009-09 | User tries to archive Unread item | Reject with no state change and direct the user to read/open first | `approved-requirement` |
| AF-009-10 | Foreign User guesses Notification/target ID | Return safe not-found/denied response; reveal no foreign content or target existence | `approved-requirement` |
| AF-009-11 | Target was removed from current view or actor lost authority | Notification remains historical; target endpoint denies or shows safe unavailable current state | `approved-requirement` |
| AF-009-12 | Audit payload contains a secret or unbounded object/text | Reject/sanitize before persistence according to allowlisted evidence schema; never store then merely hide it | `approved-requirement` |
| AF-009-13 | Protected command is denied before mutation | Record safe Denied evidence where required; change no domain state | `approved-requirement` |
| AF-009-14 | Transaction begins but rolls back | Record separate Failed reconciliation evidence after rollback; do not expose rolled-back intermediate state as committed | `approved-requirement` |
| AF-009-15 | Non-Admin requests Audit/Reports/Settings | Deny at server; return no existence/count/value clues beyond the safe authorization response | `approved-requirement` |
| AF-009-16 | Audit/report filter is malformed, unbounded, stale-cursor, or from-after-to | Return field-level validation error and perform no misleading fallback query | `approved-requirement` |
| AF-009-17 | Delivered/paid Order later becomes Returned/Refunded | Retain its Gross Sales at original DeliveredAt; report Refund separately at RefundedAt | `approved-requirement` |
| AF-009-18 | Refund occurs in a period with no Gross Sales | Return a negative Net Sales value rather than clamping or moving the Refund | `approved-requirement` |
| AF-009-19 | Current status says Delivered/Paid but DeliveredAt or accepted payment evidence is missing | Do not count CompletedSale; expose reconciliation gap rather than infer from status/updatedAt | `approved-requirement` |
| AF-009-20 | Historical Product/User/Staff later becomes inactive/Disabled | Preserve historical period contribution and actor attribution; label current status separately | `approved-requirement` |
| AF-009-21 | Report has no qualifying records | Return successful zero/empty measures with definitions and boundaries, not demo data or an error | `approved-requirement` |
| AF-009-22 | Setting batch contains one invalid or unknown key | Reject the whole batch before writing any value/Audit/reevaluation event | `approved-requirement` |
| AF-009-23 | Two Admins update the same version concurrently | Exactly one expected-version command wins; loser receives current version with no partial effect | `approved-requirement` |
| AF-009-24 | Payment timeout changes after Order creation | Existing PaymentDeadlineAt remains unchanged; later eligible Order uses the new effective value | `approved-requirement` |
| AF-009-25 | Admin submits RETURN_WINDOW_DAYS or another after-sales deadline key | Reject as unsupported; every approved five-day deadline remains unchanged | `approved-requirement` |
| AF-009-26 | Global low-stock default changes while Product has override | Override wins; no false threshold replacement; no duplicate alert/crossing Notification | `approved-requirement` |

## 13. State Models

### 13.1 Email Delivery

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None | Required email tuple consumed | Create attemptCount 0 and eligible time | Pending |
| Pending | Current worker atomically claims | Increment attempt once; set claim/lease | Processing |
| RetryScheduled | Eligible time reached; current worker claims | Increment attempt once; set claim/lease | Processing |
| Processing | Provider accepts and current claim still owns lease | Record provider reference and SentAt | Sent |
| Processing | Provider fails and attemptCount < 5 | Append safe error; calculate later eligibility; clear lease | RetryScheduled |
| Processing | Provider fails and attemptCount = 5 | Append safe terminal error; create operational evidence | Failed |
| Processing | Lease expires without accepted finalization | Preserve attempt evidence; make reclaimable without new logical record | RetryScheduled |
| Sent | Duplicate source/worker result | Return current result; no send/state/domain effect | Sent |
| Failed | Automatic worker poll | Do not retry automatically; retain for operational reconciliation | Failed |

### 13.2 In-App Notification

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None | Required owner tuple consumed | Persist owner-only safe item | Unread |
| Unread | Owner opens/marks read | Record ReadAt once | Read |
| Unread | Owner requests archive | Reject; no state change | Unread |
| Read | Owner archives | Record ArchivedAt; remove from active inbox | Archived |
| Read/Archived | Duplicate same command | Return current result; no duplicate transition | Same state |
| Any | Foreign/non-owner command | Deny; reveal no content | Same state |

### 13.3 System Setting Version

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| Version N | Admin batch; expected N; all values valid | Atomically append N+1 values/effective time/reason/Audit/outbox | Version N+1 |
| Version N | Duplicate completed command identity | Return existing N+1 result | Existing result |
| Version N | Expected version is not N | Reject and return current safe version | Version N |
| Version N | Any invalid/unknown/conflicting key | Reject whole batch | Version N |

Audit records and historical report events have no editable lifecycle. They are append-only evidence.

## 14. Notification Channel Matrix

| Event family | Recipient | In-app | Email | Notes |
|---|---|---|---|---|
| Registration verification, invitation, password reset | Guest/intended identity recipient | No | Required | Uses protected token/OTP construction from `SL-007`; no raw secret in Audit |
| Password changed, account disabled/reactivated, security confirmation | Affected User | When account/session access is applicable | Required | Disabling never preserves a session merely to show in-app |
| Order created | Customer | Required | Required | Label `Order Received`, never `Order Confirmed` |
| Payment final/reconciliation-relevant outcome | Customer | Required | Required | Includes primary Paid/Failed/Cancelled, separate Refund-obligation Pending/Refunded, and terminal refund failure/reconciliation result |
| Order Confirmed/Shipped/Delivered/Cancelled/Returned | Customer | Required | Required | Uses owning-slice safe target |
| Failed delivery attempt/reschedule | Customer | Required | Required | Requires evidence-backed owning `SL-004` attempt/reschedule event; no notification creates or edits the attempt |
| Order DeliveryFailed | Customer | Required | Required | Terminal fulfillment outcome only; Return remains reserved for completed after-sales |
| Order Packed | Customer | No | No | Audit only |
| Return/Exchange request receipt, Staff decision, ship-by/inspection/delivery/refund result | Customer | Required | Required | Exact milestones come from `SL-001/SL-002` |
| Review moderation result | Customer | Required | Required | No full review content in payload |
| Assigned-Staff Support response/resolution | Customer | Required | Required | No full Support message in payload |
| New/reopened/assigned/transferred Support work | Eligible/current Staff | Required | No | Assignment/state remains in `SL-008` |
| Low-stock crossing, export, inspection, damage, replenishment handoff/decision | Eligible Staff/Warehouse/Admin recipient from owning slice | Required | No | At most one per approved crossing/business event |

## 15. Reporting Definitions

### 15.1 Period and Snapshot

- Default period is the current calendar month in Asia/Ho_Chi_Minh.
- A selected date period is `[start 00:00, day-after-end 00:00)` in that timezone.
- All-time is an explicit mode, not an omitted-filter accident.
- `generatedAt` identifies response generation; `dataAsOf` identifies the latest included source snapshot/event.
- Current snapshots are not filtered as if they were period events.

### 15.2 Revenue

- `CompletedSaleAt = DeliveredAt` when verified full Customer collection occurred at or before delivery; when full Customer COD collection actually occurs later, `CompletedSaleAt = PaidAt` using that later collection instant. Carrier settlement/remittance time never changes `CompletedSaleAt`.
- `GrossSales = sum(Order.TotalAmount snapshot)` for CompletedSaleAt in period.
- `Refunds = sum(Refund.Amount)` for Refund status transition to Refunded at RefundedAt in period.
- `NetSales = GrossSales - Refunds` and may be negative.
- A 1,000,000 VND Order delivered on June 30 and refunded on July 2 contributes 1,000,000 Gross Sales in June and 1,000,000 Refunds in July; it is not removed from June.
- Revenue never derives from current `OrderStatus`/`PaymentStatus` alone, `createdAt`, `updatedAt`, ReturnRequest completion without Refund evidence, or mutable Product price.

### 15.3 Orders and Products

- Orders created use `CreatedAt`; confirmed use `ConfirmedAt`; shipped use `ShippedAt`; delivered use `DeliveredAt`; cancelled use `CancelledAt`; returned use `ReturnedAt`.
- Current backlog/status is a separate `dataAsOf` count.
- Product gross units/value use immutable OrderDetail quantity/unit-price snapshots attached to CompletedSale events.
- Later Return/Exchange units are reported separately at their accepted receipt/inspection event and do not rewrite original gross units.
- Historical Admin reports retain inactive Product identity/snapshot; public best sellers continue to require current Active Product and Category under `SL-006`.

### 15.4 Customers and Staff

- Current Customer accounts are split by Active/Disabled status at `dataAsOf`.
- New Customers use Customer account `CreatedAt` in period.
- Ordering Customers are distinct Customer IDs with Order `CreatedAt` in period.
- Completed-sale Customers are distinct Customer IDs with CompletedSaleAt in period.
- Staff workload counts successful attributable Order, after-sales, and Support actions by their event times.
- First-response duration is first assigned-Staff message time minus Support CreatedAt; resolution duration is ResolvedAt minus CreatedAt. Aggregates include the qualifying count and average so empty or missing timestamps are not treated as zero.
- Disabled Staff remains in historical measures and is labeled by current status. No composite score, rank, or automatic employment judgment exists.

### 15.5 Inventory

- Current snapshot shows Sellable, Reserved, Quarantined, Damaged, Available, EffectiveThreshold, LowStockAlert state, and InventoryHealth at `dataAsOf`.
- Period movements use append-only InventoryTransaction type, signed quantity, and event timestamp.
- Low-stock count is a current condition; crossing/open/resolve events are historical period measures.
- A global-default change affects only Products without a Warehouse override and never rewrites a prior alert lifecycle.

## 16. State, Security, Data, and Privacy Invariants

1. A successful protected domain command never exists without mandatory Audit and a recoverable DomainOutbox event.
2. External delivery is outside the domain transaction and cannot roll back committed business truth.
3. At most one logical Notification exists per `BusinessEventID + RecipientIdentity + NotificationType + Channel`.
4. Separate required channels/types/recipients are never accidentally collapsed by an underspecified unique key.
5. Five is the total automatic email attempt limit, including the first attempt.
6. Provider uncertainty may cause transport redelivery, but it never repeats a logical Notification or source-domain effect.
7. Archive is a retained visibility state, not delete; normal business functions never delete Notification or Audit history.
8. Unread count includes only active Unread owner items.
9. Notification possession/link knowledge grants no target authority.
10. Audit identifies the real source actor and never invents a Customer action for System/external events.
11. Audit before/after data is an allowlisted state/version projection, not a raw object snapshot.
12. Password, token, OTP evidence, session/cookie, full address, refund destination, raw gateway/carrier payload, and full user-generated content are absent from Notification and Audit storage.
13. Gross Sales is an immutable historical event measure once validly established.
14. Refunds are distinct Refund outcomes and are never inferred merely from Returned status.
15. Net Sales may be negative and is never clamped.
16. Missing authoritative timestamps create a reconciliation gap, not an inferred event.
17. Period event metrics and current snapshots are labeled and calculated separately.
18. Inactive/Disabled current state never erases valid historical Product/User/Staff contribution.
19. Reports are Admin-only aggregate/authorized drill-down views and expose no broader domain authority.
20. `RETURN_WINDOW_DAYS` is not an Admin setting; fixed five-day rights from `SL-001/SL-002` remain normative.
21. Existing `PaymentDeadlineAt`, `ReturnDeadlineAt`, and `ExchangeRequestDeadlineAt` snapshots never change after later setting/policy versions.
22. Product low-stock override belongs to Warehouse under `SL-005`; Admin owns only the global default.
23. A setting batch is all-or-none, versioned, attributable, reasoned, and idempotent.
24. Unknown setting keys are rejected, not silently ignored.
25. Provider credentials, secrets, role policy, price, refund amount/destination, and arbitrary configuration never enter the generic Settings interface.

## 17. UI and Interface Contract

### Notification Inbox

- All authenticated roles receive the same owner-only inbox shell with role-authorized target links.
- Bell shows active unread count and a bounded recent preview; full list uses stable cursor pagination and All/Unread filters.
- Opening marks Read once. The action label is `Lưu trữ`, not `Xóa`, and is available only after Read.
- Archived items disappear from active inbox but remain historical.
- Provider status, retry errors, raw target IDs, private recipient data, and foreign content are never shown.
- Repeated clicks show already-processed/current-state feedback instead of duplicate effects.

### Audit

- Admin page has validated filters for period, actor/role, action, target, and outcome plus stable paging.
- List shows time, actor/source, action, safe target, outcome, and reason summary.
- Detail shows allowlisted before/after state/version and correlation identifiers, never unrestricted payloads.
- No edit, delete, content replay, impersonation, or source-domain mutation control exists.

### Reporting

- Dashboard defaults to current month and visibly offers a valid date period or explicit All time.
- Every card/table states whether it is a period event or current snapshot and displays timezone/`dataAsOf`.
- Revenue shows Gross Sales, Refunds, and Net Sales separately; negative Net Sales renders normally.
- Empty data renders zero/empty state, not demo values.
- Product/Customer/Staff/Order/Inventory navigation uses the same definitions as summary cards.
- Staff view is operational evidence, not an employee ranking.

### System Settings

- Page exposes only payment timeout and global low-stock default with current version/effective time/history context.
- Payment timeout communicates default 15 and allowed 5–60 minutes plus future-Order-only effect.
- Low-stock default explains that a Warehouse Product override wins and that reevaluation may open/resolve alerts.
- A required reason field and current version accompany save.
- No return/exchange-window control, secret, role, price, refund, or arbitrary key editor exists.
- Whole-batch validation errors identify fields and leave every current value unchanged.

## 18. Acceptance Examples

| Acceptance ID | Given / When / Then | Classification |
|---|---|---|
| AT-175 | Given a valid protected domain command, when domain state, mandatory Audit, and DomainOutbox succeed or any one write is injected to fail, then exactly one complete group commits or no domain change exists. | `approved-requirement` |
| AT-176 | Given duplicate/replayed source and consumer events across recipients, types, and channels, when consumed, then exactly one logical Notification exists per exact tuple while distinct required tuples all exist and no source/Audit effect repeats. | `approved-requirement` |
| AT-177 | Given Order creation, confirmation, packing, shipment, delivery, cancellation, and return, when channel policy runs, then creation says Order Received, approved Customer milestones create email+in-app once, and Packed creates Audit with no Customer Notification. | `approved-requirement` |
| AT-178 | Given provider disabled/errors/timeouts and worker lease races, when delivery runs, then source state remains committed, attempts are append-only, retries stop after five total attempts, stale claims cannot finalize, and terminal Failed evidence exists. | `approved-requirement` |
| AT-179 | Given owner Unread/Read/Archived actions and repeated clicks, when inbox/detail/archive runs, then only `Unread -> Read -> Archived` occurs once, archive requires Read, active/unread counts update, and historical record remains. | `approved-requirement` |
| AT-180 | Given foreign User, changed role/ownership, missing target, or guessed IDs, when Notification/list/detail/target is accessed, then no foreign content/existence is disclosed and target authorization is independently enforced. | `approved-requirement` |
| AT-181 | Given identity, monetary/order/after-sales, Review/Support, and internal Inventory/assignment events, when notifications expand, then each receives exactly the approved recipient/channel combination and no internal-only event becomes Customer email. | `approved-requirement` |
| AT-182 | Given payloads containing secrets, raw callbacks, full addresses/destinations, or full Review/Support/evidence text, when Audit/outbox/Notification is constructed, then prohibited data is absent before persistence and safe template/reference data remains usable. | `approved-requirement` |
| AT-183 | Given successful Customer/Staff/Warehouse/Admin commands, when Audit is read, then the real User/role, action, target, state/version, reason/outcome, command/event identity, and timestamp are attributable once. | `approved-requirement` |
| AT-184 | Given System deadline/reassignment, payOS callback, Carrier fact, and Email delivery result, when audited, then ActorType/Source represents the actual non-Customer origin and no fake Customer action exists. | `approved-requirement` |
| AT-185 | Given every required Audit category, when schema validation runs, then all mandatory fields and stable identity exist while unrestricted raw-object snapshots are rejected. | `approved-requirement` |
| AT-186 | Given a critical successful command whose Audit insert fails, when transaction completes, then business state and outbox both roll back and success is not returned. | `approved-requirement` |
| AT-187 | Given authorization denial, validation denial, or transaction rollback, when safe failure evidence is required, then one Denied/Failed entry records operation/actor/target/reason/time without resurrecting intermediate state. | `approved-requirement` |
| AT-188 | Given passwords/tokens/OTP/session, personal address/phone, refund destination, gateway payload, or full user text, when Audit is persisted/read, then those values are absent and only approved safe state/reference evidence remains. | `approved-requirement` |
| AT-189 | Given Admin/non-Admin, valid/invalid filters, more than one page, equal timestamps, and attempted update/delete, when Audit API/UI is used, then only Admin gets stable filtered cursor pages and no user can mutate/delete evidence. | `approved-requirement` |
| AT-190 | Given boundary instants before, exactly at, and after a selected Vietnam date range plus current-month/all-time modes, when reports run, then the half-open boundary, mode, timezone, generatedAt, and dataAsOf are correct. | `approved-requirement` |
| AT-191 | Given an Order with payment collected by delivery and immutable DeliveredAt that later becomes Returned/Refunded, when original-period Gross Sales is generated, then Order.TotalAmount remains included exactly once. | `approved-requirement` |
| AT-192 | Given a Refund becomes Refunded in a later period with no Gross Sales, when revenue runs, then original Gross Sales remains in its delivery period, later Refund appears at RefundedAt, and later Net Sales is negative without clamping. | `approved-requirement` |
| AT-193 | Given current Delivered/Paid without valid DeliveredAt/payment evidence, Pending/Failed/Cancelled/unpaid Orders, mutable updatedAt, and completed ReturnRequest without Refunded Refund, when revenue runs, then none creates an invented sale/refund. | `approved-requirement` |
| AT-194 | Given Orders whose creation/confirmation/shipment/delivery/cancellation/return occur in different periods and current states later change, when Order report runs, then each event count uses its own timestamp and current backlog is a separate snapshot. | `approved-requirement` |
| AT-195 | Given immutable OrderDetails, later price/catalog changes, inactive Products, returns/exchanges, and tied Product totals, when Product reports/public best sellers run, then gross snapshots remain stable, later activity is separate, Admin history is retained, and `SL-006` public visibility/tie rules hold. | `approved-requirement` |
| AT-196 | Given Active/Disabled existing Customers, new accounts, Orders, and CompletedSales across boundaries, when Customer report runs, then account-status snapshot, new, ordering, and completed-sale distinct counts use exactly their defined populations/timestamps. | `approved-requirement` |
| AT-197 | Given attributable Order/after-sales/Support actions, first messages, resolutions, missing timestamps, and later Disabled Staff, when Staff report runs, then workload/duration denominators are traceable, missing data is not zero, history remains, and no score/rank is produced. | `approved-requirement` |
| AT-198 | Given current Inventory dimensions/alerts and period InventoryTransactions, empty data, Admin/non-Admin access, and stale/malformed queries, when Inventory/dashboard reports run, then snapshot and movement values remain separate, definitions/dataAsOf are present, zero is not demo data, and only valid Admin requests succeed. | `approved-requirement` |
| AT-199 | Given Admin Settings read/UI and direct requests from other roles, when used, then only the two allowlisted canonical settings and safe version/effective history are available to Admin and every other role is denied. | `approved-requirement` |
| AT-200 | Given payment timeout values 4, 5, 15, 60, 61, decimal, text, and missing, when validated, then only integers 5–60 succeed and default is 15 when no approved stored version exists. | `approved-requirement` |
| AT-201 | Given an online Order created before a timeout setting change and another after effective time, when deadlines are evaluated, then the old immutable PaymentDeadlineAt is unchanged and the new Order snapshots the new value exactly once. | `approved-requirement` |
| AT-202 | Given non-negative/negative/decimal global threshold values and Products with/without Warehouse overrides, when setting and reevaluation run, then only valid global value commits, override wins, no prior alert history rewrites, and each crossing effect occurs once. | `approved-requirement` |
| AT-203 | Given Admin UI/API attempts to read/write RETURN_WINDOW_DAYS or another Return/Exchange deadline and existing/new eligible deliveries, when processed, then setting is unavailable/rejected and every applicable immutable deadline remains delivery plus exactly five days. | `approved-requirement` |
| AT-204 | Given valid/invalid mixed batches, missing reason/key/version, duplicate command, stale/concurrent version, unknown key, and injected Audit/outbox failure, when Admin saves, then one complete next version/effect or none exists and loser/retry receives the current/existing result. | `approved-requirement` |

## 19. Preliminary G3 Traceability

| Decision | Requirements | Use case/interface | Implementation evidence | Acceptance | Confirmed gap | Status |
|---|---|---|---|---|---|---|
| BD-098 | BR-094 through BR-105 | Entire `SL-009` balanced design | Notification/Email/Audit/Report/SystemSetting modules and all owning services | AT-175 through AT-204 | Current features are independent best-effort modules rather than one reliable evidence-backed cross-cutting contract | ready |
| BD-099 | BR-094 | Inbox, Admin Audit/Reports/Settings, role middleware | Notification routes; Admin routes/pages; authorization middleware | AT-179, AT-180, AT-189, AT-198, AT-199 | Owner inbox/Admin routes exist, but boundaries are not complete across target links, sensitive views, and future operational events | ready |
| BD-100 | BR-095 | Every protected domain command; DomainOutbox consumer | Owning services call Audit/Notification/email inconsistently before/after transactions | AT-175, AT-176, AT-186, AT-204 | No shared domain outbox; many Audits/outbox writes occur after business commit and can be missing/throw independently | ready |
| BD-101 | BR-096 | Notification channel resolver/templates | `notification.service.js`; `email.service.js`; domain services | AT-177, AT-181 | Only a few events create messages; payment creates an Email-channel Notification not actual outbox delivery; renderer supports only reset/contact/order-created | ready |
| BD-102 | BR-097 | Email worker/outbox; inbox read/archive API/UI | `emailOutbox.model.js`; `email.worker.js`; Notification model/service/pages | AT-178, AT-179 | Failed email remains reclaimable without a total cap; no RetryScheduled/terminal policy/attempt history; UI says Delete although storage soft-deletes Read items | ready |
| BD-103 | BR-098 | Notification payload/templates/target routing | Notification model/detail page; email payloads; owning events | AT-180, AT-182 | No centralized safe schema or target authorization contract; event payloads/templates are incomplete | ready |
| BD-104 | BR-099 | Audit producer/schema | `auditLog.model.js`; `auditLogger.js`; service call sites | AT-183 through AT-185, AT-187 | Model cannot explicitly represent ActorType/Source/role/outcome/reason/correlation; System/external events are often attributed to Customer or coarse text | ready |
| BD-105 | BR-100 | Audit transaction/query/API/UI | Audit service/routes/page; owning transactions | AT-186 through AT-189 | Audit commonly writes after transaction; response omits before/after; fixed 100 limit lacks target/outcome/role filters and stable cursor; raw Mixed objects are unbounded | ready |
| BD-106 | BR-101, BR-102 | Revenue report/API/dashboard | `report.service.js` and tests | AT-190 through AT-193 | Current-state Delivered/Paid filter erases later Returned/Refunded sales, all-time can accept missing DeliveredAt, and completed ReturnRequest is used as Refund authority | ready |
| BD-107 | BR-101, BR-103 | Dashboard and detailed Product/Customer/Staff/Order/Inventory reports | Report service/dashboard; Orders, Support, Review, Inventory models | AT-190, AT-194 through AT-198 | Only one in-memory overview exists; detailed reports are absent; period Order status mixes CreatedAt with current state; current snapshots lack dataAsOf labels | ready |
| BD-108 | BR-104 | Admin Settings and `SL-003/SL-005` consumers | SystemSetting service/page/demo data; Order/Inventory services | AT-199, AT-200, AT-202, AT-203 | Current allowlist includes editable seven-day RETURN_WINDOW_DAYS; low-stock default is disconnected/hard-coded in Inventory paths; payment timeout has no proven Order snapshot consumer | ready |
| BD-109 | BR-105 | Versioned setting batch/effective-value consumers | SystemSetting model/service/tests | AT-201, AT-202, AT-204 | Current sequential upserts have no reason/version/effective history/idempotency/transaction and silently ignore unsupported keys | ready |
| BD-111, BD-114, BD-117 | CR BR-108, BR-113 through BR-115, BR-119, BR-121 | CompletedSale/Refund events, Customer collection, Carrier settlement, and aggregate settlement | Report/event projections; Refund, PaymentAttempt, Customer-collection, and settlement sources | CR AT-207, AT-208, AT-215 through AT-218, AT-223 through AT-226 | Current report and refund storage infer from mutable status, one Order-level refund row, and ambiguous collection/settlement facts | ready |
| BD-050, BD-101 | CR BR-120 | Failed attempt/reschedule and DeliveryFailed channel resolution | DomainOutbox, Notification, EmailOutbox/templates | CR AT-220 | Matrix previously omitted required SL-004 Customer events | ready |
| BD-116 | CR BR-117, BR-118 | Safe notification/audit/report payloads | Outbox, templates, Audit serializer, report export | CR AT-221, AT-222 | No complete shared after-sales evidence/destination exclusion profile exists | ready |

## 20. Confirmed Current Conflicts

The following are `observed-behavior`, not approved policy:

1. `report.service.js` treats Gross Sales as Orders whose current states are still `Delivered` and `Paid`.
2. A later `Returned/Refunded` Order therefore disappears from historical Gross Sales.
3. In all-time mode, the current range helper can accept a Delivered/Paid Order with no `DeliveredAt`.
4. Refund reporting reads `ReturnRefundRequest.status=Completed` and `completedAt` instead of the authoritative distinct Refund lifecycle and `RefundedAt`.
5. Late-payment and paid-cancellation Refund records in `RefundPending` are outside the report query.
6. Order period totals select by `Order.createdAt` and then group current status, mixing an event cohort with mutable present state.
7. The report loads all Orders, Inventory, Support, and Reviews into application memory and has no detailed Product/Customer/Staff/Inventory reports.
8. Product count includes every Product without a documented Active/Inactive split or period/snapshot label.
9. Staff performance measures required by the SRS are absent.
10. Current Inventory/low-stock values are returned beside period metrics without a visible `dataAsOf` distinction.
11. `SystemSetting` defaults `RETURN_WINDOW_DAYS` to 7 and the Admin page permits arbitrary return-window changes, contradicting approved fixed five-day Return/Exchange rights.
12. `PAYMENT_TIMEOUT_MINUTES` and `LOW_STOCK_DEFAULT_THRESHOLD` exist in Settings but searches show no complete authoritative consumer for immutable Order deadline snapshot or all Inventory initialization/evaluation paths.
13. Inventory lazy creation hard-codes threshold 5, bypassing the global default.
14. SystemSetting update performs sequential upserts, then Audit, without one transaction.
15. Settings have no version, effective time, mandatory reason, idempotency identity, or immutable value history.
16. Unknown setting keys are filtered out rather than rejected when at least one supported key remains.
17. Notification uniqueness is only `userId + eventId`, so different type/channel effects for the same event can be collapsed.
18. Payment Notification records use channel `Email` but are not routed through the actual EmailOutbox worker.
19. Email renderer supports only password-reset OTP, contact submission, and Order-created events; approved registration, status, refund, Return/Exchange, Review, and Support templates are absent.
20. EmailOutbox uses `Failed` as an automatically reclaimable state with exponential delay and no five-attempt terminal cap or append-only attempt collection.
21. In-app Notification is soft-deleted only after Read, which preserves physical history, but API/UI incorrectly calls the action Delete instead of Archive.
22. In-app event producers exist mainly in Inventory/Replenishment plus Payment paths; most `SL-001..008` events are not connected.
23. AuditLog model has User-only attribution plus coarse action/description and cannot express System/external source, role snapshot, outcome, explicit reason, or correlation identity.
24. Audit response omits stored before/after fields, and Audit querying supports only action/user/from/to with a fixed 100-record result and no stable cursor.
25. Audit before/after are unrestricted Mixed fields with no central sensitive-data allowlist.
26. Many services commit domain transactions and then call Audit; Audit failure can leave committed business state while the API still fails or lacks required evidence.
27. Current selected tests all pass: 26 targeted server tests and 10 targeted client tests. They prove current module behavior, including the wrong seven-day setting/current-state report contracts, not `SL-009` correctness.

## 21. Cross-Slice Consistency Boundaries

1. `SL-001` owns Return request, destination confirmation, payout/refund, and final receipt. `SL-009` only delivers its approved events and reports immutable Refund outcomes.
2. `SL-002` owns Exchange quantities, inspections, shipments, replacement delivery, and replacement five-day rights. Notification never approves or edits them.
3. `SL-003` owns Order creation, payment attempts/callbacks, cancellation, deadline snapshots, late-payment Refund handoff, and primary monetary evidence. Report consumes those facts without reinterpreting provider status or Carrier remittance as Customer payment.
4. `SL-004` owns packing, shipping, Carrier delivery, fixed COD expected amount, Customer collection evidence, separate Carrier settlement evidence, COD discrepancy/reconciliation, and DeliveredAt. Packing remains Audit-only for Customer communication.
5. `SL-005` owns Inventory dimensions, Product threshold override, alerts, damage, replenishment, and transactions. Admin global low-stock default cannot overwrite the Warehouse override.
6. `SL-006` owns Product/Category publication, price/OrderDetail snapshots, and public best-seller visibility. Report uses snapshots and retains inactive history.
7. `SL-007` owns identity challenges, sessions, role/account status, password/OTP/token privacy, and Admin account boundaries. Notification delivery never creates a session or keeps a Disabled session alive.
8. `SL-008` owns Review moderation, Support assignment/messages/status, and privacy. Audit/report/notification omit full user-generated content and never grant Admin Support authority.
9. Every owning slice remains the only command authority for its business object; a Notification target, Audit detail, or Report drill-down is read/navigation, not a mutation back door.
10. Fixed original/replacement after-sales deadlines remain immutable five-day snapshots regardless of current Settings.
11. Existing monetary, product-price, delivery-address, deadline, and actor snapshots never change because current catalog/account/settings data changes.
12. Domain events must carry stable references and minimum safe report/notification evidence, but no cross-cutting consumer may repair missing source truth by guessing.

## 22. Required SRS Reconciliation

When the project begins the SRS reconciliation phase, the following changes are required; this approved local design does not itself mutate Google Docs:

1. Remove `RETURN_WINDOW_DAYS` from `FR-AAM-12`, the System Setting dictionary, `UC-AD-05`, RTM, and acceptance; replace it with fixed five-day Return/Exchange requirements referencing `SL-001/SL-002`.
2. Retain Admin `PAYMENT_TIMEOUT_MINUTES` and global low-stock default, adding validation ranges, effective time, version, reason, idempotency, future/snapshot effects, and Warehouse override precedence.
3. Expand Notification logical identity to business event, recipient, type, and channel; separate email delivery state from in-app read/archive state.
4. Add the approved channel matrix, five-attempt retry terminal, attempt evidence, lease recovery, archive-not-delete language, and target authorization re-check.
5. Replace “email failure shall not roll back” alone with the atomic domain/Audit/DomainOutbox boundary plus post-commit external delivery.
6. Expand Audit actor/source/outcome/correlation/state-version fields and required event coverage while adding privacy exclusions.
7. Add stable Audit pagination and target/role/outcome filters; keep Admin-only immutable access.
8. Preserve candidate CompletedSale/Gross/Refund/Net rules but explicitly prohibit current-status/`updatedAt` inference and require distinct Refund/`RefundedAt` authority.
9. Define Order/Product/Customer/Staff/Inventory measures and distinguish period events from current snapshots.
10. Add current-month default, explicit all-time mode, timezone, `generatedAt`, and `dataAsOf`.
11. Add negative Net Sales, inactive historical actor/product, missing timestamp reconciliation, empty-data, wrong-role, grouped-failure, duplicate-channel, and stale-setting acceptance cases.
12. Update Appendix A implementation alignment to record the confirmed current gaps rather than presenting green module tests as conformance.

## 23. Verification Snapshot Before Implementation

Read-only evidence gathered before and during approval:

- Google SRS full content and revision/tab metadata were read before the cross-slice reconciliation; the CR-001 v2.1 addendum and COD collection/settlement clarification were then written with a revision guard and read back.
- Notification/EmailOutbox/worker, AuditLog, Report, SystemSetting, relevant domain models/services/routes, Admin/inbox UI, demo settings, and tests were inspected.
- Twenty-six selected server tests for Notification, email/worker, Audit, Report, and Settings passed against current behavior.
- Ten selected client tests for Notification inbox/bell/service and Admin dashboard query passed against current behavior.
- Those 36 green tests are `observed-behavior` evidence only and leave `AT-175` through `AT-204` unimplemented.
- The approval artifact changes no application code, migration, runtime data, or user-owned `docs/presentation/` content; the bounded Google SRS sync is recorded by CR-001 v2.1.

## 24. Method Basis and Next Phase

Archived SWR Chapter 17 distinguishes validation of stakeholder need from verification of an implementation and requires requirements to be correctly derived, complete, feasible, verifiable, necessary/sufficient, consistent, and adequate for design. Archived SWD Chapters 9–11 define state-dependent behavior through current state, event, guard, action, and next state and require alternative paths to be modeled. Those sources guide artifact structure and testability only; GreenHouse policy comes from `SRC-051` plus approved cross-slice decisions.

No code change, migration, red acceptance test, or implementation plan is authorized by this document alone. The cross-system consistency audit and bounded SRS reconciliation are recorded in CR-001 v2.1; the next step is exact G3 interface/model/service/UI/test mapping, followed by red acceptance tests before implementation.
