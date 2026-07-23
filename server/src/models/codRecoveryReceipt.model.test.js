const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const CodRecoveryReceipt = require('./codRecoveryReceipt.model');

describe('COD recovery receipt model', () => {
  it('records one Warehouse-owned complete physical receipt per order', () => {
    ['orderId', 'receiptId', 'recordedBy', 'items', 'evidenceReference', 'receivedAt', 'status'].forEach((field) => {
      assert.ok(CodRecoveryReceipt.schema.path(field));
    });
    const orderIndex = CodRecoveryReceipt.schema.indexes().find(([fields, options]) => fields.orderId === 1 && options.unique === true);
    const receiptIndex = CodRecoveryReceipt.schema.indexes().find(([fields, options]) => fields.receiptId === 1 && options.unique === true);
    assert.ok(orderIndex);
    assert.ok(receiptIndex);
  });
});
