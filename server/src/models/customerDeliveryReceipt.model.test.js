const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const CustomerDeliveryReceipt = require('./customerDeliveryReceipt.model');

describe('customer delivery receipt model', () => {
  it('records append-only customer receipt decisions with immutable delivery facts', () => {
    [
      'orderId',
      'customerId',
      'shipmentId',
      'deliveryEventId',
      'outcome',
      'respondedAt',
      'idempotencyKey',
      'requestHash',
      'exchangeDeadlineAt',
      'returnDeadlineAt',
    ].forEach((field) => {
      const path = CustomerDeliveryReceipt.schema.path(field);
      assert.ok(path, `CustomerDeliveryReceipt.${field} should exist`);
      assert.equal(path.options.immutable, true, `CustomerDeliveryReceipt.${field} should be immutable`);
    });

    ['orderId', 'customerId', 'shipmentId', 'deliveryEventId', 'outcome', 'respondedAt', 'idempotencyKey', 'requestHash'].forEach((field) => {
      assert.equal(CustomerDeliveryReceipt.schema.path(field).isRequired, true, `CustomerDeliveryReceipt.${field} should be required`);
    });

    assert.deepEqual(CustomerDeliveryReceipt.schema.path('outcome').enumValues, ['RECEIVED', 'NOT_RECEIVED']);
    assert.equal(CustomerDeliveryReceipt.schema.path('reason').options.required, undefined);
    assert.equal(CustomerDeliveryReceipt.schema.path('reason').options.maxlength, 500);
    assert.equal(CustomerDeliveryReceipt.schema.path('supersedesId').options.required, undefined);
  });

  it('enforces customer command identity, one terminal receipt, and searchable history', () => {
    const indexes = CustomerDeliveryReceipt.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => (
      fields.customerId === 1 && fields.idempotencyKey === 1 && options.unique === true
    )), 'customer idempotency key should be unique');
    assert.ok(indexes.some(([fields, options]) => (
      fields.orderId === 1 && fields.outcome === 1 && options.unique === true
      && options.partialFilterExpression?.outcome === 'RECEIVED'
    )), 'only one terminal RECEIVED receipt should exist per order');
    assert.ok(indexes.some(([fields]) => fields.orderId === 1 && fields.createdAt === -1), 'order receipt history should be indexed by creation time');
    assert.ok(indexes.some(([fields, options]) => (
      fields.outcome === 1 && fields.createdAt === 1
      && options.partialFilterExpression?.outcome === 'NOT_RECEIVED'
    )), 'unresolved NOT_RECEIVED disputes should be indexed as an operational queue');
  });
});
