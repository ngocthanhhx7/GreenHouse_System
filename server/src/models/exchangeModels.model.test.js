const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const AfterSalesOrderLock = require('./afterSalesOrderLock.model');
const ExchangeCase = require('./exchangeCase.model');
const ExchangeLine = require('./exchangeLine.model');
const ExchangeUnitLineage = require('./exchangeUnitLineage.model');
const StockReservation = require('./stockReservation.model');
const ExchangeInspection = require('./exchangeInspection.model');
const ExchangeShipment = require('./exchangeShipment.model');
const ExchangeShipmentEvent = require('./exchangeShipmentEvent.model');
const ExchangeConversion = require('./exchangeConversion.model');

function hasUniqueIndex(model, expectedFields, name) {
  return model.schema.indexes().some(([fields, options]) => (
    Object.entries(expectedFields).every(([key, value]) => fields[key] === value)
    && options.unique === true
    && (!name || options.name === name)
  ));
}

describe('SL-002 persistence contracts', () => {
  it('enforces one shared active after-sales owner per order', () => {
    assert.ok(hasUniqueIndex(AfterSalesOrderLock, { orderId: 1 }, 'after_sales_order_lock_unique'));
    assert.deepEqual(AfterSalesOrderLock.schema.path('caseType').enumValues, ['RETURN_REFUND', 'EXCHANGE']);
    assert.deepEqual(AfterSalesOrderLock.schema.path('status').enumValues, ['Active', 'Released', 'ClosedPermanently']);
  });

  it('stores the approved Exchange lifecycle without financial fields', () => {
    const statuses = ExchangeCase.schema.path('status').enumValues;
    [
      'AwaitingCODReconciliation', 'CODRecoveryInProgress', 'ClosedByCODRecovery',
      'Submitted', 'AwaitingExactStockChoice', 'WaitingForExactStock',
      'ApprovedAwaitingShipment', 'CustomerShipped', 'WarehouseInspecting',
      'OutboundFulfillment', 'ReplacementShipped', 'DeliveryIncident',
      'Rejected', 'Cancelled', 'Expired', 'ClosedNoExchange',
      'ConvertedToReturnRefund', 'Completed',
    ].forEach((status) => assert.ok(statuses.includes(status), status));

    [
      'refundAmount', 'amount', 'bankAccount', 'refundDestination',
      'payoutStatus', 'payos', 'priceDifference', 'shippingCharge',
    ].forEach((field) => assert.equal(ExchangeCase.schema.path(field), undefined, field));

    assert.ok(hasUniqueIndex(ExchangeCase, { customerId: 1, idempotencyKey: 1 }, 'exchange_customer_idempotency_unique'));
    assert.ok(ExchangeCase.schema.path('reservationRetryIdempotencyKey'));
    assert.ok(ExchangeCase.schema.path('waitingFor').enumValues.includes('REJECTED_ORIGINAL_RECONCILIATION'));
    assert.ok(ExchangeCase.schema.path('waitingFor').enumValues.includes('INCIDENT_RESEND_IN_TRANSIT'));
    assert.equal(ExchangeCase.schema.path('shipmentOutcomeVersion').options.default, 0);
  });

  it('keeps exact line, unit, reservation, inspection, shipment, event, and conversion identities', () => {
    assert.ok(hasUniqueIndex(ExchangeLine, { exchangeCaseId: 1, orderDetailId: 1 }, 'exchange_line_case_order_detail_unique'));
    assert.ok(hasUniqueIndex(ExchangeUnitLineage, { unitKey: 1 }, 'exchange_unit_key_unique'));
    assert.ok(ExchangeUnitLineage.schema.path('exclusivePhysicalClaimKey'));
    assert.ok(hasUniqueIndex(ExchangeUnitLineage, { exclusivePhysicalClaimKey: 1 }, 'exchange_physical_claim_unique'));
    assert.ok(hasUniqueIndex(StockReservation, { reservationKey: 1 }, 'exchange_reservation_key_unique'));
    assert.ok(hasUniqueIndex(ExchangeInspection, { inspectionKey: 1 }, 'exchange_inspection_key_unique'));
    assert.ok(hasUniqueIndex(ExchangeShipment, { shipmentKey: 1 }, 'exchange_shipment_key_unique'));
    assert.ok(hasUniqueIndex(ExchangeShipment, { obligationKey: 1 }, 'exchange_shipment_obligation_unique'));
    assert.ok(hasUniqueIndex(ExchangeShipmentEvent, { eventKey: 1 }, 'exchange_shipment_event_key_unique'));
    assert.ok(hasUniqueIndex(ExchangeConversion, { exchangeCaseId: 1 }, 'exchange_conversion_once'));
  });
});
