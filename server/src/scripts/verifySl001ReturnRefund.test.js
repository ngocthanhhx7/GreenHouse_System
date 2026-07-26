const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const RefundPayoutEvidence = require('../models/refundPayoutEvidence.model');
const {
  assertSafeTarget,
  deleteRefundPayoutEvidenceFixture,
} = require('./verifySl001ReturnRefund');

describe('SL-001 live verification safety', () => {
  it('accepts only the dedicated local database target', () => {
    assert.doesNotThrow(() => assertSafeTarget('mongodb://127.0.0.1:27018/greenhome_kitchen?replicaSet=greenhome-rs'));
    assert.doesNotThrow(() => assertSafeTarget('mongodb://localhost:27018/greenhome_kitchen'));
    assert.throws(() => assertSafeTarget('mongodb://prod.example.com/greenhome_kitchen'), /restricted to the local/i);
    assert.throws(() => assertSafeTarget('mongodb://127.0.0.1:27018/other_database'), /restricted to the local/i);
  });

  it('uses a guarded low-level cleanup only for the dedicated local fixture database', async () => {
    const previous = {
      nodeEnv: process.env.NODE_ENV,
      mongodbUri: process.env.MONGODB_URI,
      deleteMany: RefundPayoutEvidence.collection.deleteMany,
    };
    const calls = [];
    RefundPayoutEvidence.collection.deleteMany = async (filter) => {
      calls.push(filter);
      return { deletedCount: 1 };
    };
    try {
      process.env.NODE_ENV = 'test';
      process.env.MONGODB_URI = 'mongodb://127.0.0.1:27018/greenhome_kitchen?replicaSet=greenhome-rs';
      await deleteRefundPayoutEvidenceFixture('request-local-1');
      assert.deepEqual(calls, [{ returnRefundRequestId: 'request-local-1' }]);

      process.env.NODE_ENV = 'production';
      await assert.rejects(
        () => deleteRefundPayoutEvidenceFixture('request-prod-1'),
        /cannot run in production/i,
      );

      process.env.NODE_ENV = 'test';
      process.env.MONGODB_URI = 'mongodb://prod.example.com/greenhome_kitchen';
      await assert.rejects(
        () => deleteRefundPayoutEvidenceFixture('request-remote-1'),
        /restricted to the local/i,
      );
      assert.equal(calls.length, 1);
    } finally {
      if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous.nodeEnv;
      if (previous.mongodbUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = previous.mongodbUri;
      RefundPayoutEvidence.collection.deleteMany = previous.deleteMany;
    }
  });
});
