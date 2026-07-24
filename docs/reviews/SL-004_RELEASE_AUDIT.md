# SL-004 Release Audit

## Decision

- Slice: SL-004 Fulfillment and Delivery
- Primary owner: Nguyễn Hữu Anh Nhật
- Warehouse seam owner: Lê Vũ Cường
- Result: **READY FOR INDEPENDENT REVIEW**
- Evidence scope: local worktree only, uncommitted
- Production deployment or production-data migration is not claimed.

## Closed implementation and review findings

| Finding | Closure evidence |
|---|---|
| Commercial Warehouse approval was mixed with physical export | Public routes expose only the exact process command; Pending/Failed are retryable and Completed is terminal. |
| Export auto-packed the Order | Exact export leaves Order Confirmed; only an attributable exact Staff PackingRecord advances to Packed. |
| Generic Order status mutation could invent shipping/delivery | Generic Staff status routes/controllers are retired; dedicated commands own transitions. |
| Reservation/Inventory could partially drift | Exact export is transaction-bound, consumes each OrderReservation once, blocks reconciliation, and writes stable per-line movement identities. |
| Staff could choose a trusted event source or fake signed COD evidence | Staff controller forces `STAFF_EVIDENCE`; service enforces actor/source matrix and accepts Customer collection evidence only from signed Carrier. |
| Return-to-shop had no incident | It now creates/reuses one `ReturnedToShop` DeliveryIncident, so receipt to Customer choice to terminal/resend is reachable. |
| Terminal events could rewrite a Delivered Order | Return/lost/damaged require active Shipped Order/Shipment; terminal resolution requires and conditionally claims Shipped. |
| Delivery and evidence history were mutable/implicit | ShipmentEvent and destination versions are append-only; corrections/disputes reference prior events and deadlines are not shortened. |
| ONLINE Paid delivery had no CompletedSaleAt | Physical delivery atomically sets `completedSaleAt=deliveredAt` for ONLINE Paid. |
| Later COD collection used service clock | `AFTER_DELIVERY` requires explicit later collection time; settlement time is separate. |
| Customer could claim Carrier acceptance after handoff | Customer correction is rejected after handoff; Staff records separate Carrier-acceptance evidence. |
| Returned parcel had no Warehouse queue | Warehouse-only queue projects complete lines and exact receipt posts sellable/damaged movements without finance fields. |
| Duplicate terminal resolution lost the money outcome | Same-key replay returns the existing failed-delivery RefundPending and ReturnRefundRequest. |
| Shipment tracking preflight had no durable invariant | Shipment tracking reference is unique and migration rejects duplicates before index creation. |
| Mongoose stripped immutable cycle fields during legacy backfill | Migration uses the native collection update inside the transaction; disposable raw-document verification proves `cycleId` and `requestKind` persist. |
| Cross-slice best-seller seam could exclude successful ONLINE sales | SL-004 emits immutable CompletedSaleAt consumed by SL-006; no SL-006 source file changed. |
| Legacy demo seed still wrote the retired `StockExportRequested` Order state | The pending-export demo Order now remains `Confirmed`; the separate export request continues to carry its `Pending` state. |

## Actor and trust-boundary audit

- Customer: owned projection, pre-handoff correction evidence, and exact incident choice only.
- Staff: packing, external-Carrier handoff/Staff-attributable evidence, destination acceptance record, and derived terminal resolution.
- WarehouseManager: exact export and complete returned-goods classification only.
- Carrier: signature middleware only; no application role, account, sidebar, or role guard.
- Admin: no SL-004 operational command.
- Money, deadlines, stock effects, refund amount, and CompletedSaleAt are server-derived.

## Verification

| Gate | Result |
|---|---|
| Focused SL-004 server/integration | `72/72` |
| Focused SL-004 client/Warehouse | `17/17` |
| Migration contract | `6/6` |
| Independent P1 focused group | RED `22/28` to GREEN `28/28` |
| Full server | `743/743`, 127 suites |
| Full client | `190/190`, 53 suites |
| Production build | PASS via `npm run build` (`152` modules) |
| Diff whitespace | Clean; only configured LF-to-CRLF conversion notices |
| Demo seed lifecycle fixture | Pending export fixture keeps Order `Confirmed`; retired Order state is rejected by contract test |

Other preserved RED evidence: UI `0/11`, route/P1/queue `13/16`,
post-handoff Carrier spoof `11/12`, terminal replay `11/12`, and tracking index
`4/5`, each followed by focused GREEN.

The build reports only the existing Vite chunk-size warning.

## Migration audit

`npm run migrate:sl004` provides duplicate and lineage preflight, legacy state
normalization, Initial cycle attachment without fabricated operational evidence,
repeat-safe target indexes, and explicit reconciliation reporting.

Disposable replica-set verification:

- database `greenhome_sl004_verify_1784844629424`, dropped after the run;
- first run `{ orders: 1, cycles: 1, exports: 1, reconciliation: 1, indexes: 12 }`;
- raw export `Pending`, attached cycle, `requestKind=Initial`;
- Shipped without evidence reported rather than backfilled;
- second business writes `{ orders: 0, cycles: 0, exports: 0 }`, indexes `12`.

A second fresh replica-set rehearsal specifically covered the post-migration
Resend guard. The first run created one Initial cycle and backfilled one legacy
Initial export; the second run reported zero Order/cycle/export writes. The
existing Resend request retained `requestKind=Resend` and the same `cycleId`
across both runs.

No target deployment or production database execution is claimed.

## Residual deployment-only work

- Confirm backup, target database identity, transaction topology, and rollback owner.
- Execute preflight/migration/index verification and capture a zero-write second run.
- Exercise authenticated Staff, WarehouseManager, and Customer journeys in target.
- Verify signed Carrier configuration/replay window using target secrets.
- Verify DomainOutbox workers and Customer notification delivery in target.
- Decide whether to code-split the existing large client bundle warning; it is not an SL-004 correctness blocker.

These are deployment/evidence gates. They must not be represented as complete.
