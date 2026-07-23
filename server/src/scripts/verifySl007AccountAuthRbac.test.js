const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { verifySl007AccountAuthRbac } = require('./verifySl007AccountAuthRbac');

describe('SL-007 verifier', () => {
  it('reports all account/auth/RBAC invariants as passing', () => {
    const report = verifySl007AccountAuthRbac();
    assert.equal(report.status, 'PASS');
    assert.equal(report.checks.every((check) => check.passed), true);
    const ids = new Set(report.checks.map((check) => check.id));
    for (const required of [
      'credential-version-bound-session',
      'atomic-login-throttle',
      'single-live-pre-account-state',
      'serialized-address-book',
      'role-assignment-write-fence',
    ]) {
      assert.equal(ids.has(required), true, required);
    }
  });
});
