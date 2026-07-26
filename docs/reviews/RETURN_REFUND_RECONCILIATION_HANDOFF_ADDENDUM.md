# Return/Refund Reconciliation — Handoff Addendum (2026-07-26)

## Operator handoff

Manual payout is available without a PayOS webhook. It is not a bypass for an unresolved
PayOS operation. For Processing/Unknown, inspect the authoritative operation, reconcile
that exact operation as Succeeded/Failed/Unknown with required proof, and create a new
manual payout only after verified Failed. Do not retry with a new operation key and do not
switch methods silently.

Succeeded/Completed is terminal and read-only. An incident can preserve an investigation
trail, but operators must not reopen the request or perform a corrective second payout.
Escalate any proposed separate recovery obligation for a future business approval.

## Migration handoff

Run preflight/dry-run first, review only safe bounded IDs/statuses, apply once, apply a
second time to confirm no business mutation, then verify. Stop on invalid correlations,
duplicate successful evidence, or index mismatch. The migration never repairs customer
bank data or creates/reforges payout proof; route ambiguous historical records to the
normal Staff reconciliation flow.

## Release evidence

Current-main integrated local results: server `1236/1236`, client `378/378`, focused
PayOS/migration/real-Mongo persistence `13/13`, and production build PASS (172 modules).
The build retains the known >500 kB chunk warning. No live PayOS transaction, webhook, or
production migration is authorized or claimed by this handoff.
