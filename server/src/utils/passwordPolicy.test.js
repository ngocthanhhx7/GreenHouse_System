const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { validatePasswordPolicy } = require('./passwordPolicy');

describe('SL-007 password policy', () => {
  it('AT-142 applies one 8-72 byte letter and digit password policy', () => {
    assert.deepEqual(
      validatePasswordPolicy({ password: 'Matkhau123', confirmPassword: 'Matkhau123' }),
      { password: 'Matkhau123' }
    );

    for (const password of ['12345678', 'abcdefgh', 'abc123', `${'a'.repeat(72)}1`]) {
      assert.throws(
        () => validatePasswordPolicy({ password, confirmPassword: password }),
        (error) => error.errorCode === 'PASSWORD_POLICY_INVALID'
      );
    }

    assert.throws(
      () => validatePasswordPolicy({ password: 'Matkhau123', confirmPassword: 'Matkhau124' }),
      (error) => error.errorCode === 'PASSWORD_CONFIRMATION_MISMATCH'
    );
  });
});
