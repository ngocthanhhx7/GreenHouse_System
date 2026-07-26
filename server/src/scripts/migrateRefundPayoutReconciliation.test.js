const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');
const {
  cleanupDisposableMongo,
  resolveMongodBinary,
  startDisposableMongo,
} = require('../testUtils/disposableMongo');

let migration = {};
try {
  migration = require('./migrateRefundPayoutReconciliation');
} catch (_error) {
  // Intentional RED cycle: this test describes the migration before it exists.
}

function clone(value) {
  return structuredClone(value);
}

class MemoryCollection {
  constructor(name, documents = [], indexes = []) {
    this.name = name;
    this.documents = clone(documents);
    this.indexes = [{ name: '_id_', key: { _id: 1 } }, ...clone(indexes)];
    this.operations = [];
  }

  find(query = {}, options = {}) {
    this.operations.push({ type: 'find', query: clone(query), options: clone(options) });
    return {
      limit: () => ({ toArray: async () => clone(this.documents) }),
      toArray: async () => clone(this.documents),
    };
  }

  aggregate(pipeline) {
    this.operations.push({ type: 'aggregate', pipeline: clone(pipeline) });
    const match = pipeline.find((stage) => stage.$match)?.$match || {};
    const statuses = match.payoutStatus?.$in;
    const rows = statuses
      ? this.documents.filter((document) => statuses.includes(document.payoutStatus))
      : this.documents;
    return { toArray: async () => clone(rows) };
  }

  listIndexes() {
    return { toArray: async () => clone(this.indexes) };
  }

  async createIndex(key, options) {
    this.operations.push({ type: 'createIndex', key: clone(key), options: clone(options) });
    this.indexes.push({ key: clone(key), ...clone(options) });
    return options.name;
  }
}

function fixture() {
  return {
    refunds: new MemoryCollection('refundpendings', [
      {
        _id: 'refund-1', payoutStatus: 'Processing', payoutMethod: 'PayOS',
        payoutOperationKey: 'payos-op-0001', payoutStartedAt: new Date('2026-07-25T08:00:00.000Z'),
      },
    ]),
    evidence: new MemoryCollection('refundpayoutevidences', []),
    destinations: new MemoryCollection('refunddestinations', [
      { _id: 'destination-1', bankName: 'Legacy Bank', bankBin: '123456', status: 'Verified' },
    ]),
  };
}

function businessWrites(collections) {
  return Object.values(collections).flatMap((collection) => collection.operations)
    .filter((operation) => !['find', 'aggregate', 'createIndex'].includes(operation.type));
}

describe('refund payout reconciliation migration', () => {
  it('verifies the required payout schema facts without connecting to Mongo', () => {
    assert.equal(migration.verifyRuntimeSchema(), true);
  });

  it('parses explicit preflight, dry-run, apply, and verify modes', () => {
    assert.deepEqual(migration.parseCliArgs([]), { mode: 'dry-run' });
    assert.deepEqual(migration.parseCliArgs(['--preflight']), { mode: 'preflight' });
    assert.deepEqual(migration.parseCliArgs(['--apply']), { mode: 'apply' });
    assert.deepEqual(migration.parseCliArgs(['--verify']), { mode: 'verify' });
    assert.throws(() => migration.parseCliArgs(['--apply', '--verify']), /exactly one/i);
  });

  it('dry-runs with bounded safe diagnostics and makes no writes', async () => {
    const collections = fixture();
    const result = await migration.runMigration({ collections, mode: 'dry-run' });

    assert.equal(result.mode, 'dry-run');
    assert.equal(result.businessWrites, 0);
    assert.equal(result.indexesCreated, 0);
    assert.deepEqual(result.diagnostics.unresolvedPayouts, [{ id: 'refund-1', status: 'Processing', method: 'PayOS' }]);
    assert.deepEqual(result.diagnostics.nonCanonicalBanks, [{ id: 'destination-1', status: 'Verified' }]);
    assert.doesNotMatch(JSON.stringify(result.diagnostics), /account|holder|bankBin|reason|encrypted/i);
    assert.deepEqual(businessWrites(collections), []);
    assert.equal(collections.refunds.operations.some((operation) => operation.type === 'find'), false, 'preflight must use bounded aggregate queries');
  });

  it('accepts a reconciled Failed operation with retained method and operation identity', async () => {
    const collections = fixture();
    collections.refunds.documents = [{
      _id: 'refund-failed',
      payoutStatus: 'Failed',
      payoutMethod: 'Manual',
      payoutOperationKey: 'manual-operation-0001',
      payoutStartedAt: new Date('2026-07-25T08:00:00.000Z'),
    }];

    const result = await migration.runMigration({ collections, mode: 'dry-run' });
    assert.deepEqual(result.diagnostics.invalidPayoutCorrelations, []);
  });

  it('applies indexes only, preserves business documents, and a second apply is write-free', async () => {
    const collections = fixture();
    const before = clone({
      refunds: collections.refunds.documents,
      evidence: collections.evidence.documents,
      destinations: collections.destinations.documents,
    });

    const first = await migration.runMigration({ collections, mode: 'apply' });
    const afterFirst = Object.values(collections).flatMap((collection) => collection.operations)
      .filter((operation) => operation.type === 'createIndex').length;
    const second = await migration.runMigration({ collections, mode: 'apply' });

    assert.equal(first.businessWrites, 0);
    assert.ok(first.indexesCreated > 0);
    assert.equal(second.businessWrites, 0);
    assert.equal(second.indexesCreated, 0);
    assert.deepEqual({
      refunds: collections.refunds.documents,
      evidence: collections.evidence.documents,
      destinations: collections.destinations.documents,
    }, before, 'migration must not invent evidence, change payout outcome, or rewrite bank destinations');
    assert.equal(
      Object.values(collections).flatMap((collection) => collection.operations)
        .filter((operation) => operation.type === 'createIndex').length,
      afterFirst,
    );
  });

  it('verifies exact indexes and fails closed for mismatched named indexes', async () => {
    const collections = fixture();
    await migration.runMigration({ collections, mode: 'apply' });
    const verified = await migration.runMigration({ collections, mode: 'verify' });
    assert.equal(verified.valid, true);

    collections.evidence.indexes = collections.evidence.indexes.map((index) => (
      index.name === 'refund_payout_one_success_per_obligation'
        ? { ...index, partialFilterExpression: { status: 'Failed' } }
        : index
    ));
    await assert.rejects(
      () => migration.runMigration({ collections, mode: 'apply' }),
      (error) => error?.code === 'REFUND_PAYOUT_MIGRATION_INDEX_MISMATCH',
    );
  });

  it('keeps a real disposable Mongo dry-run collection/write-free with automatic creation disabled', {
    skip: !resolveMongodBinary(),
    timeout: 30_000,
  }, async () => {
    const instance = await startDisposableMongo({ binary: resolveMongodBinary() });
    const previousUri = process.env.MONGODB_URI;
    const originalSet = mongoose.set.bind(mongoose);
    const settings = [];
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${instance.port}/refund-payout-migration-test`;
    try {
      await migration.runCli({
        argv: ['--dry-run'],
        loadEnv: () => {},
        mongooseClient: { ...mongoose, set(key, value) { settings.push([key, value]); return originalSet(key, value); } },
        logger: { log() {}, table() {} },
      });
      const connection = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
      const names = await connection.db.listCollections({}, { nameOnly: true }).toArray();
      await connection.close();
      assert.deepEqual(names, []);
      assert.deepEqual(settings, [['autoIndex', false], ['autoCreate', false]]);
    } finally {
      process.env.MONGODB_URI = previousUri;
      await mongoose.disconnect();
      await cleanupDisposableMongo(instance);
    }
  });

  it('finds an invalid correlation after more than fifty valid rows before applying the diagnostic limit', {
    skip: !resolveMongodBinary(),
    timeout: 30_000,
  }, async () => {
    const instance = await startDisposableMongo({ binary: resolveMongodBinary() });
    const connection = await mongoose.createConnection(
      `mongodb://127.0.0.1:${instance.port}/refund-payout-invalid-correlation-test`
    ).asPromise();
    try {
      const refunds = connection.collection('refundpendings');
      await refunds.insertMany([
        ...Array.from({ length: 51 }, (_, index) => ({
          _id: index + 1,
          payoutStatus: 'NotStarted',
          payoutMethod: null,
          payoutOperationKey: '',
        })),
        {
          _id: 52,
          payoutStatus: 'Processing',
          payoutMethod: null,
          payoutOperationKey: '',
        },
      ]);
      const diagnostics = await migration.buildPreflightDiagnostics({
        refunds,
        evidence: connection.collection('refundpayoutevidences'),
        destinations: connection.collection('refunddestinations'),
      });
      assert.deepEqual(diagnostics.invalidPayoutCorrelations, [{
        id: '52',
        status: 'Processing',
        method: '',
      }]);
    } finally {
      await connection.close();
      await cleanupDisposableMongo(instance);
    }
  });
});
