# SL-002 Handoff — Same-SKU Exchange

**Branch:** `feature/sl-002-exchange`
**Baseline:** `7ba2533de2c81ebb1164ba9846443a1d814590d6`
**Local evidence date:** 2026-07-23
**Highest formally passed gate:** G5

## Outcome

The worktree implements a separate same-SKU Exchange lifecycle behind the shared
Order-level after-sales lock:

- Customer submits eligible purchased units with reason and owner-bound evidence.
- Staff owns eligibility, responsibility, payer derivation, exact-stock approval,
  wait/retry, delivery fallback, and resend decisions.
- Warehouse owns receipt, complete per-line inspection, accepted
  sellable/damaged classification, and outbound shipment creation.
- Carrier or evidence-backed Staff events own attributable transport facts.
- System owns immutable deadlines, idempotency, grouped Inventory effects,
  replacement-unit lineage, completion guards, and Exchange-to-Return handoff.
- Exchange owns no refund amount, destination, bank, PayOS, payout, price
  difference, or arbitrary replacement SKU.

## Observed local evidence

| Evidence | Result |
|---|---|
| Focused server Exchange contracts | `26/26` passed |
| Focused client Exchange contracts | `5/5` passed |
| Full server regression | `397/397` passed |
| Full client regression | `128/128` passed |
| Production client build | passed; Vite reports only the existing large-chunk warning |
| Live Mongo verification | `Completed`; two Inventory movements; lock `Released`; replacement window created; fixture cleanup completed |
| Migration idempotency | two consecutive runs: `deadlinesBackfilled=0`, `locksBackfilled=0`, `indexesVerified=10` |
| Main actor browser walkthrough | Customer → Staff → Customer handoff → Warehouse receipt/inspection/shipment → Staff delivery → Customer `Completed`; final clean tab reported zero browser console/page errors |
| Browser fixture safety | local database, explicit `SL002_BROWSER_FIXTURE_CONFIRM`, and non-production guards pass `2/2` |
| Login regression found during walkthrough | Login navigation now waits for committed AuthContext state; browser walkthrough passed afterward |
| Reconstructed G4 baseline demonstration | same probe: baseline `0/3` with the intended missing-contract failures; current implementation `3/3`; see `SL-002_G4_RECONSTRUCTED_RED.md` |

An isolated replica set at `127.0.0.1:27018` was created for transaction
verification and removed afterward. The normal Mongo service at `27017` was not
changed.

## Formal gate status

| Slice ID | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Blocker | Owner | Next evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SL-002 | passed | passed | passed | passed | passed | passed | blocked | not-started | Expanded denied/alternate actor walkthrough and reviewed release evidence remain pending | Engineering owner `unassigned`; Project Business Approver | Record G6 actor acceptance, then obtain review and reconcile release evidence for G7 |

G4 is satisfied by the Project Business Approver-approved reconstructed baseline
demonstration in `SL-002_G4_RECONSTRUCTED_RED.md`. It is explicitly classified as
reconstructed evidence and does not claim that the original chronological TDD
log was retained.

## Remaining acceptance evidence

1. Record browser/API actor acceptance for forbidden routes, duplicate submit,
   partial inspection, no-stock wait/retry, delivery incident/resend, and
   Exchange-to-Return conversion. Automated service/route tests cover these
   contracts, but the expanded G6 actor walkthrough is not yet recorded.
2. Review the scoped diff against
   `SL-002_G3_TRACEABILITY.md`; do not infer correctness only from green totals.
3. Verify production `CARRIER_WEBHOOK_SECRET`, HTTPS malware-scanner endpoint/API
   key, evidence retention, and worker supervision before release.
4. Commit only the intended SL-002 manifest, push the branch, obtain review, and
   reconcile released behavior for G7.

## Worktree cautions

- Do not commit `server/uploads/return-evidence/` or
  `client/scripts/__pycache__/`; both contain local artifacts.
- The two evidence uploads created by the browser walkthrough were removed.
- `docs/superpowers/` is ignored by the repository policy. Add only the exact
  reconciliation/plan paths intentionally when preparing the handoff commit.
- Do not mix the separate dirty root checkout
  `feature/sl-002-exchange-design` into this branch.

## Next slice boundary

Do not start an overlapping implementation of SL-003 in this worktree. Once
SL-002 is reviewed and its shared Order/Inventory/after-sales contracts are
frozen, create a new worktree from the reviewed baseline for the next slice.
