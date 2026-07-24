const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, it } = require('node:test');

const { createInventoryService } = require('./inventory.service');

const SRC = join(__dirname, '..');

function source(relativePath) {
  const absolutePath = join(SRC, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
}

function loadFulfillmentFactory() {
  const servicePath = join(__dirname, 'fulfillment.service.js');
  if (!existsSync(servicePath)) return null;
  return require(servicePath).createFulfillmentService;
}

function allFulfillmentSource() {
  return [
    source('services/fulfillment.service.js'),
    source('services/fulfillmentCommand.service.js'),
    source('services/deliveryResolution.service.js'),
  ].join('\n');
}

function allInventorySource() {
  return [
    source('services/inventory.service.js'),
    source('services/inventoryExport.service.js'),
  ].join('\n');
}

describe('SL-004 fulfillment and delivery acceptance', () => {
  it('AT-059 processes the complete export through the exact Warehouse command without auto-packing', () => {
    const service = createInventoryService({
      repository: {},
      transactionManager: { async withTransaction() {} },
    });
    assert.equal(
      typeof service.processStockExport,
      'function',
      'AT-059 RED: Warehouse still has the legacy approve/export status API instead of one exact process command',
    );
    assert.doesNotMatch(
      source('services/inventory.service.js'),
      /markOrderPacked|orderStatus:\s*'Packed'/,
      'AT-059 RED: successful export still establishes Packed instead of leaving Order Confirmed',
    );
  });

  it('AT-060 returns one Completed export result for duplicate/concurrent commands without a second movement', () => {
    const inventorySource = allInventorySource();
    assert.match(
      inventorySource,
      /processStockExport/,
      'AT-060 RED: exact export command does not exist',
    );
    assert.match(
      inventorySource,
      /idempotentReplay/,
      'AT-060 RED: completed/concurrent export cannot return an explicit existing result',
    );
    assert.match(
      inventorySource,
      /movementKey[\s\S]*StockExportRequest|StockExportRequest[\s\S]*movementKey/,
      'AT-060 RED: export OUT transactions do not have a stable per-line movement identity',
    );
  });

  it('AT-061 fails the whole export without partial Inventory or request completion', () => {
    const inventorySource = allInventorySource();
    assert.match(
      inventorySource,
      /failExport|status:\s*'Failed'/,
      'AT-061 RED: export cannot persist an attributable Failed outcome after rollback',
    );
    assert.match(
      inventorySource,
      /ReconciliationRequired/,
      'AT-061 RED: export must consume the SL-005 reconciliation guard',
    );
    assert.doesNotMatch(
      source('models/stockExportRequest.model.js'),
      /'Approved'|'Exported'|'Rejected'/,
      'AT-061 RED: legacy Warehouse approval/export states still remain authoritative',
    );
  });

  it('AT-062 requires an attributable exact Staff PackingRecord and no export/Packed Customer event', () => {
    assert.ok(
      existsSync(join(SRC, 'models', 'packingRecord.model.js')),
      'AT-062 RED: PackingRecord persistence does not exist',
    );
    assert.equal(
      typeof loadFulfillmentFactory()?.({}).confirmPacking,
      'function',
      'AT-062 RED: Staff exact packing command does not exist',
    );
  });

  it('AT-063 requires complete external-Carrier handoff evidence before Shipped', () => {
    assert.ok(
      existsSync(join(SRC, 'models', 'shipment.model.js')),
      'AT-063 RED: original-order Shipment persistence does not exist',
    );
    assert.equal(
      typeof loadFulfillmentFactory()?.({}).recordHandoff,
      'function',
      'AT-063 RED: evidence-backed Carrier handoff command does not exist',
    );
  });

  it('AT-064 stores append-only delivery/correction/dispute evidence and deadline snapshots', () => {
    assert.ok(
      existsSync(join(SRC, 'models', 'shipmentEvent.model.js')),
      'AT-064 RED: append-only original-order ShipmentEvent persistence does not exist',
    );
    assert.equal(
      typeof loadFulfillmentFactory()?.({}).recordShipmentEvent,
      'function',
      'AT-064 RED: delivery evidence command does not exist',
    );
  });

  it('AT-066 represents physical COD delivery without full collection as one explicit discrepancy', () => {
    assert.ok(
      existsSync(join(SRC, 'models', 'codDiscrepancy.model.js')),
      'AT-066 RED: COD discrepancy is still only a mutable Order projection, not its own lifecycle fact',
    );
    assert.equal(
      typeof loadFulfillmentFactory()?.({}).recordShipmentEvent,
      'function',
      'AT-066 RED: physical delivery is not joined to COD discrepancy creation',
    );
  });

  it('AT-065 commits verified physical COD delivery and full Customer collection together', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      fulfillmentSource,
      /customerCollectedAmount/,
      'AT-065 RED: delivery does not consume attributable Customer-collection evidence',
    );
    assert.match(
      fulfillmentSource,
      /completedSaleAt/,
      'AT-065 RED: normal COD delivery does not establish the evidence-based sale clock',
    );
    assert.doesNotMatch(
      fulfillmentSource,
      /input\.(amount|codExpectedAmount)|refundAmount\s*=\s*input/,
      'AT-065: actors must not choose a COD or Refund amount',
    );
  });

  it('AT-067 keeps unsuccessful attempts append-only while Order stays Shipped', () => {
    assert.match(
      source('models/shipmentEvent.model.js'),
      /ATTEMPT_FAILED/,
      'AT-067 RED: ShipmentEvent has no failed-attempt fact',
    );
    assert.match(
      source('models/domainOutbox.model.js') + allFulfillmentSource(),
      /DELIVERY_ATTEMPT_FAILED/,
      'AT-067 RED: no durable failed-attempt notification handoff exists',
    );
  });

  it('AT-068 separates Carrier return custody from complete Warehouse receipt/accounting', () => {
    assert.ok(
      existsSync(join(SRC, 'models', 'returnedParcelReceipt.model.js')),
      'AT-068 RED: returned-parcel Warehouse receipt/classification does not exist',
    );
    assert.equal(
      typeof loadFulfillmentFactory()?.({}).recordReturnedReceipt,
      'function',
      'AT-068 RED: complete returned-parcel accounting command does not exist',
    );
  });

  it('AT-069 terminal returned-to-shop resolution preserves Paid and creates only the derived obligation', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      source('models/order.model.js'),
      /DeliveryFailed/,
      'AT-069 RED: Order cannot represent terminal original-delivery failure',
    );
    assert.match(
      fulfillmentSource,
      /FAILED_DELIVERY/,
      'AT-069 RED: failed delivery has no distinct idempotent Refund obligation',
    );
    assert.match(
      fulfillmentSource,
      /paymentStatus:\s*'Cancelled'/,
      'AT-069 RED: uncollected COD has no explicit no-Refund cancellation result',
    );
  });

  it('AT-070 creates an exact linked resend cycle on the same Order', () => {
    assert.ok(
      existsSync(join(SRC, 'models', 'fulfillmentCycle.model.js')),
      'AT-070 RED: linked original/resend fulfillment-cycle persistence does not exist',
    );
    assert.equal(
      typeof loadFulfillmentFactory()?.({}).chooseIncidentResolution,
      'function',
      'AT-070 RED: Customer same-Order resend/wait/terminal choice command does not exist',
    );
  });

  it('AT-071 permits irrecoverable loss/damage terminal resolution without fabricating Warehouse receipt', () => {
    assert.ok(
      existsSync(join(SRC, 'models', 'deliveryIncident.model.js')),
      'AT-071 RED: verified pre-delivery loss/damage incident persistence does not exist',
    );
    assert.match(
      allFulfillmentSource(),
      /irrecoverable|Irrecoverable/,
      'AT-071 RED: terminal resolution cannot distinguish impossible receipt from missing receipt',
    );
    assert.match(
      allFulfillmentSource(),
      /DeliveryFailed/,
      'AT-071 RED: incident terminal outcome is not implemented',
    );
  });

  it('AT-072 appends immutable destination versions without overwriting checkout address', () => {
    assert.ok(
      existsSync(join(SRC, 'models', 'shipmentDestinationVersion.model.js')),
      'AT-072 RED: immutable Shipment destination version persistence does not exist',
    );
    assert.equal(
      typeof loadFulfillmentFactory()?.({}).addDestinationVersion,
      'function',
      'AT-072 RED: evidence-gated destination version command does not exist',
    );
  });

  it('AT-073 exposes only Customer, Staff, Warehouse and signed Carrier boundaries without a Carrier role', () => {
    const routeSource = source('routes/fulfillment.routes.js');
    assert.match(
      routeSource,
      /authorizeRoles\('Staff'\)/,
      'AT-073 RED: Staff fulfillment boundary is missing',
    );
    assert.match(
      routeSource,
      /authorizeRoles\('WarehouseManager'\)/,
      'AT-073 RED: Warehouse fulfillment boundary is missing',
    );
    assert.match(
      routeSource,
      /carrierSignature/,
      'AT-073 RED: signed external Carrier boundary is missing',
    );
    assert.doesNotMatch(
      routeSource,
      /authorizeRoles\([^)]*['"]Carrier['"]/,
      'AT-073: Carrier must not become a GreenHouse login role',
    );
  });

  it('AT-074 uses stable command/event/movement/outbox identities and returns existing outcomes', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      fulfillmentSource,
      /idempotentReplay/,
      'AT-074 RED: fulfillment commands cannot return an explicit existing outcome',
    );
    assert.match(
      fulfillmentSource,
      /DomainOutbox|createOutbox/,
      'AT-074 RED: fulfillment milestones are not durably handed off after commit',
    );
    assert.match(
      source('models/inventoryTransaction.model.js'),
      /movementKey/,
      'AT-074 RED: Inventory movement identity is missing',
    );
  });
});
