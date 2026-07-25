const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createOperationalEvidenceClaim } = require('./operationalEvidenceClaim');

describe('operational evidence claim', () => {
  it('signs and verifies a protected evidence URL without binding it to one internal reviewer', () => {
    const claim = createOperationalEvidenceClaim({ secret: 'test-secret', runtime: 'test' });
    const signed = claim.sign('/api/operational-evidence/11111111-1111-4111-8111-111111111111.png', 1234);
    assert.match(signed, /\?size=1234&claim=[0-9a-f]{64}$/);
    assert.deepEqual(claim.verify(signed), {
      url: '/api/operational-evidence/11111111-1111-4111-8111-111111111111.png',
      size: 1234,
    });
  });

  it('rejects tampering and requires an explicit production secret', () => {
    const claim = createOperationalEvidenceClaim({ secret: 'test-secret', runtime: 'test' });
    const signed = claim.sign('/api/operational-evidence/11111111-1111-4111-8111-111111111111.png', 1234);
    assert.throws(() => claim.verify(signed.replace('size=1234', 'size=1235')), /không hợp lệ/i);
    assert.throws(
      () => createOperationalEvidenceClaim({ secret: '', runtime: 'production' }),
      /OPERATIONAL_EVIDENCE_CLAIM_SECRET/,
    );
  });
});
