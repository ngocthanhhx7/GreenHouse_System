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
    assert.equal(CustomerDeliveryReceipt.schema.path('reason').options.immutable, true);
    assert.equal(CustomerDeliveryReceipt.schema.path('supersedesId').options.immutable, true);
  });

  it('enforces one initial decision, terminal receipt identity, and searchable NOT_RECEIVED history', () => {
    const indexes = CustomerDeliveryReceipt.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => (
      fields.customerId === 1 && fields.idempotencyKey === 1 && options.unique === true
    )), 'customer idempotency key should be unique');
    assert.ok(indexes.some(([fields, options]) => (
      fields.orderId === 1 && fields.outcome === 1 && options.unique === true
      && options.partialFilterExpression?.outcome === 'RECEIVED'
    )), 'only one terminal RECEIVED receipt should exist per order');
    assert.ok(indexes.some(([fields, options]) => (
      fields.orderId === 1 && options.unique === true
      && options.partialFilterExpression?.supersedesId === null
    )), 'only one initial decision should exist per order');
    assert.ok(indexes.some(([fields]) => fields.orderId === 1 && fields.createdAt === -1), 'order receipt history should be indexed by creation time');
    assert.ok(indexes.some(([fields, options]) => (
      fields.outcome === 1 && fields.createdAt === 1
      && options.partialFilterExpression?.outcome === 'NOT_RECEIVED'
      && options.name === 'customer_receipt_not_received_history'
    )), 'NOT_RECEIVED receipt history should be indexed without claiming unresolved queue semantics');
  });

  it('rejects every post-create mutation path', async () => {
    const persisted = CustomerDeliveryReceipt.hydrate({
      _id: '507f1f77bcf86cd799439012',
      orderId: '507f1f77bcf86cd799439013',
      customerId: '507f1f77bcf86cd799439014',
      shipmentId: '507f1f77bcf86cd799439015',
      deliveryEventId: '507f1f77bcf86cd799439016',
      outcome: 'NOT_RECEIVED',
      respondedAt: new Date(),
      idempotencyKey: 'receipt-command-001',
      requestHash: 'a'.repeat(64),
    });
    await assert.rejects(() => persisted.save(), /append-only/i);

    const queryMutationAttempts = {
      updateOne: () => CustomerDeliveryReceipt.updateOne({}, { $set: { reason: 'changed' } }),
      updateMany: () => CustomerDeliveryReceipt.updateMany({}, { $set: { reason: 'changed' } }),
      findOneAndUpdate: () => CustomerDeliveryReceipt.findOneAndUpdate({}, { $set: { reason: 'changed' } }),
      replaceOne: () => CustomerDeliveryReceipt.replaceOne({}, { outcome: 'RECEIVED' }),
      findOneAndReplace: () => CustomerDeliveryReceipt.findOneAndReplace({}, { outcome: 'RECEIVED' }),
      deleteOne: () => CustomerDeliveryReceipt.deleteOne({}),
      deleteMany: () => CustomerDeliveryReceipt.deleteMany({}),
      findOneAndDelete: () => CustomerDeliveryReceipt.findOneAndDelete({}),
    };
    for (const [operation, attempt] of Object.entries(queryMutationAttempts)) {
      await assert.rejects(attempt, /append-only/i, `${operation} should reject post-create mutations`);
    }
    await assert.rejects(() => CustomerDeliveryReceipt.bulkWrite([
      { updateOne: { filter: {}, update: { $set: { reason: 'changed' } } } },
    ]), /append-only/i);
  });
});
