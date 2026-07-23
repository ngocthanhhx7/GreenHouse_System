# SL-002 G3 Traceability — Exchange

**Gate:** G3 `passed`; post-implementation local evidence recorded 2026-07-23
**Business authority:** approved SL-002 design plus CR-001 v2.1
**Implementation branch:** `feature/sl-002-exchange`
**Baseline:** merge commit `7ba2533de2c81ebb1164ba9846443a1d814590d6`

This matrix fixes the approved implementation boundary and records the production
surfaces now present in the worktree. A green test outside the listed business
rule does not prove the rule. The separately approved reconstructed baseline
demonstration is recorded in `SL-002_G4_RECONSTRUCTED_RED.md`; it does not claim
that the missing original chronological G4 log was retained.

## API contract

### Customer

- `POST /api/exchanges/evidence`
- `GET /api/exchanges/evidence/:filename`
- `POST /api/orders/:id/exchanges`
- `GET /api/exchanges/my`
- `GET /api/exchanges/:id`
- `POST /api/exchanges/:id/handoff-proof`
- `POST /api/exchanges/:id/cancel`
- `POST /api/exchanges/:id/stock-choice`

### Staff / CSKH

- `GET /api/staff/exchanges`
- `GET /api/staff/exchanges/:id`
- `PATCH /api/staff/exchanges/:id/decision`
- `POST /api/staff/exchanges/:id/retry-reservation`
- `POST /api/staff/exchanges/:id/shipments/:shipmentId/events`
- `POST /api/staff/exchanges/:id/resend`

### Warehouse

- `GET /api/warehouse/exchanges`
- `GET /api/warehouse/exchanges/:id`
- `POST /api/warehouse/exchanges/:id/receipt`
- `POST /api/warehouse/exchanges/:id/inspection`
- `POST /api/warehouse/exchanges/:id/shipments`

### Carrier

- `POST /api/carrier/exchanges/shipments/:shipmentId/events`

Every mutating command that can be retried carries an `idempotencyKey` or stable
Carrier `eventId`. Exchange request/response models contain no amount, bank,
refund, payout, price-difference, or PayOS field.

## Exact traceability

| Requirement | Interface / behavior | Production location | Automated evidence | Acceptance |
|---|---|---|---|---|
| BR-003 | Delivered ownership and immutable inclusive five-day deadline | `order.model.js`, `order.service.js`, `exchange.service.js`, Customer Order detail | `exchange.service.test.js` deadline/ownership cases | AT-019, AT-020 |
| BR-004 | Customer reason/evidence; Staff owns eligibility reason | `exchange.service.js`, evidence upload/access, Customer and Staff pages | service/UI contract tests | AT-019, AT-022, AT-025 |
| BR-005, CR BR-111/112 | One active Order lock shared with SL-001; terminal release/close | `afterSalesOrderLock.model.js`, `afterSalesLock.service.js`, Return and Exchange services | cross-slice lock concurrency tests | AT-023, CR AT-213/214 |
| BR-006/007 | Exact owned Order lines, bounded integer quantities, same SKU only | `exchangeLine.model.js`, `exchangeUnitLineage.model.js`, `exchange.service.js`, Customer form | selection and lineage tests | AT-021, AT-036, AT-038 |
| BR-008, CR BR-109 | Atomic all-or-nothing exact-SKU reservation; explicit no-stock state | `stockReservation.model.js`, `inventory.model.js`, `exchange.service.js` | concurrent approval and rollback tests | AT-024/025, CR AT-209/210 |
| BR-009 | Three-day immutable handoff clock, pre-handoff cancel and expiry release once | `exchangeCase.model.js`, `exchange.service.js`, `exchangeExpiry.worker.js` | cancel/expiry/idempotency tests | AT-026, AT-027 |
| BR-010/011 | Complete per-line inspection; accepted sellable/damaged enters Inventory once; rejected never enters | `exchangeInspection.model.js`, `exchangeLine.model.js`, `inventoryTransaction.model.js`, `exchange.service.js` | full/partial/all-rejected/rollback tests | AT-028–030 |
| BR-012 | Outbound only after final inspection; consume accepted reservations on replacement shipment | `exchangeShipment.model.js`, `stockReservation.model.js`, `exchange.service.js` | unauthorized outbound and consume-once tests | AT-028–030 |
| BR-013, CR BR-116 | Responsibility derives payer; record only, no money settlement | `exchangeCase.model.js`, Staff/Customer Exchange pages | derivation and forbidden-field tests | AT-031, AT-038 |
| BR-014/015 | Delivered replacement gets its own five-day unit window and parent lineage | `exchangeUnitLineage.model.js`, shipment delivery reconciliation | delivery/cycle lineage tests | AT-035, AT-036 |
| BR-016/020 | Signed Carrier or evidence-backed Staff shipment facts; append-only events and role gates | `exchangeShipmentEvent.model.js`, routes, controller, service | route/auth/source/dispute tests | AT-035, AT-037, AT-039 |
| BR-017 | Lost/damaged replacement keeps same case; exact-SKU resend or wait/conversion | Exchange incident/resend commands and shipment models | incident/resend/no-stock tests | AT-032, AT-033 |
| BR-018 | No financial fields; conversion delegates to SL-001 | Exchange schemas, serializers, API/UI contract tests | forbidden-field scan and API rejection | AT-038 |
| BR-019 | Duplicate submit/command returns same result and explicit replay flag | unique keys in case/reservation/shipment/event plus service | replay/race tests | AT-022 |
| BR-021 | Completion waits for every replacement and rejected-original return delivery | shipment reconciliation in `exchange.service.js` | mixed outbound obligation tests | AT-034 |
| CR BR-106/107/121 | Timely Delivered+Unpaid COD intake is held; full Customer collection releases; under-collection never replaces | `codReconciliation.service.js`, `exchangeCase.model.js`, `exchange.service.js` | COD hold/release/recovery tests | SL-002 AF-EX-21, CR AT-205–208/223–226 |
| CR BR-110 | Atomic Exchange-to-Return handoff preserves original instant, lock, and movement lineage | `exchangeConversion.model.js`, Exchange and Return services | conversion rollback/replay tests | CR AT-211/212 |
| CR BR-117 | Shared owner-bound evidence profile and authorized reads | upload middleware/service, Exchange evidence access | spoof/count/owner/role tests | CR AT-221 |

## Data ownership

- `ExchangeCase`: lifecycle, immutable deadlines, Staff decision, operational payer,
  hold/incident/terminal outcome.
- `ExchangeLine`: immutable purchased SKU/quantity snapshot and current aggregate
  inspection outcome.
- `ExchangeUnitLineage`: one record per physical unit/cycle; owns replacement
  deadline and parent link.
- `StockReservation`: exact-SKU quantity and `Reserved/Released/Consumed` state.
- `ExchangeInspection`: attributable, immutable, versioned Warehouse result.
  Finalization creates version 1 and exposes no endpoint that can overwrite it.
- `ExchangeShipment` and `ExchangeShipmentEvent`: outbound obligation and
  append-only transport facts.
- `AfterSalesOrderLock`: shared mechanical exclusion only; no Exchange or Return
  state-machine truth.
- `ExchangeConversion`: one immutable handoff identity to the linked SL-001 case.

## G3 closure checks

- Every approved BR-003 through BR-021 maps to an API, model/service surface, and
  automated acceptance evidence.
- CR-001 COD, lock, conversion, evidence, and money boundaries are explicitly
  included.
- Actor mutation boundaries are route-level and service-level.
- No planned Exchange schema or UI owns money.
- Focused Exchange contracts pass `31/31` (`26` server and `5` client); full
  server regression passes `397/397`; full client regression passes `128/128`; the production client build
  succeeds.
- Live replica-set verification reaches `Completed`, records two Inventory
  movements, releases the shared lock, creates the replacement five-day window,
  and cleans up its database fixture.
- The migration is idempotent locally: two consecutive runs each reported zero
  additional deadline/lock backfills and verified ten index-owning models.
- The main Customer → Staff → Customer handoff → Warehouse inspection/shipment →
  Staff delivery → Customer completion browser flow passes with zero browser
  console/page errors. Its synthetic uploads and isolated temporary database are
  removed after verification.
- The Project Business Approver-approved G4 reconstruction fails `0/3` on
  baseline `7ba2533` for the intended missing contracts and passes `3/3` on the
  current implementation. Combined with the recorded focused/full/live evidence,
  G4 and G5 pass.
- G6 still requires recorded denied-route and alternate/failure actor
  walkthroughs. G7 requires reviewed commit/release evidence.
