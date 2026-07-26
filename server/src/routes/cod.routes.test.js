const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'cod.routes.js'), 'utf8');

describe('COD integration route boundaries', () => {
  it('protects Carrier evidence with a signature and recovery with Staff authorization', () => {
    assert.match(source, /router\.post\('\/carrier\/orders\/:id\/cod-collection', carrierSignature, codController\.recordCollection/);
    assert.match(source, /router\.post\('\/carrier\/orders\/:id\/cod-settlement', carrierSignature, codController\.recordSettlement/);
    assert.match(source, /router\.post\('\/staff\/orders\/:id\/cod-collection', authenticate, authorizeRoles\('Staff'\), validateObjectIdParam\(\), codController\.recordStaffCollection/);
    assert.match(source, /router\.post\('\/warehouse\/orders\/:id\/cod-recovery-receipt', authenticate, authorizeRoles\('WarehouseManager'\), codController\.recordGoodsRecovery/);
    assert.match(source, /router\.get\('\/warehouse\/cod-recoveries', authenticate, authorizeRoles\('WarehouseManager'\), codController\.listRecoveryCandidates/);
    assert.match(source, /router\.get\('\/warehouse\/cod-recoveries\/:id', authenticate, authorizeRoles\('WarehouseManager'\), codController\.getRecoveryCandidate/);
    assert.match(source, /router\.post\('\/staff\/orders\/:id\/cod-recovery', authenticate, authorizeRoles\('Staff'\), validateObjectIdParam\(\), codController\.finalizeRecovery/);
  });
});
