const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const ReturnRefundRequest = require('./returnRefundRequest.model');

describe('return/refund request model', () => {
  it('prevents more than one open request per order', () => {
    const openRequestIndex = ReturnRefundRequest.schema.indexes().find(([fields, options]) => (
      fields.orderId === 1
      && options.unique === true
      && options.partialFilterExpression?.status?.$in?.includes('Pending')
      && options.partialFilterExpression?.status?.$in?.includes('Approved')
    ));

    assert.ok(openRequestIndex);
  });
});
