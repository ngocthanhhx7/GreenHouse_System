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

  it('classifies execution and operation-reconciliation evidence immutably', () => {
    const evidenceKind = RefundPayoutEvidence.schema.path('evidenceKind');
    assert.deepEqual(evidenceKind.enumValues, ['PAYOUT_EXECUTION', 'OPERATION_RECONCILIATION']);
    assert.equal(evidenceKind.options.immutable, true);
    assert.equal(evidenceKind.options.default, 'PAYOUT_EXECUTION');
    assert.equal(RefundPayoutEvidence.schema.path('reconcilesOperationKey').options.immutable, true);
  });

  it('allows at most one successful evidence record per refund obligation', () => {
    const successIndex = RefundPayoutEvidence.schema.indexes().find(([fields, options]) => (
      fields.refundPendingId === 1
      && options.unique === true
      && options.partialFilterExpression?.status === 'Succeeded'
    ));
    assert.ok(successIndex);
    assert.equal(successIndex[1].name, 'refund_payout_one_success_per_obligation');
  });
});
