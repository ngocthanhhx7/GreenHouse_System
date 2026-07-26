# Return/Refund Reconciliation Boundary

## Owner boundaries

| Action | Allowed role | Reason |
| --- | --- | --- |
| Approve or reject a customer request | `Staff` | Staff validates policy, evidence, and eligible refund amount. Approval only moves the request to `AwaitingInspection`. |
| Inspect returned items | `WarehouseManager` | Warehouse records received, sellable, and damaged quantities. This action does not change inventory; it creates the hand-off for the warehouse inventory owner. |
| Complete a refund | `Staff` | Staff is the least-privileged existing operations role that owns payment reconciliation. Completion is accepted only from `ReadyForRefund`, after inspection. |

## State flow

## Addendum 2026-07-26 — Refund destination safety and payout recovery

Customer bank-destination collection is deliberately not a banking-login flow. The
Customer selects a reviewed bank code and supplies only account number, account-holder
name, confirmation, and an idempotency key. The server resolves the canonical name/BIN;
the Customer UI, public bank endpoint, queues, audit records, notifications, and ordinary
projections must not reveal BIN or request PIN, OTP, password, passcode, or CVV.

Staff may use either PayOS or a manual transfer. Manual transfer is a supported local
and operational path; it does not need a PayOS webhook. The refund amount remains
server-derived. If an obligation is Processing or Unknown, no new payout may be made.
The recovery sequence is exact: inspect the authoritative payout operation; reconcile
that exact operation as `Succeeded`, `Failed`, or `Unknown` with the required
reference/time/note/acknowledgement; and create a new manual payout only after a verified
`Failed` reconciliation. `Succeeded` completes from existing-operation evidence;
`Unknown` retains the lock. Reconciliation never sends a new payout.

A `Succeeded` payout is terminal. Reporting a later Customer or Shop/provider incident
appends incident/audit evidence only; it does not reopen the completed request, rewrite
the refunded obligation, or authorize a corrective second transfer. Any separate recovery
obligation requires a future approved business rule and is outside this release.

### Migration/runbook

Use the explicit command modes below against the target database only after reviewing
the safe, bounded diagnostics. `dry-run` is the default and makes no business or index
writes. The migration never creates payout evidence, changes a payout outcome, or
rewrites historical bank destinations.

```powershell
cd server
npm run migrate:refund-payout-reconciliation:preflight
npm run migrate:refund-payout-reconciliation
npm run migrate:refund-payout-reconciliation:apply
npm run migrate:refund-payout-reconciliation:verify
```

`apply` fails closed for invalid payout state/method/operation correlations, duplicate
successful payout evidence, or a mismatched named index. Historical noncanonical bank
snapshots and unresolved obligations are reported with bounded safe identifiers/statuses
only; account data, holder, BIN, and reason are not emitted. Apply a second time to prove
there are no business writes, then finish with `verify`.

A reconciled `Failed` record may retain its payout method and operation key for audit
lineage. The invalid-correlation filter runs before the 50-row diagnostic limit, so a bad
record cannot be hidden behind earlier valid rows.

`Pending` -> `AwaitingInspection` -> `ReadyForRefund` -> `Completed`

`Pending` -> `Rejected`

There is no route from approval directly to `Completed`, and no route mutates inventory during return inspection. Inventory transactions and restocking remain with the warehouse/inventory slice owned by Lê Vũ Cường.
