const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const ReturnRefundRequest = require('./returnRefundRequest.model');

describe('return/refund request model', () => {
  it('prevents more than one active request per order across the canonical lifecycle', () => {
    const openRequestIndex = ReturnRefundRequest.schema.indexes().find(([fields, options]) => (
      fields.orderId === 1
      && options.unique === true
      && ['New', 'Approved', 'Received', 'AwaitingCODReconciliation'].every(
        (status) => options.partialFilterExpression?.status?.$in?.includes(status)
      )
    ));

    assert.ok(openRequestIndex);
  });

  it('exposes explicit approval, receipt, expiry, and completion states', () => {
    const statuses = ReturnRefundRequest.schema.path('status').enumValues;
    ['New', 'Approved', 'Rejected', 'Expired', 'Received', 'Completed'].forEach((status) => {
      assert.ok(statuses.includes(status));
    });
  });

  it('stores immutable-decision timestamps and attributable workflow references', () => {
    [
      'approvedAt', 'shipByAt', 'handoffProofReference', 'handoffAt', 'handoffRecordedBy',
      'receivedAt', 'verifiedDestinationId', 'refundPendingId', 'completionEvidenceId',
    ].forEach((field) => assert.ok(ReturnRefundRequest.schema.path(field), `${field} should exist`));
  });

  it('keeps generated non-empty request codes unique', () => {
    const requestCodeIndex = ReturnRefundRequest.schema.indexes().find(([fields, options]) => (
      fields.requestCode === 1 && options.unique === true && options.partialFilterExpression?.requestCode?.$gt === ''
    ));
    assert.ok(requestCodeIndex);
  });
});
