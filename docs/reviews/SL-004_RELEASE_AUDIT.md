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
| Protected fulfillment mutations committed before Audit could fail, and shipment events had no attributable Audit | Packing, handoff, shipment events, returned receipt, destination versions, incident choices, and terminal resolution now write privacy-safe AuditLog records in the owning transaction; an Audit failure rolls back every domain/outbox write. |
| Exact stock export could commit Completed stock/movement state before its Audit write failed | `INVENTORY_EXPORT_COMPLETED` is now in the same success transaction; an Audit failure rolls back exact stock/movements/Completed and leaves the request retryably Failed. |
| Same-key commands could lose an insert race with `E11000` instead of receiving their existing outcome | Packing, handoff, shipment event, returned receipt, and destination version commands refetch the exact winner and return an idempotent replay. |
| Correction/dispute could reference an event from another Shipment | Replacement evidence must now belong to the same Shipment and Order. |

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
| Focused SL-004 server/integration | `73/73`, including Audit rollback, duplicate-key replay, and same-Shipment correction/dispute guards |
| Focused SL-004 client/Warehouse | `17/17` |
| Migration contract | `6/6` |
| Independent P1 focused group | RED `22/28` to GREEN `28/28` |
| Full server | `747/747`, 127 suites |
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

## Supplemental audit 2026-07-25 - Staff demo COD evidence

| Finding | Closure evidence |
|---|---|
| Demo could not complete a delivery/COD walkthrough without a live Carrier callback | Non-production Staff may submit a protected delivery outcome plus signed operational images through the existing Staff shipment-event command. |
| A manual demo could invent a COD amount | All amount-bearing Staff fields are rejected; successful collection is exactly `codExpectedAmount`, and the UI exposes no amount control. |
| A Staff-delivered COD order could become Paid without attributable evidence | Manual reconciliation requires 1-5 verified operational URLs and creates append-only `CodEvidence` with source `STAFF_RECONCILIATION`. |
| A zero-value Staff COLLECTION could block later valid Carrier collection evidence | Explicit `NOT_COLLECTED` stores images on ShipmentEvent only, keeps actual collected `null`, creates no CodEvidence/customerCollectionEvidenceId, leaves Unpaid, and opens one discrepancy. |
| Demo escape hatch could leak into production | Runtime guard rejects every Staff COD delivery in production, including omission of `codCollectionResult`; Carrier signature remains required, and the UI consumes a server-projected capability instead of client build mode. |
| A failed delivery could accidentally settle COD | Reconciliation is rejected unless the shipment event is `DELIVERED`; rejection is transaction-safe and leaves Order Shipped/Unpaid. |
| Signed URLs could be canonicalized away or disclosed to Customers | Canonical `claim.url` is used only for dedupe and `claim.size` for the 20 MiB batch; persisted signed URLs are included only in Staff projection for authenticated preview. |
| Repeated failed attempts could replay the previous UI event key or disclose a foreign key winner | The UI retains the key through uncertain failures/reload, then deletes it only after a confirmed projection reload; server replay binds the key to the same shipment/type/source/actor. |
| A failed delivery could be recorded without an actionable reason | Operational Staff failed-attempt/return evidence requires one allowlisted reason and returns field-specific errors rendered by the Vietnamese form. |
| A maximum-length valid event key could overflow `CodEvidence.eventId` after prefixing | Staff collection evidence derives its bounded identity from the durable ShipmentEvent ID; a 160-character event key and replay are covered by behavior tests. |

Supplemental verification result: focused server `41/41`, focused client
`16/16`, full server `1066/1066`, full client `262/262`, production build PASS
with 158 transformed modules. `git diff --check` is recorded separately in the
handoff review. The known client chunk-size warning is unchanged.

## Addendum 2026-07-26 - Customer receipt completion boundary

### Release decision for this addendum

- Owner: Nguyen Huu Anh Nhat.
- Scope: Customer receipt confirmation, Customer order projection, direct
  after-sales receipt gates, and index-only rollout support.
- Rule: physical `Delivered` is not Customer `Completed`; only Customer
  `Received` starts the exact five-day after-sales snapshots.
- No live payment, target database, or production deployment is claimed.

### Factual local evidence recorded so far

| Gate | Result |
|---|---|
| Receipt model/schema | 11 passing assertions |
| Transactional service variants | 46 and 32 passing assertions |
| API/projection | 90 passing assertions |
| Direct Review/Exchange/Return receipt gates | 161 passing assertions |
| Receipt migration | RED 0/6, then GREEN 6/6 |
| Current combined server receipt-targeted command | 270/270 |
| Client receipt UI | Pending isolated client gate; no count estimated |
| Combined server/client regression and production build | Pending final integration; no result implied |

### Migration audit

`migrateCustomerDeliveryReceipt.js` has explicit dry-run, apply, and verify
modes. It reads receipt/shipment technical state, fails closed for duplicate
receipt identities, unsafe guard types, or index-definition drift, and creates
only the five exact `CustomerDeliveryReceipt` indexes. It does not backfill or
rewrite legacy `Delivered` Orders, does not create `Received` rows, and reports
only safe counts. A second apply performs zero business writes by contract.

The target deployment remains responsible for database identity/backup,
dry-run/apply/verify execution, a recorded second zero-write apply, and
authenticated Customer and Staff walkthroughs. The existing Vite bundle warning
is not restated as evidence until the current branch's production build is run.

## Main integration gate 2026-07-25

Thành merged the reviewed Nhật COD branch with `--no-ff`, preserved the newer
Vietnamese Staff-order copy, and then integrated the Warehouse evidence branch.
The final combined tree passed server `1075/1075` across 172 suites, client
`281/281` across 69 suites, and the 162-module production build. The only build
notice is the existing non-blocking 714.34 kB Vite chunk warning. No production
carrier, migration, or deployment claim is made.
