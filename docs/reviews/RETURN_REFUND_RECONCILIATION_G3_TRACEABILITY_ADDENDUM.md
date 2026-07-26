# Return/Refund Reconciliation — G3 Traceability Addendum (2026-07-26)

| Requirement | Code boundary | Verification evidence |
| --- | --- | --- |
| Customer never enters BIN or banking credentials | Reviewed bank-code contract and Customer DTO boundary | Full server/client gates plus destination service/UI contracts |
| Manual refund can operate without webhook | Strict `transferReference/transferredAt/note/confirmed` Staff contract | Staff controller/service/UI tests; full client `378/378` |
| No second payout while PayOS is unresolved or terminal | Exact `RefundPending` CAS, one-success index, terminal guard | Service races and real-Mongo CAS/unique-index integration |
| Reconciliation notification is privacy-safe | Direct Staff InApp event; `requestCode` is the only display value | Notification contract/policy/DomainOutbox consumer tests |
| Migration makes no financial business mutation | `server/src/scripts/migrateRefundPayoutReconciliation.js` | 8 migration tests: dry-run/apply/second-apply/verify and disposable Mongo |
| Migration diagnostics protect privacy and cannot hide a late invalid row | invalid `$match` before bounded `$limit` | Disposable Mongo test with 51 valid rows before one invalid row |

Combined local evidence after integrating current main is server `1236/1236`, client
`378/378`, focused PayOS/migration/real-Mongo persistence `13/13`, and production build
PASS. It does not claim a production payout, webhook, migration, or deployment.
