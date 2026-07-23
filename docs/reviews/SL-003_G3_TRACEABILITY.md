# SL-003 G3 Traceability

Date: 2026-07-24

Status: `READY_FOR_REVIEW`

| Requirement | Implementation | Acceptance evidence | Residual deployment check |
|---|---|---|---|
| AT-040/041 checkout atomicity and exact reservation | `order.service.placeOrder`, `OrderReservation` | Checkout rollback/replay tests; reservation model tests; disposable `rs0` migration verification | Staging cross-order load race |
| AT-042 checkout replay | Existing command lookup precedes mutable saved-address resolution | Saved-address deletion replay test | Inspect pre-remediation legacy hashes |
| AT-043/044 deadline | Immutable `paymentDeadlineAt` and validation | Order model/deadline tests | Staging clock/provider skew |
| AT-045/048 attempt failure and retry | Callback terminalizes `PaymentAttempt`; Order remains Pending | Payment callback failure/retry and expiry tests | payOS sandbox walkthrough |
| AT-046/047 provider evidence | Signature, amount, provider identity and event replay checks | Payment route/service tests | Live provider evidence |
| AT-049/050 cancellation | Primary Paid evidence remains immutable; cancellation creates obligation handoff | Customer and Staff cancellation tests | Actor browser walkthrough |
| AT-051/052 export race | Conditional export claim; Processing blocks cancellation; export consumes exact lineage | Staff order and inventory service tests | Carrier/warehouse staging acknowledgement |
| AT-053/054/055 refund lifecycle | Obligation-scoped `RefundPending` and standalone `ReturnRefundRequest` | Model, callback and payout workflow tests | Provider payout walkthrough |
| AT-056 command replay | Stable UI command UUID and pending lock | Staff UI contract and service idempotency tests | Browser double-click check |
| AT-057 durable side effects | Transactional `DomainOutbox`, atomic lease/claim, stale-work reclaim and failure-isolated worker | Rollback, losing-worker, stale lease, retry and worker-isolation tests; disposable `rs0` concurrency check | Notification provider delivery |
| AT-058 confirm replay | Atomic confirm/export request and fail-closed exact lineage | Staff order, inventory and reservation tests | Staging concurrency check |
| CR AT-215 independent obligations | Attempt-scoped obligation keys | Duplicate/excess callback tests | Destination/payout staging flow |
| CR AT-216 aggregate settlement | Query all required obligations before settlement | Multi-obligation refund finalization tests | Malformed legacy rows fail preflight |
| CR AT-217 callback/refund replay | Unique callback, attempt, outbox and obligation identities | Callback retry/crash/reclaim tests | Provider outage rehearsal |

## Verification baseline

- Server: **566/566**, 93 suites, 0 failed.
- Client: **171/171**, 49 suites, 0 failed.
- Production client build: passed.
- Disposable MongoDB replica-set migration: first run repaired deadline,
  lineage, expired reservation and payment projections; second run performed
  zero business writes.
- Disposable MongoDB outbox concurrency: one winner across two service
  instances and successful stale-lease reclaim.

The release audit at `5ef56cf` is retained in
`docs/reviews/SL-003_RELEASE_AUDIT.md`; its B1–B9 findings are closed by this
branch and its RED→GREEN evidence.
