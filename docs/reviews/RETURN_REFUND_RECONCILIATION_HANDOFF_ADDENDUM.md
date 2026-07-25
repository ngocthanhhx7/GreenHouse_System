# Return/Refund Reconciliation — Handoff Addendum (2026-07-26)

## Operator handoff

Manual payout is available without a PayOS webhook. It is not a bypass for an unresolved
PayOS operation. For Processing/Unknown, inspect the authoritative operation, reconcile
that exact operation as Succeeded/Failed/Unknown with required proof, and create a new
manual payout only after verified Failed. Do not retry with a new operation key and do not
switch methods silently.

## Migration handoff

Run preflight/dry-run first, review only safe bounded IDs/statuses, apply once, apply a
second time to confirm no business mutation, then verify. Stop on invalid correlations,
duplicate successful evidence, or index mismatch. The migration never repairs customer
bank data or creates/reforges payout proof; route ambiguous historical records to the
normal Staff reconciliation flow.

## Open release dependencies

Task 4 provider/reconciliation service and Task 5 Staff UI must be integrated before the
combined server/client/build release gate. No live PayOS transaction is authorized by this
handoff.
