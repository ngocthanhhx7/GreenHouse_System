const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { assertSafeTarget } = require('./verifySl002Exchange');

describe('SL-002 verification destructive safety', () => {
  it('allows only the local greenhome_kitchen database outside production', () => {
    assert.doesNotThrow(() => assertSafeTarget(
      'mongodb://127.0.0.1:27017/greenhome_kitchen',
      { nodeEnv: 'test' }
    ));
    assert.doesNotThrow(() => assertSafeTarget(
      'mongodb://localhost/greenhome_kitchen?replicaSet=rs0',
      { nodeEnv: 'development' }
    ));
  });

  it('rejects production and every non-local or differently named database', () => {
    assert.throws(
      () => assertSafeTarget('mongodb://127.0.0.1/greenhome_kitchen', { nodeEnv: 'production' }),
      /production/i
    );
    assert.throws(
      () => assertSafeTarget('mongodb://db.internal/greenhome_kitchen', { nodeEnv: 'test' }),
      /local/i
    );
    assert.throws(
      () => assertSafeTarget('mongodb://127.0.0.1/greenhome', { nodeEnv: 'test' }),
      /greenhome_kitchen|local/i
    );
  });
});
