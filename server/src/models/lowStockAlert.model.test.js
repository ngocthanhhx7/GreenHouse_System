const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const LowStockAlert = require('./lowStockAlert.model');

describe('low-stock alert model', () => {
  it('allows only one open alert per product', () => {
    const index = LowStockAlert.schema.indexes().find(([key]) => key.productId === 1 && key.status === undefined);
    assert.ok(index);
    assert.equal(index[1].unique, true);
    assert.deepEqual(index[1].partialFilterExpression, { status: 'Open' });
  });
});
