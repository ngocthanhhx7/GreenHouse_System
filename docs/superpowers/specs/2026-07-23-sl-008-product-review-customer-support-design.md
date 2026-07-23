# SL-008 Product Review and Customer Support Design

**Date:** 2026-07-23

**Status:** Fast-track business package approved; implementation not started

**Business approver:** Project Business Approver (user in this Codex task)

**Implementation baseline:** `20139fc10a467f49ed32561239df29ac5380e36f`

**SRS baseline:** Google Docs revision `AIroW372r8j-BncuGRhIEqFwCQa2PLXsnMT53H_cxn5r7E_t-NkRjh2gJg2UEves9dhsAFtoTr0qoSWM8Lt1qYAOQzSFBEWVaj2Ap2eXHQI`; one tab `t.0`; read back 2026-07-23

## 1. Scope and Gate Status

`SL-008` governs verified-purchase Product Reviews and the Customer-to-Staff/CSKH Support Request conversation. Review and Support remain separate business objects and separate state machines even though the candidate SRS groups them in one section.

The Review slice begins when an authenticated Customer opens an eligible purchased Product or Order line and ends when one durable Customer-Product review record, its publication/moderation state, public projection, aggregate rating, history, and retry outcome are deterministic.

The Support slice begins when an authenticated Customer submits a classified support need and ends when the request is withdrawn or resolved, including assignment, append-only conversation, priority, controlled reopening, ownership, and cross-slice boundaries.

This package includes:

- immutable delivered-purchase eligibility through an owned OrderDetail;
- one durable review per Customer and Product across repeat purchases;
- required integer rating, optional bounded plain-text content, and privacy-safe public display;
- Customer edit, withdraw, and republish intent separated from Staff moderation;
- Staff/CSKH hide and restore controls with reason, without content mutation;
- visible-only aggregate rating, stable pagination, optimistic concurrency, and idempotency;
- classified Customer Support Requests with validated Order/Product references;
- append-only Customer and assigned-Staff Support Messages;
- atomic Staff claim, controlled reassignment, Staff-owned priority, and disabled-assignee recovery;
- `New`, `InProgress`, `Resolved`, and `Withdrawn` transitions plus a fixed 72-hour Customer reopen window;
- ownership-safe reads, privacy-safe audit/outbox evidence, and explicit feedback for repeated clicks;
- strict isolation from Order, Payment, Return/Refund, Exchange, Shipment, and Inventory transitions.

This package does not define public review images/video, review likes/replies, a pre-publication moderation queue, Customer-selected support priority, support attachments, SLA timers, support teams, chatbots, omnichannel contact, knowledge-base articles, or Admin/Warehouse support operations. Return/Refund and Exchange evidence remains in `SL-001` and `SL-002`. Notification delivery, audit-log administration, and reporting calculations will be reconciled in a later cross-cutting package; `SL-008` only defines the domain events and evidence those consumers require.

Both Review and Support are `Must Have` in the approved release baseline. This resolves the candidate SRS conflict where `UC-CS-11` is marked `Should Have` while its functional requirements are `Must Have`.

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Next evidence |
|---|---|---|---|---|---|---|---|---|---|
| SL-008 | passed | passed | passed | ready | not-started | not-started | not-started | not-started | Complete exact G3 API/interface/code/test/release-evidence mapping against the reconciled SRS revision |

No unresolved business decision remains inside the approved `SL-008` package.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-045 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Google Docs revision `AIroW372r8j-BncuGRhIEqFwCQa2PLXsnMT53H_cxn5r7E_t-NkRjh2gJg2UEves9dhsAFtoTr0qoSWM8Lt1qYAOQzSFBEWVaj2Ap2eXHQI`; one tab `t.0`; read back 2026-07-23 | Candidate Review/Support text; CR-001 v2.1 adds only shared privacy/evidence constraints where referenced | Candidate source only where adopted or explicitly changed by this approved package | SRS contributors; Project Business Approver approves policy | Full SL-008 lifecycle still needs its own G3 mapping; CR-001 v2.1 does not replace Review/Support ownership rules |
| SRC-046 | Explicit fast-track approval, “duyệt SL-008” | 2026-07-23 | `BD-087` through `BD-097` and this complete bounded package | Normative business authority for `SL-008` | Project Business Approver | Approver display name is not recorded |
| SRC-047 | Repository `D:\GreenHouse_System-main` | HEAD `20139fc10a467f49ed32561239df29ac5380e36f`; inspected 2026-07-23 | Current ProductReview/SupportRequest models, services, routes, public/Customer/Staff UI, seed mappings, reports, and tests | `observed-behavior` only | Engineering team | Public identifier leakage, per-Order duplicate reviews, required text, response overwrite, legacy `Open`, missing messages/claim guards, raw Order-ID input, ignored classification fields, and unbounded lists conflict with this design |
| SRC-048 | Archived SWR Chapter 17 and SWD Chapters 9–11 | Local archive accessed 2026-07-23 | Requirements completeness/consistency/verifiability and explicit current-state/event/guard/action/next-state modeling | Method guidance only | SWR/SWD archive | Does not decide GreenHouse business policy |
| SRC-049 | Approved `SL-001` through `SL-007` designs | Approved 2026-07-22 | Staff=CSKH identity, delivery evidence, immutable OrderDetail snapshots, Return/Exchange deadlines, payment/inventory authority, active-account/session rules, public Product visibility, and idempotency boundaries | Normative for referenced cross-slice rules | Project Business Approver | Current Review/Support implementation does not yet honor all approved ownership, status, privacy, and disabled-assignee continuity rules |

## 3. Approved Business Decision Log

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Decision date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-087 | SL-008 | What release depth should Review and Support implement? | Preserve minimal one-way SRS; balanced release workflow; full helpdesk/UGC platform | Use the balanced workflow: durable editable/moderated reviews and two-way assigned support conversations, without SLA teams, omnichannel tools, public review media, or support attachments | Correct the current business failures while keeping the release feasible and bounded | Project Business Approver | 2026-07-23 | BR-083 through BR-093 |
| BD-088 | SL-008 | What proves review eligibility and prevents repeat-purchase duplicates? | One review per Order line; one active record per current Delivered Order; one durable Customer-Product record backed by a delivered event | Eligibility requires an owned OrderDetail whose Order has an immutable `DeliveredAt`. Create at most one durable review record per Customer and Product, using the invoking eligible OrderDetail or the most recent eligible OrderDetail selected by the System. A later whole return, refund, or same-SKU exchange does not erase the delivered experience or permit a second record | Preserve truthful verified-purchase evidence and stop duplicate ratings across repeat purchases | Project Business Approver | 2026-07-23 | BR-083 |
| BD-089 | SL-008 | What review input and public identity are permitted? | Rating and mandatory text with raw IDs; rating only with anonymous label; rating plus optional bounded text and masked identity | Rating is a required integer 1–5. Plain-text content is optional and at most 1,000 characters after normalization. No media is accepted. Public output shows masked current display name, verified-purchase label, rating/content, and created/updated times, but never Customer, Order, or OrderDetail identifiers | Match the candidate use case while preventing public personal/transaction identifier disclosure | Project Business Approver | 2026-07-23 | BR-084 |
| BD-090 | SL-008 | How do Customer publication intent and Staff moderation coexist? | Create-only; one combined Visible/Hidden status; two independent state dimensions with history | Keep one durable record with Customer publication `Published/Withdrawn` and Staff moderation `Allowed/HiddenByStaff` as independent facts. Customer may edit, withdraw, or republish own record. Staff/CSKH may hide or restore with reason but cannot edit rating/content. Every content version and state transition remains attributable; no hard delete exists | Avoid a single status mixing ownership and moderation, and prevent a hidden reviewer from bypassing moderation by creating another record | Project Business Approver | 2026-07-23 | BR-085 |
| BD-091 | SL-008 | Which reviews contribute to public lists and rating aggregates? | Count every stored rating; delete hidden records; derive visible projection with stable paging | A review is public only when Customer intent is Published, moderation is Allowed, and Product plus Category are Active. Total and arithmetic mean use only that same visible set; mean is returned to one decimal. Lists use stable server pagination ordered by original creation time descending then review ID, so edits do not move a review to the top | Keep display and aggregate mathematically consistent and prevent edit-based ranking manipulation | Project Business Approver | 2026-07-23 | BR-086 |
| BD-092 | SL-008 | What must a Customer submit to open Support? | Free-form subject/body only; Customer-selected priority; classified validated request | Customer selects `Order`, `Payment`, `ReturnRefund`, `Exchange`, `Product`, `Account`, or `Other`; supplies subject 5–120 and initial content 10–2,000 plain-text characters; and selects references through authorized UI. System creates a unique human-readable ticket code, `New` status, no assignee, and `Normal` priority. Order-related types require an owned Order; Product requires a valid Active Product; when both are supplied the Product must occur in that Order. Account/Other may omit references, and any supplied reference still must pass ownership/validity guards | Give CSKH enough structured context without exposing internal IDs or letting Customer control operational priority | Project Business Approver | 2026-07-23 | BR-087 |
| BD-093 | SL-008 | Is Support a one-way response or an append-only conversation? | One latest response field; Staff-only message history; two-way append-only messages | Preserve the immutable initial Customer content and every subsequent Customer or assigned-Staff message as a separate append-only SupportMessage with sender, role, text, timestamp, and command identity. Customer may append while `New` or `InProgress`; Staff may append only after assignment in `InProgress`. No actor may edit or delete a sent message | Make CSKH communication usable and auditable without overwriting evidence | Project Business Approver | 2026-07-23 | BR-088 |
| BD-094 | SL-008 | What SupportRequest lifecycle is allowed? | Candidate `New -> InProgress -> Resolved` only; many waiting/closed states; small lifecycle plus withdrawal/reopen | Customer may withdraw only unassigned `New`. Staff atomically accepts `New -> InProgress`. Assigned Staff resolves `InProgress -> Resolved` only by appending a final response and storing `ResolvedAt` plus immutable `ReopenDeadlineAt = ResolvedAt + 72 hours`. Owning Customer may append a new message and reopen `Resolved -> InProgress` at or before the deadline; after it, a new ticket is required. `Withdrawn` is terminal | Support a realistic correction loop without introducing a large helpdesk state machine | Project Business Approver | 2026-07-23 | BR-089 |
| BD-095 | SL-008 | Who owns assignment and priority? | Any Staff may overwrite; manager-only routing; atomic assignee ownership among equal Staff actors | First eligible Staff claim wins atomically and becomes assignee. Only the current active assignee may reply, change priority, resolve, or transfer to another Active Staff; priority begins Normal and any change or transfer requires reason. When SL-007 disables an assignee, System clears current assignment without changing request/message history or `InProgress` state, and any Active Staff may atomically reclaim it | Stop concurrent handling and preserve continuity without inventing a Staff-manager or Admin-CSKH role | Project Business Approver | 2026-07-23 | BR-090 |
| BD-096 | SL-008 | Who may read Review/Support data and what remains private? | Broad authenticated access; Admin super-access; purpose-limited ownership and Staff operations | Guest/Customer read only the public Review projection; Customer additionally manages own review and only own Support Requests/messages. Staff reads minimum Review moderation evidence and operational Support data, but no Customer password/OTP/address-book/refund-destination data. Admin and Warehouse receive no `SL-008` business command. Audit never copies full message/review text or sensitive references | Enforce existing actor boundaries and minimize exposure of user-generated and transactional data | Project Business Approver | 2026-07-23 | BR-091 |
| BD-097 | SL-008 | How are retries, cross-slice effects, audit, and notifications bounded? | Best-effort updates; let Support mutate related objects; guarded domain command plus post-commit consumers | Create/edit/publication/moderation, ticket create/claim/message/priority/transfer/withdraw/resolve/reopen commands carry idempotency identity and expected version where state-dependent. Repeats return the prior/current result with clear feedback; stale races change nothing. Support may link context but never creates, approves, rejects, extends, refunds, exchanges, ships, or changes stock. Each committed domain action records privacy-safe audit/outbox evidence once; later notification delivery failure cannot roll it back | Prevent double effects and keep a communication object from becoming an unauthorized operational back door | Project Business Approver | 2026-07-23 | BR-092, BR-093 |

## 4. Actor Responsibility Matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Guest | Use trustworthy ratings while browsing public Products | List visible reviews and aggregates for an Active Product in an Active Category | Submit/edit/withdraw a review; view reviewer/Order identifiers; access Support; view inactive/hidden review data | None | Public masked Review projection and visible aggregate only | May authenticate as Customer to use owned Review/Support functions | Inactive Product is not publicly disclosed; invalid page input receives field feedback; empty result is successful |
| Customer | Share one verified Product experience and obtain traceable CSKH help | Create/edit own durable review; withdraw/republish it; view own publication/moderation result; create/list/open own Support; append messages in allowed states; withdraw unassigned New; reopen own Resolved request by deadline | Create a second review for another purchase of the same Product; bypass Staff moderation; set support priority/assignee/status; edit/delete messages; access another Customer; mutate Order/Payment/Return/Exchange/Inventory through Support | Own Review publication intent; `None -> New` Support creation; unassigned `New -> Withdrawn`; eligible `Resolved -> InProgress` reopen | Own internal Review and Support data; public projection for others; no foreign records or internal Staff queue | Verified purchase to Review; classified request/messages to Staff/CSKH; dedicated after-sales action to `SL-001/SL-002` | Ineligible/foreign/stale input changes nothing; duplicate key returns prior result; after reopen deadline Customer is directed to create a new ticket |
| Staff / CSKH | Keep public reviews appropriate and resolve Customer questions with one accountable handler | Hide/restore Review with reason; list moderation context; list/filter Support queue; atomically claim; append response; set priority; transfer; resolve | Edit Customer rating/content/message; create Review for Customer; claim an already assigned request; act without assignment; alter Customer-owned sensitive data; use Support to bypass another slice | Review moderation `Allowed <-> HiddenByStaff`; Support `New -> InProgress` and assigned `InProgress -> Resolved`; assignment/priority changes without request-status change | Minimum eligibility/moderation evidence; operational ticket, Customer identity/contact needed for support, references, and full append-only conversation; no password/OTP/address-book/refund destination | Moderation result to Customer; assigned conversation/result to Customer; operational requests to their owning `SL-001–SL-005` interfaces | Claim race loses safely; stale/non-assignee command is denied; transfer target disabled is rejected; unresolved external issue remains InProgress |
| Admin | Govern accounts and later audit/reporting without becoming CSKH | No `SL-008` business command; may consume approved audit/report views in later packages | Moderate reviews; read support conversations merely by Admin role; claim/respond/resolve; edit Customer content; bypass Staff assignment | None | No direct `SL-008` operational write; later privacy-limited audit/report derived data only | Disabled Staff event from `SL-007` to System reassignment recovery | Direct moderation/support endpoint is denied and changes nothing |
| Warehouse Manager | Remain focused on physical goods and Inventory | No `SL-008` command | Read private Support conversation; moderate Review; claim/respond/resolve; mutate any Review/Support state | None | No Review moderation or Support data scope; public Review projection only if using public surface | Dedicated return/exchange/inspection facts remain in `SL-001/SL-002/SL-005` | Direct protected endpoint is denied and changes nothing |
| GreenHouse System | Enforce verified purchase, ownership, state, assignment, privacy, history, and retry invariants | Validate and execute authorized commands; select eligible OrderDetail; derive public visibility/aggregate; generate ticket code; enforce claim/version/idempotency; record audit/outbox | Invent Customer publication/support intent or Staff decision; expose internal IDs publicly; overwrite history; reinterpret a message as an Order/payment/stock command | Mechanical transition after authorized event, current state, guard, and atomic claim; clears disabled assignment as an SL-007 consequence | Minimum joined User/Role, Product/Category, Order/OrderDetail, Review, SupportRequest/Message, idempotency, audit, and outbox data | Public projection to Guest/Customer; queue/conversation to Staff; post-commit domain events to later Notification/Audit/Reporting consumers | Invalid/stale/duplicate operations return safe current/prior result; grouped failure rolls back; delivery failure remains retryable after business commit |

## 5. Business Slice Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-008 | Customer publishes one verified Product experience and maintains one accountable two-way CSKH case without weakening other business controls | Customer selects Write Review for an eligible purchased Product or submits a classified Support Request | Active authenticated Customer for owned commands; Active Staff and assignment for Staff commands; valid Product/OrderDetail/reference; expected current state/version; idempotency identity | Execute `UC-REV-01`/`UC-REV-02` or `UC-SUP-01`/`UC-SUP-02` through a visible/withdrawn/moderated review or withdrawn/resolved/reopened support outcome | Apply `AF-008` paths without duplicate review/rating, overwritten messages, false assignment, privacy leakage, invalid transition, or cross-slice mutation | Rating integer 1–5; content 0–1,000; subject 5–120; initial support 10–2,000; later message 1–2,000; average visible rating to one decimal; reopen deadline exact 72 hours | Review identity is Customer+Product; OrderDetail evidence persists; Review publication and moderation are independent; messages append only; one assignee at a time; Support state and related business state remain separate | Actor matrix above | AT-150 through AT-174 | `approved-requirement` |

## 6. Normative Requirements

| Requirement ID | Approved requirement | Decision |
|---|---|---|
| BR-083 | A Customer shall have at most one durable ProductReview per Product. Creation requires an owned OrderDetail whose Order has recorded `DeliveredAt`. System shall store the exact eligibility-verifying OrderDetail. Repeat purchase, completed whole return/refund, or same-SKU exchange shall neither create another review identity nor erase eligibility/history. | BD-088 |
| BR-084 | Rating shall be a required integer from 1 through 5. Review content shall be optional normalized plain text of at most 1,000 characters. Public output shall contain masked current display name, verified-purchase label, rating, optional content, and created/updated times only; it shall exclude Customer, Order, OrderDetail, email, phone, and other private identifiers. | BD-089 |
| BR-085 | One durable Review shall maintain independent Customer publication `Published/Withdrawn` and Staff moderation `Allowed/HiddenByStaff` facts. Customer may edit own rating/content and change own publication intent. Only Staff/CSKH may hide/restore with a mandatory reason and may never edit Customer content. Versions, actors, reasons, and times shall remain append-only; Review shall not be hard-deleted. | BD-090 |
| BR-086 | A Review shall contribute to public list/count/average only while publication is Published, moderation is Allowed, and Product plus Category are Active. Average shall be the arithmetic mean of exactly that visible set returned to one decimal. Public lists shall use bounded stable server pagination by `CreatedAt DESC, ReviewID DESC`. Every Review mutation shall enforce idempotency and expected version. | BD-091 |
| BR-087 | Customer shall create Support only for self with request type `Order/Payment/ReturnRefund/Exchange/Product/Account/Other`, normalized subject 5–120, immutable initial content 10–2,000, and authorized selected references. System shall generate one unique ticket code, `New` state, no assignee, and Normal priority. Order-related types require an owned Order; Product requires an Active Product; a Product plus Order reference must match an OrderDetail; optional Account/Other references still require validity/ownership. | BD-092 |
| BR-088 | Initial Customer content and every later Customer or assigned-Staff response shall be a distinct append-only SupportMessage with sender, sender role, normalized plain text 1–2,000 for later messages, timestamp, and command identity. Customer may append while New/InProgress; Staff may append only as the active assignee while InProgress. No sent content shall be edited, deleted, or overwritten. | BD-093 |
| BR-089 | SupportRequest transitions shall be only: valid creation to New; unassigned New to Withdrawn by owner; New to InProgress by one atomic Staff claim; InProgress to Resolved by active assignee with final response; and Resolved to InProgress by owning Customer message at or before immutable `ReopenDeadlineAt = ResolvedAt + 72 hours`. Withdrawn and Resolved after its deadline reject further mutation except read; every resolution/reopen cycle remains historical. | BD-094 |
| BR-090 | Support begins unassigned with Normal priority. First eligible Staff claim wins. Only current Active assignee may reply, set Low/Normal/High/Urgent priority with reason, transfer with reason to another Active Staff, or resolve. Disabled assignee shall be cleared by System without changing status/history and the active request shall become claimable; priority and assignment history remain append-only. | BD-095 |
| BR-091 | Guest/Customer shall read only the public Review projection except Customer's own protected management view. Customer shall access only own Support. Staff shall receive only operational Review moderation and Support data. Admin and Warehouse shall have no `SL-008` business command. Public APIs, audit, logs, and events shall omit raw private IDs/content except the minimum protected target/reference identifiers required internally. | BD-096 |
| BR-092 | Support is a communication/context object only. It shall not create, approve, reject, extend a deadline, cancel, refund, exchange, pack, ship, deliver, inspect, reconcile payment, or mutate Inventory. The authorized interfaces in `SL-001` through `SL-005` remain the only owners of those effects. | BD-097 |
| BR-093 | Every mutating Review/Support command shall carry one idempotency identity and, when state-dependent, an expected version. Concurrent/stale losers change nothing and receive current-state feedback; completed retries return prior/current result with `already processed` feedback. Each successful command shall persist privacy-safe actor/action/target/before-after state or version/reason/time evidence and one idempotent domain outbox event; later delivery/reporting failure shall not roll back the committed domain result. | BD-097 |

## 7. UC-REV-01 — Create or Update Verified Product Review

### Preconditions

1. Customer is authenticated, Active, and owns the command.
2. At least one OrderDetail for the Product belongs to Customer and its Order has an immutable `DeliveredAt`.
3. Input has an integer rating 1–5 and optional normalized plain text no longer than 1,000 characters.
4. Command has idempotency identity and the expected Review version when updating.

### Main Flow

1. Customer selects Write Review from an owned Order line or an eligible Product detail.
2. System resolves the invoking eligible OrderDetail; when no Order line was supplied, it selects the most recently delivered eligible OrderDetail deterministically.
3. System finds the durable Review by Customer and Product.
4. If none exists, System atomically creates it with eligibility OrderDetail, rating/content version one, Customer publication Published, moderation Allowed, audit, and outbox.
5. If one exists, System displays it rather than offering a second creation.
6. Customer may submit an edit to the same Review. System validates ownership/version/input and appends a new content version without changing original `CreatedAt`, eligibility identity, or Staff moderation state.
7. Repeated identical command returns the existing created/updated result with explicit already-processed feedback.

## 8. UC-REV-02 — Publish, Moderate, and Display Reviews

### Customer Publication

1. Customer opens own Review management view.
2. Customer may change `Published -> Withdrawn` without deleting Review/history.
3. Customer may change `Withdrawn -> Published`. If Staff moderation remains HiddenByStaff, the Review stays non-public and UI explains that Staff restoration is still required.
4. Customer may edit a HiddenByStaff Review, but the edit does not bypass moderation.

### Staff Moderation

1. Staff opens minimum Review moderation context: content/version, masked/public author plus internal stable target, Product, verified eligibility result, current publication/moderation states, and history needed for decision.
2. Staff enters a mandatory bounded reason and submits hide or restore with expected version/idempotency identity.
3. System changes only moderation `Allowed <-> HiddenByStaff`, appends evidence, and never changes Customer rating/content/publication intent.

### Public Display and Aggregate

1. Guest/Customer requests an Active Product detail review page with bounded page/pageSize.
2. System selects exactly Published + Allowed Reviews for that Product while its Product and Category remain Active.
3. System calculates visible count and arithmetic mean from that same set and returns the mean to one decimal.
4. Each item contains masked current display name, verified-purchase label, rating, optional content, created/updated times, and no protected identifier.
5. Results use stable `CreatedAt DESC, ReviewID DESC` order.

## 9. UC-SUP-01 — Submit Classified Support Request

### Preconditions

1. Customer is authenticated and Active.
2. Request type, subject, initial content, and any references pass `BR-087`.
3. Order selector values come from Customer-owned Orders; Product selector values come from valid public Product data or a selected owned Order line.
4. Command has an idempotency identity.

### Main Flow

1. Customer selects the support request type.
2. UI presents only the reference controls required/allowed for that type and never asks for an internal ObjectId.
3. Customer selects an owned Order and optional matching Product where applicable, enters subject and initial content, then confirms.
4. System revalidates current account, ownership, type/reference compatibility, Product activity, lengths, and idempotency.
5. One atomic operation creates unique ticket code, `New` request, no assignee, Normal priority, immutable initial Customer message, audit, and outbox.
6. Customer sees ticket code, status, submitted content, reference summary, and a detail link.
7. A repeated submission with the same command identity returns the same ticket and states that it was already submitted.

## 10. UC-SUP-02 — Accept, Converse, Resolve, and Reopen Support

### Staff Claim and Conversation

1. Active Staff filters/pages the queue by valid status, type, priority, assignment, and creation time.
2. Staff opens a request and submits accept with current version.
3. System atomically changes unassigned `New -> InProgress` and assigns that Staff; a concurrent loser receives current assignee/status.
4. Customer may append messages while New/InProgress. Only current Active assignee may append Staff messages while InProgress.
5. Each message command appends one immutable SupportMessage and audit/outbox evidence; it never replaces another message.
6. Assigned Staff may change priority or transfer to another Active Staff with reason and current version. The request status and conversation remain unchanged.

### Resolve and Reopen

1. Assigned Staff submits a final response plus resolve command.
2. One atomic operation appends the Staff message, changes `InProgress -> Resolved`, stores `ResolvedAt` and `ReopenDeadlineAt = ResolvedAt + 72 hours`, and records evidence.
3. At or before `ReopenDeadlineAt`, owning Customer may submit a new message and reopen. System appends the message and changes `Resolved -> InProgress` without erasing the former resolution cycle.
4. The current active assignee remains assigned if still Active; otherwise the request is unassigned and claimable.
5. After the exact deadline, reopen is denied and UI directs Customer to create a new request.

### Withdraw and Disabled Assignee

1. Customer may withdraw only a still-unassigned New request. System changes `New -> Withdrawn` and preserves content/history.
2. If SL-007 disables an assigned Staff, System clears current assignment, appends reassignment-needed evidence, retains current InProgress state/messages/priority, and exposes the item to Active Staff claim.

## 11. Alternative and Failure Paths

| Path | Condition | Required outcome |
|---|---|---|
| AF-008-01 | Customer/Product/OrderDetail ownership or delivered evidence is missing | Reject Review without revealing foreign record; create/change no Review |
| AF-008-02 | Product is inactive but owned delivered evidence exists | Permit protected Review creation/management, retain history, but exclude it from public Product views while Product/Category is inactive |
| AF-008-03 | Another eligible Order for the same Customer/Product exists | Show/use the single durable Review; never create another rating contribution |
| AF-008-04 | Order later becomes Returned/Refunded or same-SKU Exchange completes | Preserve Review identity, visibility states, rating/history, and verified delivered evidence; create no second eligibility |
| AF-008-05 | Rating is missing/non-integer/outside 1–5 or content exceeds 1,000 | Return field feedback; append no version/state/audit success effect |
| AF-008-06 | Customer submits blank review text | Accept rating-only Review after normalization |
| AF-008-07 | Customer attempts to publish while HiddenByStaff | Preserve Published intent but keep public visibility false; require Staff restoration |
| AF-008-08 | Staff attempts moderation without reason or Customer attempts moderation | Deny; change neither moderation nor content/publication |
| AF-008-09 | Staff attempts to edit rating/content | Deny and preserve Customer-owned version |
| AF-008-10 | Public request targets inactive Product/Category or asks for protected IDs | Return public not-found/field-safe result and no protected data |
| AF-008-11 | Review create/update/publication/moderation races or repeats | Unique Customer-Product identity plus version/idempotency returns one result; stale loser changes nothing |
| AF-008-12 | Support type/subject/content is invalid | Return field feedback; create no request/message |
| AF-008-13 | Order reference is foreign or missing for order-related type | Deny as not-found/invalid without disclosing owner; create no request |
| AF-008-14 | Product is invalid/inactive or does not occur in referenced Order | Reject reference combination; create no request |
| AF-008-15 | Customer types/tampers with an internal identifier not present in authorized selection | Revalidate server-side and deny; UI selector trust is insufficient |
| AF-008-16 | Two Staff claim the same New request | One atomic winner becomes assignee/InProgress; loser receives current result |
| AF-008-17 | Non-assignee Staff replies, changes priority, transfers, or resolves | Deny with no message/state/assignment change |
| AF-008-18 | Customer or Staff attempts to edit/delete a SupportMessage | Deny and retain immutable history |
| AF-008-19 | Customer withdraws after claim or reopens Withdrawn | Deny; current state/history remains |
| AF-008-20 | Staff resolves without final response | Deny; request remains InProgress |
| AF-008-21 | Customer reopens exactly at or after the boundary | At or before exact `ReopenDeadlineAt` succeeds once; any instant after it is rejected and requires a new ticket |
| AF-008-22 | Assigned Staff becomes Disabled | Clear assignee only, retain InProgress/status/messages/priority/history, and make item claimable |
| AF-008-23 | Transfer target is Disabled/non-Staff or reason is missing | Reject transfer; retain current active assignee |
| AF-008-24 | Message and resolve/reopen commands race on a stale version | One guarded transition wins; loser receives current conversation/status and appends no duplicate message |
| AF-008-25 | Support tries to alter Return/Exchange deadline, payment/refund, Order, Shipment, or Inventory | Deny or route actor to the owning approved interface; Support remains unchanged except an authorized conversation message |
| AF-008-26 | Required grouped domain/audit/outbox write fails | Roll back all grouped effects; external notification delivery is never inside the domain transaction |
| AF-008-27 | External notification delivery later fails or retries | Preserve committed Review/Support result; retry one idempotent event without duplicate business effect |

## 12. State Models

### 12.1 Review Customer Publication State

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None | Eligible Customer creates first durable Review | Create content version, Published intent, eligibility reference | Published |
| Published | Owner withdraws with current version | Record publication transition; retain Review/content/history | Withdrawn |
| Withdrawn | Owner republishes with current version | Record publication transition; moderation remains independent | Published |
| Published/Withdrawn | Owner edits valid content/rating | Append content version; keep publication state | Same state |
| Published/Withdrawn | Non-owner or hard-delete command | Deny | Same state |

### 12.2 Review Staff Moderation State

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| Allowed | Active Staff hides with reason/version | Record moderation transition and reason | HiddenByStaff |
| HiddenByStaff | Active Staff restores with reason/version | Record moderation transition and reason | Allowed |
| Allowed/HiddenByStaff | Customer edits/withdraws/republishes | Keep Staff moderation unchanged | Same state |
| Allowed/HiddenByStaff | Staff edits Customer rating/content | Deny | Same state |

Review public visibility is derived, not a third mutable state:

`Visible = Publication.Published AND Moderation.Allowed AND Product.Active AND Category.Active`.

### 12.3 SupportRequest State

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None | Active Customer submits valid classified request | Create ticket, immutable initial message, Normal priority, no assignee | New |
| New | Owning Customer withdraws; still unassigned | Preserve content; record withdrawal | Withdrawn |
| New | Active Staff atomically claims unassigned current version | Set assignee; record claim | InProgress |
| InProgress | Current Active assignee resolves with final response | Append message; store resolution cycle and 72-hour deadline | Resolved |
| Resolved | Owning Customer message at/before current reopen deadline | Append message; preserve prior cycle; keep Active assignee or clear inactive one | InProgress |
| Resolved | Owning Customer message after deadline | Deny and direct new ticket | Resolved |
| Withdrawn | Any message/claim/reopen/resolve | Deny | Withdrawn |
| InProgress | Assignee disabled under SL-007 | Clear assignee; record recovery evidence; do not change status | InProgress |

### 12.4 Support Assignment and Priority

| Current fact | Event and guard | Action | Resulting fact |
|---|---|---|---|
| Unassigned New/InProgress recovery | Active Staff claim wins current version | Record one assignee | Assigned to claimant |
| Assigned to Active Staff | Current assignee transfers with reason to another Active Staff | Append assignment history | Assigned to target |
| Assigned to Disabled Staff | System consumes disable event | Clear current assignee; preserve history | Unassigned |
| Normal/Low/High/Urgent | Current assignee changes priority with reason | Append priority history | Requested valid priority |
| Any assignment/priority | Unauthorized/stale/repeated command | Deny or return prior result | Same current fact |

## 13. State, Security, Data, and Privacy Invariants

1. Review identity is globally unique for one Customer and one Product, not one Customer-Order-Product.
2. Eligibility references one exact owned OrderDetail whose Order has recorded `DeliveredAt`.
3. Later catalog, return, refund, exchange, account, or Order-status changes never rewrite the eligibility OrderDetail or original Review identity.
4. Completed whole return/refund or same-SKU exchange does not create another rating contribution.
5. Rating is always an integer 1–5; review text is optional and plain text.
6. Original `CreatedAt` is immutable; edits update current version/time without moving stable public order.
7. Customer publication and Staff moderation are independent state dimensions.
8. Review is public only when the single derived visibility expression is true.
9. Public count, list, and average use exactly the same visible set.
10. Public Review output never exposes CustomerId, OrderId, OrderDetailId, email, phone, address, or internal moderation actor/reason.
11. Public name masking uses current normalized display name: for two or more tokens, show last token plus the first Unicode initial of the first token and a period (for example, `Nguyễn Ngọc Thành -> Thành N.`); for one token, show its first Unicode character plus `***`.
12. Staff may change moderation only and never Customer rating, text, or publication intent.
13. No Review or Review version/moderation history is hard-deleted through normal business functions.
14. Product/Category deactivation affects public visibility only; it does not delete Review/history or Customer ownership.
15. Every SupportRequest belongs to exactly one Customer and has one stable unique ticket code.
16. Initial Customer content is the first immutable SupportMessage and is never duplicated into a competing mutable authority.
17. Every later SupportMessage is append-only and attributable to one Customer owner or the current assigned Staff at its send time.
18. Message order uses persisted creation instant plus stable Message ID; pagination cannot omit/duplicate equal-time messages.
19. Support contains no edit/delete message operation and no single latest-response field as the history authority.
20. New starts unassigned and Normal. At most one current assignee exists.
21. Only current Active assignee owns Staff message, priority, transfer, and resolution commands.
22. Assignment and priority changes preserve append-only actor/from/to/reason/time history.
23. Account disable blocks new commands immediately but never deletes Review/Support history. Disabled-assignee recovery does not invent a request-state transition.
24. `ReopenDeadlineAt` is snapshotted as exactly 72 hours from each successful `ResolvedAt` and later settings cannot rewrite it.
25. Each resolution/reopen cycle remains historical even when current state returns to InProgress.
26. A Support reference never grants authority to mutate the referenced entity.
27. Customer never supplies a free-form internal ObjectId through the approved UI, and server ownership validation remains mandatory.
28. Customer cannot choose priority, assignment, Staff responder, or resolution state.
29. Admin is not Staff/CSKH and has no operational Review moderation or Support conversation command.
30. Warehouse has no private Review moderation or Support scope.
31. Review and Support plain text is escaped on output; HTML/script input does not become executable content.
32. UI warns Customer not to submit passwords, OTPs, full card data, or refund-destination credentials in Support. Audit/log descriptions never reproduce full user-generated content.
33. Command idempotency and expected versions protect every create/edit/transition/message/assignment operation against repeated click, retry, and race.
34. Audit/outbox evidence is committed once with the domain action; asynchronous notification/report consumers cannot create or reverse domain state.
35. Review/Support event payloads carry minimum target/reference/status/version facts and never raw passwords, OTP, address book, full refund destination, or unnecessary full message/review text.

## 14. UI and Interface Contract

### Public Product Review

- Product detail shows visible total, one-decimal average, and paged reviews in stable original-created order.
- Each card shows rating, optional content, masked name, verified-purchase label, created time, and updated indicator/time when edited.
- Public network response contains no Customer/Order/OrderDetail identifier.
- Rating-only Review remains readable without an empty-content placeholder.
- Inactive Product/Category has no public Review surface even though protected history remains.

### Customer Review

- Eligible entry points exist from owned Order detail and Product detail.
- Customer never chooses or types an Order ID. System selects/validates eligibility and shows the existing durable Review after any repeat purchase.
- Form requires rating 1–5, marks text optional, shows `0/1000`, and permits no media.
- Own management view shows publication and moderation independently, edit history summary, and clear actions for edit/withdraw/republish.
- Publishing while Staff-hidden clearly states that the Review remains hidden until Staff restoration.
- Pending buttons disable during submission; repeated click displays `đã xử lý` and does not create another rating/version.

### Customer Support

- Create form begins with request type and reveals only relevant Order/Product selectors populated from authorized data; no free-form technical ID field exists.
- Order-related types require an owned Order. When Product is also selected, only lines from that Order appear.
- Subject/content counters and plain-language validation show exact 5–120 and 10–2,000 limits.
- Priority is displayed after creation but not editable by Customer.
- List/detail shows ticket code, type, reference summary, status, priority, assignee display when present, chronological paged conversation, resolution/reopen deadline, and own available actions.
- Customer may add a message in New/InProgress, withdraw only unassigned New, and reopen Resolved only through a new message at/before the displayed deadline.
- After deadline, UI links to Create Support and does not offer a stale reopen button.
- No attachment control appears in this release; Return/Refund and Exchange evidence stays in their dedicated forms.

### Staff / CSKH Review Moderation

- Staff moderation list/detail exposes only the minimum Customer/Product/eligibility/current-state/history context needed to decide.
- Hide and restore require reason, confirmation, expected current version, and pending-state disabling.
- No Staff control edits rating, content, Customer publication intent, or creates a replacement Review.

### Staff / CSKH Support

- Queue is server-paged and filterable by status, type, priority, assignment, and date using stable ordering.
- Accept is visible only for an unassigned claimable request; concurrent loss refreshes current assignee/status.
- Only current assignee sees enabled response, priority, transfer, and resolve controls.
- Transfer selector contains Active Staff only and requires reason.
- Resolve requires a final response and displays the resulting exact 72-hour Customer reopen deadline.
- An InProgress unassigned recovery item is visibly marked `Cần nhận lại` and may be claimed without deleting former assignment/history.

### Admin and Warehouse

- No Review moderation or Support queue/detail mutation route/control appears for Admin or Warehouse.
- A public Product Review view remains available only through the same public projection as other users.

## 15. Acceptance Examples

| AT ID | Given / When / Then evidence | Classification |
|---|---|---|
| AT-150 | Given an owned OrderDetail whose Order has `DeliveredAt`, when Customer submits integer rating and optional valid text, then exactly one durable Published+Allowed Review with that eligibility evidence, version, audit, and outbox commits. | `approved-requirement` |
| AT-151 | Given Review entry from an owned Order line or Product page with several eligible purchases, when opened, then System validates the supplied line or deterministically selects the most recently delivered eligible OrderDetail and never asks Customer for an internal Order ID. | `approved-requirement` |
| AT-152 | Given the same Customer later purchases the Product again, when Review is attempted, then the existing Customer-Product Review is shown/updated and no second record or aggregate contribution exists. | `approved-requirement` |
| AT-153 | Given an eligible Review whose Order later completes Return/Refund or same-SKU Exchange, when eligibility/public data is reevaluated, then delivered evidence and Review/history remain, and no new Review identity is granted. | `approved-requirement` |
| AT-154 | Given ratings 1, 5, 0, 6, fractional/non-numeric/missing values plus blank/1,000/1,001-character normalized text, when submitted, then only integer 1–5 with 0–1,000 plain-text content succeeds and blank text creates a rating-only Review. | `approved-requirement` |
| AT-155 | Given foreign/non-delivered/missing OrderDetail, another Customer, or nonexistent Product, when Review create/update is called directly, then no Review/version/effect exists and no foreign ownership is disclosed. | `approved-requirement` |
| AT-156 | Given public review list/detail, when inspected by Guest/Customer, then only Published+Allowed Reviews for an Active Product/Category appear with deterministic masked name and verified label; CustomerId, OrderId, OrderDetailId, email, phone, and internal moderation facts are absent. | `approved-requirement` |
| AT-157 | Given owner edit/withdraw/republish and Staff hide/restore combinations, when commands run, then Customer publication and Staff moderation change independently, public visibility follows their conjunction, and neither actor mutates the other's owned fact. | `approved-requirement` |
| AT-158 | Given several content and moderation changes, when history is inspected, then every immutable version/actor/reason/time remains and no normal hard-delete or Staff content edit is possible. | `approved-requirement` |
| AT-159 | Given visible/withdrawn/Staff-hidden Reviews plus inactive Product/Category and equal creation times, when public paging/aggregate runs, then count/list/one-decimal average use exactly the visible set and stable CreatedAt+ID order without edit-based repositioning. | `approved-requirement` |
| AT-160 | Given duplicate idempotency key, concurrent first create, stale expected version, or repeated publication/moderation command, when processed, then one business effect wins and retry/loser receives explicit prior/current result without duplicate rating/version/audit/outbox. | `approved-requirement` |
| AT-161 | Given each valid request type with subject 5–120, content 10–2,000, and compatible owned/valid references, when Customer submits, then one unique-code New request with immutable initial message, no assignee, Normal priority, audit, and outbox commits. | `approved-requirement` |
| AT-162 | Given Order/Payment/ReturnRefund/Exchange request with missing/foreign Order, when submitted or endpoint called directly, then request creation is denied without revealing owner and related Order/after-sales/payment state remains unchanged. | `approved-requirement` |
| AT-163 | Given Product type with invalid/inactive Product or Product not in a supplied owned Order, when submitted, then no request exists; an authorized selector combination succeeds without accepting a raw technical ID as authority. | `approved-requirement` |
| AT-164 | Given Account/Other with no reference or with an optional valid/foreign reference, when submitted, then omission is allowed, valid supplied context is preserved, and any foreign/invalid supplied context is rejected. | `approved-requirement` |
| AT-165 | Given a SupportRequest, when initial content and subsequent messages are read, then initial content is exactly the first immutable Customer message and every Customer/Staff message retains sender role, text, timestamp, command identity, and stable chronological pagination. | `approved-requirement` |
| AT-166 | Given Customer in New/InProgress and assigned/non-assigned Staff in InProgress, when messages are sent, then only owner and current assignee append once; unauthorized, edit, delete, overwrite, duplicate, and stale commands leave history unchanged. | `approved-requirement` |
| AT-167 | Given two Active Staff claim the same unassigned New request concurrently, when both commands execute, then exactly one assignee and one `New -> InProgress` transition exist; the loser sees the winner/current version. | `approved-requirement` |
| AT-168 | Given current assignee, another Staff, Customer, Admin, and Warehouse, when response/priority/transfer/resolve commands are called, then only current Active assignee succeeds with required reason/final response and every forbidden actor changes nothing. | `approved-requirement` |
| AT-169 | Given valid/invalid priority and Active/Disabled/non-Staff transfer targets, when assigned Staff acts, then only Low/Normal/High/Urgent with reason or transfer to Active Staff with reason succeeds and complete before/after history remains. | `approved-requirement` |
| AT-170 | Given assigned Staff becomes Disabled, when SL-007 disable commits, then sessions are revoked, Support assignee is cleared once, request stays InProgress with messages/priority/history, and any Active Staff may atomically reclaim it. | `approved-requirement` |
| AT-171 | Given unassigned New, claimed New, InProgress with/without final response, Withdrawn, and Resolved, when Customer/Staff transition commands run, then only owner New->Withdrawn, Staff New->InProgress, and assignee InProgress->Resolved with final response succeed. | `approved-requirement` |
| AT-172 | Given ResolvedAt and immutable reopen deadline, when owner submits a message exactly at the deadline or one instant after, then the boundary request reopens once to InProgress preserving resolution history, while the later request is rejected and directed to a new ticket. | `approved-requirement` |
| AT-173 | Given Customer/foreign Customer/Staff/Admin/Warehouse and paged/filter requests, when protected Review/Support reads run, then each receives only the approved ownership/operational/public projection; invalid filters fail safely and audit/logs do not copy full user text or sensitive data. | `approved-requirement` |
| AT-174 | Given repeated/stale commands, injected grouped-write/delivery failures, and attempts to mutate Order/Payment/Return/Exchange/Shipment/Inventory through Support, when processed, then one complete Review/Support effect or none exists, later delivery retries safely, and every foreign domain remains governed and unchanged. | `approved-requirement` |

## 16. Preliminary G3 Traceability

| Decision | Requirements | Use case/interface | Implementation evidence | Acceptance | Confirmed gap | Status |
|---|---|---|---|---|---|---|
| BD-087 | BR-083 through BR-093 | Entire SL-008 bounded design | Review/Support models, services, routes, UI, tests | AT-150 through AT-174 | Current implementation is minimal one-way behavior and has no complete balanced lifecycle | ready |
| BD-088 | BR-083 | UC-REV-01; Review eligibility/create/update interfaces | `productReview.model.js`; `review.service.js`; Product detail/order APIs | AT-150 through AT-153, AT-155, AT-160 | Unique key is Customer+Order+Product, service checks duplicate per Order, stores OrderId rather than verifying OrderDetailId, and requires current Delivered status/Active Product | ready |
| BD-089 | BR-084 | Review form; public Review projection | `review.service.js::toResponse`; `ProductDetailPage.jsx` | AT-150, AT-154 through AT-156 | Content is required; public unauthenticated response exposes CustomerId and OrderId and has no masked name/verified label/updated time | ready |
| BD-090 | BR-085 | UC-REV-02 Customer publication and Staff moderation | ProductReview has only Visible/Hidden; no update/moderation routes/pages/history | AT-157, AT-158, AT-160 | No independent publication/moderation facts, edit, withdraw/republish, Staff moderation authority, reason, or version history exists | ready |
| BD-091 | BR-086 | Public Review list/aggregate/pagination | `review.service.js::listProductReviews`; Product detail UI | AT-156, AT-159, AT-160 | Loads all visible reviews, returns raw unrounded mean, has no stable bounded paging/version, and current status cannot express approved visibility | ready |
| BD-092 | BR-087 | UC-SUP-01; Customer create form/API | `supportRequest.model.js`; `support.service.js::createCustomerRequest`; `SupportPage.jsx` | AT-161 through AT-164 | Model fields exist but create ignores ticketCode/productId/requestType/priority; only Order is checked; UI asks Customer to type an ID; lengths/type/reference compatibility are absent | ready |
| BD-093 | BR-088 | Support detail/message interfaces | `supportRequest.response`; `support.service.js::respondToRequest`; Customer/Staff Support pages | AT-165, AT-166 | One mutable response overwrites previous response; no SupportMessage persistence, Customer detail/reply, immutable chronological history, or message pagination exists | ready |
| BD-094 | BR-089 | UC-SUP-02 withdraw/accept/resolve/reopen | SupportRequest status enum/service/UI | AT-167, AT-171, AT-172 | Legacy Open remains; only New/Open->InProgress->Resolved exists; no withdraw, 72-hour reopen, resolution cycles, version claim, or final-message atomicity exists | ready |
| BD-095 | BR-090 | Staff queue/detail claim/priority/transfer/recovery | `handledBy`; response PATCH; SL-007 future disable flow | AT-167 through AT-170 | Any Staff response sets/replaces handledBy; no atomic accept, assignee guard, priority command/history, transfer, or disabled-assignee recovery exists | ready |
| BD-096 | BR-091 | Public/Customer/Staff/Admin/Warehouse route matrix | Review/support routes and UI route access | AT-155, AT-156, AT-166, AT-168, AT-173 | Public Review leaks identifiers; Customer lacks protected own Review/Support detail; Staff privacy projection is undefined; wrong-role read/command tests are incomplete | ready |
| BD-097 | BR-092, BR-093 | Every mutation; domain event handoff; owning-slice links | Services use unguarded create/findByIdAndUpdate plus basic audit descriptions | AT-160, AT-162 through AT-174 | No command idempotency/expected version/transactional audit-outbox; Support context is not explicitly prohibited from operational effects; list/query limits are weak | ready |

## 17. Confirmed Current Conflicts

The following are `observed-behavior`, not approved policy:

1. ProductReview stores `orderId` rather than the exact eligibility-verifying `orderDetailId`.
2. Its unique index is `customerId + orderId + productId`, so one Customer can create another Review after buying the same Product in another Order.
3. Review service searches duplicates using the same per-Order key, contradicting candidate SRS and approved one-per-Customer-Product identity.
4. Review creation requires nonblank content although the detailed SRS use case explicitly makes text optional.
5. Review eligibility requires current `orderStatus=Delivered` and an Active Product, so later Returned Orders and inactive historical Products cannot follow the approved protected Review behavior.
6. Public unauthenticated Review response includes raw `customerId` and `orderId`.
7. Public Review response contains no masked display name, verified-purchase label, updated time, or privacy-specific projection.
8. Review list loads the entire visible set, has no bounded pagination, returns an unrounded raw average, and lacks stable tie-breaking.
9. ProductReview has only `Visible/Hidden` and no owner edit, withdraw/republish, Staff moderation route, reason, independent state dimensions, or version history.
10. Product detail asks Customer to choose a Delivered Order and client filtering does not remove Orders whose Product was already reviewed under the durable identity.
11. SupportRequest includes `Open` even though the candidate state model does not.
12. SupportRequest stores one mutable `response`, `respondedAt`, and `handledBy` rather than append-only SupportMessages and assignment history.
13. A second Staff response replaces the earlier response and may replace the handler; any Staff can perform it.
14. There is no explicit atomic accept/claim command or concurrency/version guard.
15. Customer can create/list but cannot open a protected detail, send follow-up, withdraw, or reopen.
16. Staff can only move New/Open to InProgress and InProgress to Resolved; no final-response atomic contract, withdrawal, reopening, or resolution-cycle history exists.
17. Model fields `ticketCode`, `productId`, `requestType`, and `priority` are not populated/validated by normal Customer creation.
18. Customer UI presents a free-form “Mã đơn hàng” input while the backend expects a database Order ID, rather than an owned selector.
19. Support list methods load all matches and accept only a weak status filter; stable pagination/type/priority/assignment/date validation is absent.
20. Audit descriptions contain only coarse action text; no idempotent outbox or expected-version evidence exists.
21. Demo seed and graph validator encode the latest-response model, so fixture integrity is internally consistent but conflicts with the approved logical SupportMessage history.
22. Selected current tests pass while explicitly expecting per-Order Review duplication boundary, mandatory Review text, one response field, legacy Open serialization, and one-way transition behavior. Passing tests prove the encoded implementation, not `SL-008` correctness.

## 18. Cross-Slice Consistency Boundaries

1. `SL-007` Active session and current role are required for protected Review/Support commands; Disabled users keep historical records but cannot act until reactivated.
2. Staff remains CSKH. Admin is not a super-Staff and Warehouse is not a support reader.
3. `SL-003/SL-004` immutable `DeliveredAt` and `SL-003` OrderDetail snapshots are Review eligibility evidence; Review never rewrites them.
4. `SL-001` completed whole Return/Refund and `SL-002` same-SKU Exchange preserve delivered experience and do not generate another Review identity.
5. Review/public aggregates are independent from `SL-006` best-seller calculations. A Review does not create a sale and a returned Order's reporting treatment does not delete the Review.
6. Product/Category publication under `SL-006` controls only public Review visibility; inactive catalog state does not delete protected Review/history.
7. Support type `ReturnRefund` or `Exchange` is only a conversation classification. The five-day request deadline, evidence, whole-order/quantity rules, Staff decision, Warehouse inspection, payout, and terminal states remain exclusively `SL-001/SL-002`.
8. Support type `Payment` cannot accept payOS result, choose refund amount/destination, mark Paid/Refunded, or reconcile a callback. Those remain `SL-001/SL-003`.
9. Support type `Order` cannot confirm, cancel, pack, ship, deliver, change address snapshot, or release/reserve stock. Those remain `SL-003/SL-004`.
10. Support type `Product` cannot change catalog, price, publication, Category, or Inventory. Those remain `SL-005/SL-006`.
11. A Customer may share conversational context but must use the dedicated owning-slice form for evidence or sensitive financial/delivery input; Staff cannot copy Support text into a Customer-owned secure field as authority.
12. Disabled-Staff reassignment consumes `SL-007` account facts without delaying disable or keeping a session open.
13. Later Notification delivery consumes idempotent domain events after commit and cannot reverse Review/Support state.
14. Later Admin audit/reporting views must minimize or aggregate user-generated content; ordinary audit descriptions do not contain full Review/Support text.

## 19. Required SRS Reconciliation

When the project begins the SRS reconciliation phase, the following changes are required; this approved local design does not itself mutate Google Docs:

1. Change `UC-CS-11` priority from `Should Have` to `Must Have` to match `FR-CRS-01` through `FR-CRS-05` and approved scope.
2. Replace “at most one active review per Customer/Product” with one durable Review identity plus independent publication/moderation facts.
3. Define delivered eligibility from immutable `DeliveredAt` and exact OrderDetail, including repeat-purchase and later Return/Exchange behavior.
4. Make Review text optional and bounded; add privacy-safe public projection and visible-only aggregate/pagination rules.
5. Add Customer edit/withdraw/republish and Staff/CSKH hide/restore use cases with ownership/prohibition/history.
6. Expand Support request types/reference compatibility, ticket code, lengths, default priority, and selector/ownership requirements.
7. Replace the Staff-only-after-submission rule in `FR-CRS-09`, `BR-RFS-07`, data dictionary, logical relationship text, and `UC-ST-08` acceptance with two-way append-only messages.
8. Add `Withdrawn` and controlled `Resolved -> InProgress` reopening to the Support state model while preserving `New -> InProgress -> Resolved` as the main path.
9. Define assignment/claim/transfer/disabled-assignee recovery and Staff-owned priority.
10. Replace Appendix A's “latest Staff response is stored in SupportRequest.response” mapping with a real SupportMessage history or an implementation that preserves equivalent logical identity/cardinality/history.
11. Add idempotency, expected-version, public privacy, wrong-role, exact-deadline, grouped-failure, and cross-slice-negative acceptance criteria.

## 20. Verification Snapshot Before Implementation

Read-only evidence gathered for this package:

- At the SL-008 approval snapshot, Google SRS full content and revision/tab metadata were read without mutation; CR-001 v2.1 later performed the bounded reconciled sync and readback.
- ProductReview/SupportRequest models, services, routes, client services/pages, demo mappings, report coupling, and related tests were inspected.
- Six selected server Review/Support tests and six selected client Review/Support tests passed against current behavior during the audit.
- Those green tests are `observed-behavior` evidence only and leave `AT-150` through `AT-174` unimplemented.
- No application code, migration, Google SRS text, red acceptance test, or runtime data was changed by this approved package.

## 21. Method Basis and Next Phase

Archived SWR Chapter 17 distinguishes validation of whether requirements satisfy stakeholder needs from verification that a development product meets its requirements. It calls for requirements to be correctly derived, complete, feasible, verifiable, necessary/sufficient, consistent across representations, and adequate for design/construction. Archived SWD Chapters 9–11 model state-dependent behavior through current state, input event, optional guard, transition action, and next state, and require alternative use-case sequences to be considered. Those sources guide structure and quality only; GreenHouse policy comes from `SRC-046` plus approved cross-slice decisions.

No code change, migration, red test, or implementation plan is authorized by this document alone. CR-001 v2.1 records the completed cross-system closure and COD collection/settlement clarification; the next step is exact G3 mapping before red acceptance tests or implementation.
