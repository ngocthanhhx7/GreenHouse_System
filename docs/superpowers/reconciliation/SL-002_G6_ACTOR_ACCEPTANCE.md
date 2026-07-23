# SL-002 G6 Actor Acceptance

**Slice:** SL-002 Same-SKU Exchange
**Candidate:** `874da318cbd250a3e5f02335686fff09bad9aa4d`
**Evidence date:** 2026-07-23
**Outcome:** `passed`

## Actor boundary acceptance

| Actor/source | Accepted behavior | Denied or alternate behavior | Evidence |
|---|---|---|---|
| Customer | Submit owned Delivered lines, upload/read owned evidence, provide handoff proof, cancel before handoff, choose wait or Return conversion | Foreign Order/case/evidence, invalid quantity, expired deadline, financial fields, losing active after-sales case | Customer route ownership tests, service eligibility/deadline tests, typed conflict tests |
| Staff / CSKH | Decide eligibility, retry initial reservation, record evidence-backed shipment facts, resend a failed replacement | Warehouse receipt/inspection, Customer handoff/cancel, Carrier source spoofing | Staff route tests, decision/retry/resend service tests, attributable event tests |
| WarehouseManager | Record receipt, complete every inspection line, create initial outbound obligations | Staff decision/resend, Customer commands, outbound during `INCIDENT_RESEND` wait states | Warehouse route tests, full/partial inspection tests, outbound status/waiting matrix tests |
| Carrier webhook | Submit a signed, timestamp-bounded, append-only shipment event and receive a minimal ACK | Missing/stale/cross-path signature, event fact mutation, case/private payload disclosure | Signature middleware, event replay and Carrier ACK tests |
| System worker | Expire immutable handoff deadlines and release reservation/lock exactly once | Early expiry, repeated side effects, terminal-case mutation | Expiry, CAS, lock and idempotency tests |

## Alternate and failure paths

- Duplicate Customer request and retried commands return the same winner with an
  explicit replay result; a reused key with different facts is rejected.
- Concurrent Return/Exchange intake produces one active Order-level winner. The
  losing owner receives a safe navigation target; a foreign caller receives no
  case data.
- Partial Warehouse acceptance creates only attributable sellable/damaged
  movements. Rejected units never enter Inventory.
- Initial exact-stock failure offers wait/retry or Return conversion. Incident
  resend is a Staff command; Warehouse cannot create a second initial outbound
  obligation.
- Lost/damaged replacement shipments remain in the same Exchange case. A resend
  chain must be delivered before completion.
- Audit/notification/evidence failures roll back with the enclosing command
  where required; replay repairs the effect once without duplicate completion.
- Positive COD recovery cannot close until the linked Refund is settled.

## Verification record

- Focused server SL-002 suite: `83/83` passed.
- Focused client SL-002 suite: `40/40` passed.
- Full server regression: `484/484` passed.
- Full client regression: `163/163` passed.
- Production client build: passed; only the existing chunk-size warning remains.
- Server and client dependency audits: zero vulnerabilities.
- `git diff --check`: passed.

The focused route tests exercise real role middleware contracts; service tests
exercise actor ownership and state invariants; client source-contract tests
verify that only the permitted actor action is rendered. The prior main
Customer -> Staff -> Customer -> Warehouse -> Carrier/Staff -> Customer browser
walkthrough remains valid and is supplemented here by the denied and alternate
API paths that were missing from the original handoff.
