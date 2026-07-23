const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const RefundPayoutIncident = require('./refundPayoutIncident.model');

describe('refund payout incident model', () => {
  it('keeps responsibility server-classified and incident identity unique', () => {
    const indexes = RefundPayoutIncident.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => fields.incidentKey === 1 && options.unique));
    assert.ok(indexes.some(([fields, options]) => fields.payoutEvidenceId === 1 && fields.cause === 1 && options.unique));
    assert.deepEqual(RefundPayoutIncident.schema.path('responsibility').enumValues, ['Customer', 'ShopOrProvider']);
    assert.equal(RefundPayoutIncident.schema.path('responsibility').options.immutable, true);
  });
});
