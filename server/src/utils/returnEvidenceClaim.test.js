const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createReturnEvidenceClaim } = require('./returnEvidenceClaim');

const baseUrl = '/api/return-refunds/evidence/11111111-1111-4111-8111-111111111111.jpg';

describe('return evidence owner claim', () => {
  it('binds an opaque evidence URL and trusted size to the uploading Customer', () => {
    const claim = createReturnEvidenceClaim({ secret: 'test-return-evidence-claim-secret-at-least-32-bytes' });
    const signed = claim.sign('customer-1', baseUrl, 4096);
    assert.match(signed, /^\/api\/return-refunds\/evidence\/[0-9a-f-]{36}\.jpg\?size=4096&claim=[0-9a-f]{64}$/);
    assert.deepEqual(claim.verify('customer-1', signed), { url: baseUrl, size: 4096 });
    assert.throws(() => claim.verify('customer-2', signed), /not owned/i);
    assert.throws(() => claim.verify('customer-1', signed.replace('size=4096', 'size=1')), /not owned/i);
  });

  it('requires an explicit production secret', () => {
    assert.throws(
      () => createReturnEvidenceClaim({ secret: '', runtime: 'production' }),
      /RETURN_EVIDENCE_CLAIM_SECRET.*required/i,
    );
  });
});
