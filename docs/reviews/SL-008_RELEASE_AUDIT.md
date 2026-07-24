# SL-008 Release Audit

## Decision

- Slice: SL-008 — Product Review and Customer Support
- Implementation owner: Le Vu Cuong `<levucuong0319@gmail.com>`
- Reviewer: Nguyen Ngoc Thanh `<thanhnnhe186491@fpt.edu.vn>`
- Result: **READY FOR FINAL REMEDIATION RE-REVIEW**
- Production deployment, production migration and target browser walkthrough
  are not claimed.

## Closed findings

| Finding | Closure evidence |
|---|---|
| Review identity was Customer+Order+Product | Canonical unique Customer+Product identity with retained eligible OrderDetail evidence |
| Review state mixed publication and moderation | Independent state dimensions and append-only histories |
| Public Review leaked customer/order identifiers | Exact masked verified DTO and one catalog visibility predicate |
| Review paging/aggregate were unstable | Bounded server paging with createdAt/ID ordering and matching count/mean predicate |
| Review commands lacked replay/version safety | Actor/aggregate/operation/key command identity, fingerprint, version and transaction |
| Support stored mutable content/response | Canonical SupportRequest has no conversation text; immutable SupportMessage is the sole text authority |
| Support command results exposed raw aggregate data | Public ticket DTO is stored and replayed; customer identity/text/contact data are excluded |
| Support accepted loose raw references | Seven-type matrix validates owned Orders, Active Products and matching OrderDetails |
| Any Staff could respond or transition | First claim plus current Active assignee matrix for messages, priority, transfer and resolution |
| No disabled-assignee recovery | Durable clear-once handoff retains ticket state/priority/history and permits recovery claim |
| Disable recovery existed only in acceptance fixtures | Production active-assignment service invokes Support recovery in the SL-007 transaction and propagates the same Mongo session |
| Stale-version Support conflict could disclose a foreign aggregate | Authorization now precedes version comparison and only an allowlisted ticket DTO can accompany an authorized conflict |
| Support transfer read a non-production role shape | Dedicated Active Staff lookup joins the persisted Role authority |
| Concurrent same-key Support commands could return a loser error | In-flight coalescing plus durable post-race replay returns one identical result |
| Account disable could leave other active tickets assigned | One transaction clears every active ticket for the disabled Staff, retains terminal history, and emits one scoped effect per ticket |
| Raw transport keys could collide in DomainOutbox | Event identity is derived from full command fingerprint, event, and ticket scope; raw keys remain non-authoritative metadata |
| Support list/message paging loaded whole collections | Stable Mongo `$facet` pages return bounded items and count from one snapshot query |
| Support migration could leave an inserted message after request failure | Business backfill runs in a required Mongo transaction; injected failure proves exact rollback and clean rerun |
| Generic status edits could skip workflow | Exact withdraw, resolve and 72-hour reopen commands replace generic mutation |
| Audit/outbox could contain message content | Minimum identifier/version payloads; acceptance rejects Review/Support text leakage |
| UI accepted raw IDs and repeated clicks | Authorized selectors, role/status controls, pending locks and retained retry keys |
| Legacy migration could invent history | Fail-fast ambiguity preflight; deterministic immutable message backfill only when provable |

## Actor and invariant audit

- Guest has only public visible Review reads.
- Active Customer owns Review content/publication and own Support lifecycle.
- Active Staff owns Review moderation and currently assigned Support operations.
- Admin and WarehouseManager are denied all SL-008 routes and controls.
- Review content/publication/moderation histories and Support messages/
  assignment/priority/resolution histories are append-only.
- Support never invokes foreign-domain mutation gateways.
- Aggregate, history/message, durable command, AuditLog and DomainOutbox effects
  commit or roll back together.
- Idempotent replay returns the exact prior safe result without another event,
  history entry, message or aggregate version.

## Cross-slice consistency

- SL-001/SL-002 return/refund/exchange facts remain read-only Review evidence.
- SL-003 Order/Payment and SL-004 delivery facts are read for eligibility or
  Support references and are never rewritten.
- SL-005 Inventory is not a Support/Review authority and remains untouched.
- SL-006 Product/Category Active state gates public Review/catalog selectors.
- SL-007 role/status/session authority gates all protected operations and its
  disabled-assignee adapter is consumed without impersonation.
- SL-009 Notification consumption belongs to Nguyen Quang Huy and must consume
  the existing minimum DomainOutbox payload.

## Verification

- Focused SL-008 server: `129/129`, 21 suites.
- Full server: `909/909`, 151 suites.
- Full client: `248/248`, 61 suites.
- Production build: pass; existing bundle-size warning only.
- `git diff --check`: no whitespace error; Windows line-ending notices only.
- Review migration tests: `12/12`.
- Combined migration tests: `4/4`.
- Support migration tests: `16/16`.

## Remaining deployment boundaries

- Back up the intended database and run migration dry-run before apply.
- Run a second production migration and retain its zero-write evidence.
- Record authenticated Customer and Staff browser walkthroughs in the target
  environment, including direct-navigation denial for Admin/Warehouse.
- Verify SL-009 consumes outbox events without exposing Review/Support text.
- Never commit `.env`, secrets, local database files, `docs/superpowers/`, or
  `docs/ui-prompts/`.

## Final review

Independent final remediation review found no Critical, Important, or Minor
findings and returned a ready-to-merge verdict. Its last regression checks
covered full-scope outbox identity, repeated disable/reassign/disable,
runtime-reopen System attribution, retained resolver/assignee proof, privacy,
transactions and durable replay.

Nguyen Ngoc Thanh must review the complete feature diff against the latest
`main`. Merge is authorized only when no P0/P1 finding remains and all current
regressions stay green; use `merge --no-ff` as required by the team workflow.
