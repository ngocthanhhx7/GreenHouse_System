# SL-004 Fulfillment and Delivery Handoff

## Status

- Slice: SL-004 Fulfillment and Delivery
- Primary implementation owner: Nguyễn Hữu Anh Nhật
- Warehouse seam owner: Lê Vũ Cường
- Working branch: `feature/sl-004-fulfillment-delivery`
- State: local implementation and verification complete; ready for independent review
- Production deployment, provider verification, and production-data migration are not claimed.

## Delivered behavior

- Staff confirmation atomically creates one Initial fulfillment cycle and one Pending exact export request. The separate Staff export request and generic status mutation routes are retired.
- Warehouse runs one exact, idempotent export command. It consumes complete reservation lineage, posts one stable movement per line, rejects `ReconciliationRequired`, and leaves Order `Confirmed`.
- Staff records an exact PackingRecord before Carrier handoff. Handoff requires carrier, tracking, time, evidence, and immutable destination facts.
- Shipment history is append-only for handoff, attempts, reschedule, delivery, return-to-shop, loss, damage, correction, and dispute.
- Staff event routes bind source to `STAFF_EVIDENCE`; only the signed Carrier route binds `CARRIER`. Staff cannot submit Carrier collection evidence.
- Return-to-shop creates one exact DeliveryIncident. Warehouse receipt, Customer choice, and Staff terminal resolution are therefore one reachable evidence chain.
- Terminal return/lost/damaged events require an active Shipped Order/Shipment. Terminal resolution also conditionally claims only Shipped.
- ONLINE Paid delivery sets `completedSaleAt` from physical `deliveredAt`. COD at-delivery collection uses delivery time; later collection requires and uses its own evidence time. Carrier settlement time never establishes the completed sale.
- Warehouse has a returned-parcel queue and records one complete physical classification into sellable/damaged Inventory movements, with no finance controls.
- Customer can read only an owned fulfillment projection and choose same-Order resend, wait, or terminal resolution. Paid failed delivery preserves the primary Paid fact and creates one independent `FAILED_DELIVERY` obligation.
- Customer destination evidence is accepted before handoff. After handoff, only Staff may record separate Carrier-acceptance evidence; Customer input cannot attest for Carrier.
- Customer-visible side effects use stable DomainOutbox identities. Export and packing do not emit forbidden Customer notifications.

## Primary implementation areas

- Models: `fulfillmentCycle`, `packingRecord`, `shipment`, `shipmentEvent`, `shipmentDestinationVersion`, `deliveryIncident`, `returnedParcelReceipt`, and `codDiscrepancy`.
- Services: `inventoryExport.service.js`, `fulfillmentCommand.service.js`, `deliveryResolution.service.js`, and `fulfillment.service.js`.
- Routes/controllers: exact Staff, Warehouse, Customer, and signature-only Carrier boundaries in `fulfillment.routes.js`.
- UI: Staff order detail, Warehouse export queue/detail, Warehouse returned-parcel queue, and Customer order fulfillment projection.
- Migration: `server/src/scripts/migrateSl004FulfillmentDelivery.js`; command `npm run migrate:sl004`.
- Detailed requirement map: `docs/reviews/SL-004_G3_TRACEABILITY.md`.

## RED to GREEN evidence

- Original SL-004 UI contract was observed RED at `0/11`; it is now `11/11`.
- Warehouse queue, ONLINE CompletedSaleAt, and Warehouse route additions were observed RED together at `13/16`, then GREEN.
- Customer spoofing of post-handoff Carrier acceptance was observed RED at `11/12`, then GREEN.
- Terminal failed-delivery replay returned no existing refund outcome and was observed RED at `11/12`, then GREEN.
- Shipment tracking uniqueness was observed RED at `4/5`, then GREEN.
- Independent P1 review group was observed RED at `22/28`: Staff source/COD spoofing, missing return incident, unsafe post-Delivered terminal events, and immutable migration backfill. The same group is now `28/28`.

## Current local verification

```text
focused server SL-004/integration: 72/72
focused client SL-004/Warehouse: 17/17
migration contract: 6/6 (included in full server)
full server: 747/747, 127 suites
full client: 190/190, 53 suites
client production build: PASS via npm run build (152 modules)
git diff --check: clean apart from configured CRLF conversion notices
```

The existing bundle-size warning remains.

## Migration rehearsal

A fresh disposable local replica-set database
`greenhome_sl004_verify_1784844629424` was created for the immutable-field
regression and dropped after verification.

- First run: Orders normalized `1`, cycles created `1`, exports backfilled `1`,
  reconciliation report `1`, indexes verified `12`.
- Raw legacy export after migration: `Pending`, `cycleId` attached to the
  created Initial cycle, `requestKind=Initial`.
- A Shipped Order without packing/shipment evidence was reported, not fabricated.
- Second run: Orders `0`, cycles `0`, exports `0`; the unresolved evidence
  report correctly remained `1`; indexes verified `12`.
- A separate post-migration Resend rehearsal created/backfilled only the legacy
  Initial export on run one. Run two produced zero business writes and retained
  the Resend request's original `requestKind` and `cycleId`.

No target or production database was mutated.

## Remaining rollout boundary

1. Back up and resolve the exact target database.
2. Run duplicate/reservation preflight before business writes.
3. Run `npm run migrate:sl004`.
4. Record index creation and a second-run zero-write report.
5. Perform authenticated Staff/Warehouse/Customer and signed-Carrier walkthroughs.
6. Verify target DomainOutbox worker/notification configuration.

## Addendum 2026-07-25 - Demo/non-production Staff COD reconciliation

- Staff Order Detail now uses the protected operational evidence uploader for
  delivery outcomes, with Vietnamese labels and a hard maximum of five images.
- For COD delivery in non-production, Staff chooses only `Đã thu đủ COD` or
  `Chưa thu được COD`. No editable money field is rendered or accepted.
- A successful choice derives the exact `codExpectedAmount`, appends
  `CodEvidence(source=STAFF_RECONCILIATION)`, and establishes Paid /
  `completedSaleAt` from the evidence occurrence time.
- A not-collected choice keeps actual collection `null`, stores its images only
  on ShipmentEvent, creates no zero-value COLLECTION evidence, and produces
  `Delivered + Unpaid + Open discrepancy` without blocking later Carrier facts.
- Signed evidence URLs are retained for authenticated Staff preview after a
  reload; the Customer projection still exposes only the evidence-presence bit.
- Failed-attempt/returned outcomes submitted with operational images require an
  allowlisted reason. Image/time/COD/reason failures render beside the exact
  Vietnamese field.
- A shipment-event key survives validation, transport, and reload ambiguity.
  It is rotated only after a confirmed result is reloaded, so a later delivery
  attempt can append a new event without weakening uncertain-response replay.
  Server replay also binds that key to the same shipment, event type, source,
  and actor instead of returning a foreign command result.
- Non-delivered outcomes cannot carry COD reconciliation. Production rejects
  the Staff reconciliation field and continues to require signed Carrier facts;
  the UI is controlled by the server-projected `manualCodReconciliation`
  capability rather than a client build-mode assumption.

Verification run on 2026-07-25:

```text
focused server SL-004/model/routes: 39/39
focused client SL-004/COD: 16/16
full server: 1064/1064, 171 suites
full client: 262/262, 65 suites
client production build: PASS, 158 modules
```

The existing Vite large-chunk warning remains. No target database, deployment,
or production Carrier walkthrough is claimed.

## Review checklist

- [x] BR-035 through BR-046 and CR-001 seams map to code/tests.
- [x] AT-059 through AT-074 map to focused acceptance evidence.
- [x] Exact actor routes and no Carrier login role are enforced.
- [x] Full local server/client regression is green.
- [x] Installed Vite production build is green.
- [x] Migration command, unit contract, and disposable double-run are recorded.
- [ ] Independent reviewer signs off on the uncommitted diff.
- [ ] Deployment owner executes and records target-environment migration and actor walkthroughs.
