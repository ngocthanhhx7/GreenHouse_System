# Return/Refund Reconciliation — G3 Traceability Addendum (2026-07-26)

| Requirement | Code boundary | Verification evidence |
| --- | --- | --- |
| Customer never enters BIN or banking credentials | Reviewed bank-code contract and Customer DTO boundary | Catalog/service/UI tests in Tasks 1–2 (combined gate pending) |
| Manual refund can operate without webhook | Staff payout method/reconciliation contract | Task 4–5 targeted tests (combined gate pending) |
| No second payout while PayOS is unresolved | `RefundPending` authoritative operation claim and immutable evidence | Task 3–4 race/reconciliation tests (combined gate pending) |
| Migration makes no financial business mutation | `server/src/scripts/migrateRefundPayoutReconciliation.js` | Migration unit tests: dry-run/apply/second-apply/verify |
| Migration diagnostics protect privacy | bounded projections in `buildPreflightDiagnostics` | Migration unit test asserts account/holder/BIN/reason absent |

This addendum records only the migration boundary that has been locally verified. It does
not claim Task 4/5 integration, full regression, production payout, or deployment.
