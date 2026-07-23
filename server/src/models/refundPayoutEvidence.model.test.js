const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const RefundPayoutEvidence = require('./refundPayoutEvidence.model');

describe('refund payout evidence model', () => {
  it('stores non-terminal and successful reconciliation outcomes', () => {
    const statuses = RefundPayoutEvidence.schema.path('status').enumValues;
    ['Processing', 'Failed', 'Unknown', 'Succeeded'].forEach((status) => assert.ok(statuses.includes(status)));
  });

  it('prevents duplicate payout identities', () => {
    const index = RefundPayoutEvidence.schema.indexes().find(([fields, options]) => fields.idempotencyKey === 1 && options.unique);
    assert.ok(index);
  });
});
