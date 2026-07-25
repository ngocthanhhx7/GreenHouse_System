const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { describe, it } = require('node:test');

function loadModel(fileName) {
  const modelPath = join(__dirname, fileName);
  assert.ok(existsSync(modelPath), `${fileName} is required by SL-004`);
  return require(modelPath);
}

function enumValues(model, path) {
  return model.schema.path(path)?.enumValues || [];
}

function hasUniqueIndex(model, expectedName) {
  return model.schema.indexes().some(([, options]) => options?.unique && options?.name === expectedName);
}

describe('SL-004 persistence contracts', () => {
  it('stores one linked Initial/Resend fulfillment cycle per order sequence', () => {
    const model = loadModel('fulfillmentCycle.model.js');
    assert.deepEqual(enumValues(model, 'cycleType'), ['Initial', 'Resend']);
    assert.ok(hasUniqueIndex(model, 'fulfillment_cycle_key_unique'));
    assert.ok(hasUniqueIndex(model, 'fulfillment_cycle_order_number_unique'));
  });

  it('stores attributable Packing records with exact immutable checklist lines', () => {
    const model = loadModel('packingRecord.model.js');
    assert.deepEqual(enumValues(model, 'status'), ['Completed', 'Discrepancy']);
    assert.ok(model.schema.path('items'));
    assert.ok(hasUniqueIndex(model, 'packing_record_command_key_unique'));
    assert.ok(hasUniqueIndex(model, 'packing_record_one_completed_cycle'));
  });

  it('stores one evidence-backed external-Carrier Shipment per cycle', () => {
    const model = loadModel('shipment.model.js');
    assert.deepEqual(enumValues(model, 'status'), [
      'HandedOff', 'AttemptFailed', 'Delivered', 'ReturnedToShop', 'Lost', 'Damaged',
    ]);
    assert.equal(model.schema.path('carrierName').options.required, true);
    assert.equal(model.schema.path('note').options.maxlength, 1000);
    assert.ok(hasUniqueIndex(model, 'shipment_command_key_unique'));
    assert.ok(hasUniqueIndex(model, 'shipment_one_per_cycle'));
    assert.ok(hasUniqueIndex(model, 'shipment_tracking_reference_unique'));
  });

  it('stores append-only Shipment events, destination versions and delivery incidents', () => {
    const eventModel = loadModel('shipmentEvent.model.js');
    const destinationModel = loadModel('shipmentDestinationVersion.model.js');
    const incidentModel = loadModel('deliveryIncident.model.js');
    assert.ok(enumValues(eventModel, 'eventType').includes('ATTEMPT_FAILED'));
    assert.ok(enumValues(eventModel, 'eventType').includes('CORRECTION'));
    assert.ok(eventModel.schema.path('evidenceReferences'));
    assert.ok(hasUniqueIndex(eventModel, 'shipment_event_key_unique'));
    assert.ok(hasUniqueIndex(destinationModel, 'shipment_destination_version_unique'));
    assert.deepEqual(enumValues(incidentModel, 'incidentType'), ['ReturnedToShop', 'Lost', 'Damaged']);
    assert.ok(enumValues(incidentModel, 'status').includes('AwaitingWarehouseReceipt'));
    assert.ok(hasUniqueIndex(incidentModel, 'delivery_incident_source_event_unique'));
    assert.ok(hasUniqueIndex(incidentModel, 'delivery_incident_wait_command_unique'));
  });

  it('stores complete classified Warehouse receipt and a separate COD discrepancy lifecycle', () => {
    const receiptModel = loadModel('returnedParcelReceipt.model.js');
    const discrepancyModel = loadModel('codDiscrepancy.model.js');
    assert.ok(receiptModel.schema.path('items'));
    assert.ok(hasUniqueIndex(receiptModel, 'returned_parcel_one_receipt_per_shipment'));
    assert.deepEqual(enumValues(discrepancyModel, 'status'), [
      'Open', 'ResolvedCollectedAtDelivery', 'ResolvedCollectedLater',
      'RecoveryRequired', 'RecoveryRefundPending', 'ResolvedUncollected',
      'ResolvedPartialRefunded',
    ]);
    assert.ok(hasUniqueIndex(discrepancyModel, 'cod_discrepancy_one_per_order'));
  });
});
