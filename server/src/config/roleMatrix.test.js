const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { APPROVED_ROLES, assertSingleApprovedRole, roleCan } = require('./roleMatrix');

describe('central SL-007 role matrix', () => {
  it('AT-132 enforces one recognized persisted role and fails closed', () => {
    assert.deepEqual(APPROVED_ROLES, ['Customer', 'Staff', 'WarehouseManager', 'Admin']);
    assert.equal(assertSingleApprovedRole({ roleName: 'Customer' }), 'Customer');
    assert.equal(roleCan('Customer', 'address:self'), true);
    assert.equal(roleCan('Staff', 'address:self'), false);
    assert.equal(roleCan('Admin', 'account:govern'), true);

    for (const evidence of [null, {}, { roleName: 'Unknown' }, [{ roleName: 'Staff' }, { roleName: 'Admin' }]]) {
      assert.throws(() => assertSingleApprovedRole(evidence), /ROLE_INTEGRITY_INVALID/);
    }
  });
});
