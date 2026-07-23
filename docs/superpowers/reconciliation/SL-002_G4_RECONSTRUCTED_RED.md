# SL-002 G4 Reconstructed RED Evidence

**Date:** 2026-07-23
**Baseline:** `7ba2533de2c81ebb1164ba9846443a1d814590d6`
**Implementation worktree:** `feature/sl-002-exchange`
**Approval:** Project Business Approver approved a reconstructed baseline
demonstration in this Codex task.

## Evidence classification

The original chronological expected-red output was not retained. This record is
therefore an approved **reconstructed baseline demonstration**, not a claim that
the historical TDD run was preserved. It demonstrates that representative
approved SL-002 acceptance contracts fail on the pre-implementation baseline and
pass on the current implementation with the same probe.

An initial probe-harness setup attempt called the exported app factory as an
already-created application. That setup failure was diagnosed and excluded from
gate evidence. The valid run used `createApp({ rateLimit: false })`.

## Representative acceptance probes

| Probe | Requirement / acceptance | Baseline expectation |
|---|---|---|
| Customer Exchange intake API exists | AT-019 / BR-003 | `POST /api/orders/:id/exchanges` must not resolve as an absent route |
| Order detail separates Exchange from Return/Refund | AT-019 / BR-004 | Customer UI must expose distinct **Đổi hàng** and **Trả hàng/Hoàn tiền** choices |
| Shared active after-sales lock exists | AT-023 / BR-005 | Exchange and Return/Refund must share an Order-level lock |

## Valid reconstructed RED run

The probe ran in a detached worktree at the baseline commit:

```powershell
$env:NODE_PATH='D:\GreenHouse_System-main\.worktrees\sl-002-exchange\server\node_modules'
Remove-Item Env:SL002_TARGET_ROOT -ErrorAction SilentlyContinue
node --test reconstructed_sl002_g4.test.js
```

Result: `tests 3`, `pass 0`, `fail 3`, `cancelled 0`.

- AT-019 API: baseline returned `404` because the Exchange intake route did not
  exist.
- AT-019 UI: baseline exposed only the combined Return/Refund form, not separate
  Exchange and Return choices.
- AT-023 lock: baseline had no shared
  `server/src/models/afterSalesOrderLock.model.js`.

These are observed baseline behaviors and match the intended reasons for RED.

## Same-probe GREEN confirmation

The identical probe then targeted the current implementation:

```powershell
$env:NODE_PATH='D:\GreenHouse_System-main\.worktrees\sl-002-exchange\server\node_modules'
$env:SL002_TARGET_ROOT='D:\GreenHouse_System-main\.worktrees\sl-002-exchange'
node --test reconstructed_sl002_g4.test.js
```

Result: `tests 3`, `pass 3`, `fail 0`, `cancelled 0`.

Together with the focused contracts, full regressions, production build, live
Mongo verification, migration idempotency, and main actor walkthrough recorded
in `SL-002_HANDOFF.md`, this satisfies G4 as an approved reconstruction and G5 as
the verified local implementation gate. G6 and G7 remain separate gates and are
not implied by this evidence.
