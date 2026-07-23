const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  assertTransactionSupport,
  connectDatabase,
  supportsTransactions,
} = require('./database');

describe('database transaction topology', () => {
  it('accepts a MongoDB replica set or mongos', () => {
    assert.equal(supportsTransactions({ setName: 'rs0' }), true);
    assert.equal(supportsTransactions({ msg: 'isdbgrid' }), true);
  });

  it('rejects standalone MongoDB with an actionable configuration error', async () => {
    await assert.rejects(
      () => assertTransactionSupport({
        db: { admin: () => ({ command: async () => ({ setName: null, msg: null }) }) },
      }),
      (error) => {
        assert.equal(error.code, 'DATABASE_TRANSACTIONS_UNSUPPORTED');
        assert.match(error.message, /replica set/i);
        assert.match(error.message, /rs0/i);
        return true;
      }
    );
  });

  it('disconnects when startup detects a standalone database', async () => {
    const calls = [];
    const mongooseClient = {
      connection: {
        db: { admin: () => ({ command: async () => ({ setName: null, msg: null }) }) },
      },
      async connect(uri) { calls.push(`connect:${uri}`); },
      async disconnect() { calls.push('disconnect'); },
    };

    await assert.rejects(
      () => connectDatabase('mongodb://localhost/greenhome_test', { mongooseClient }),
      { code: 'DATABASE_TRANSACTIONS_UNSUPPORTED' }
    );
    assert.deepEqual(calls, ['connect:mongodb://localhost/greenhome_test', 'disconnect']);
  });
});
