const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const ReturnRefundRequest = require('./returnRefundRequest.model');

describe('return/refund request model', () => {
  it('prevents more than one open request per order', () => {
    const openRequestIndex = ReturnRefundRequest.schema.indexes().find(([fields, options]) => (
      fields.orderId === 1
      && options.unique === true
      && options.partialFilterExpression?.status?.$in?.includes('Pending')
      && options.partialFilterExpression?.status?.$in?.includes('AwaitingInspection')
      && options.partialFilterExpression?.status?.$in?.includes('ReadyForRefund')
    ));

    assert.ok(openRequestIndex);
  });

  it('exposes the reconciliation lifecycle without a direct approved-to-refunded shortcut', () => {
    const statuses = ReturnRefundRequest.schema.path('status').enumValues;

    ['Pending', 'AwaitingInspection', 'Rejected', 'ReadyForRefund', 'Completed'].forEach((status) => {
      assert.ok(statuses.includes(status));
    });
    assert.equal(statuses.includes('Approved'), false);
  });

  it('keeps generated non-empty request codes unique', () => {
    const requestCodeIndex = ReturnRefundRequest.schema.indexes().find(([fields, options]) => (
      fields.requestCode === 1 && options.unique === true && options.partialFilterExpression?.requestCode?.$gt === ''
    ));

    assert.ok(requestCodeIndex);
  });
});
