const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  ACTORS,
  CONFIRMATION,
  assertSafeCiTarget,
} = require('./ciEphemeralActors');

describe('CI ephemeral actor fixture', () => {
  it('accepts only the confirmed loopback greenhome_kitchen database outside production', () => {
    assert.doesNotThrow(() => assertSafeCiTarget({
      nodeEnv: 'test',
      mongoUri: 'mongodb://127.0.0.1:27017/greenhome_kitchen?replicaSet=rs0',
      confirmation: CONFIRMATION,
    }));
  });

  it('rejects production, a missing confirmation, a remote host, and a different database', () => {
    const base = {
      nodeEnv: 'test',
      mongoUri: 'mongodb://127.0.0.1:27017/greenhome_kitchen?replicaSet=rs0',
      confirmation: CONFIRMATION,
    };
    assert.throws(() => assertSafeCiTarget({ ...base, nodeEnv: 'production' }), /production/i);
    assert.throws(() => assertSafeCiTarget({ ...base, confirmation: '' }), /CI_EPHEMERAL_CONFIRM/i);
    assert.throws(
      () => assertSafeCiTarget({ ...base, mongoUri: 'mongodb://db.example/greenhome_kitchen' }),
      /loopback/i
    );
    assert.throws(
      () => assertSafeCiTarget({ ...base, mongoUri: 'mongodb://127.0.0.1/greenhome_staging' }),
      /greenhome_kitchen/i
    );
  });

  it('declares exactly the actors required by SL-001 and live role smoke checks', () => {
    assert.deepEqual(
      ACTORS.map(({ roleName, email }) => ({ roleName, email })),
      [
        { roleName: 'Customer', email: 'khachhang@greenhome.test' },
        { roleName: 'Staff', email: 'nhanvien@greenhome.test' },
        { roleName: 'WarehouseManager', email: 'quanlykho@greenhome.test' },
      ]
    );
  });
});
