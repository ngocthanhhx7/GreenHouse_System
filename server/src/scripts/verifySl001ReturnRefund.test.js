const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { assertSafeTarget } = require('./verifySl001ReturnRefund');

describe('SL-001 live verification safety', () => {
  it('accepts only the dedicated local database target', () => {
    assert.doesNotThrow(() => assertSafeTarget('mongodb://127.0.0.1:27018/greenhome_kitchen?replicaSet=greenhome-rs'));
    assert.doesNotThrow(() => assertSafeTarget('mongodb://localhost:27018/greenhome_kitchen'));
    assert.throws(() => assertSafeTarget('mongodb://prod.example.com/greenhome_kitchen'), /restricted to the local/i);
    assert.throws(() => assertSafeTarget('mongodb://127.0.0.1:27018/other_database'), /restricted to the local/i);
  });
});
