const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

let migration = {};
try {
  migration = require('./migrateSl008ReviewSupport');
} catch (_error) {
  // RED begins before the combined coordinator exists.
}

function repositories(calls, { supportPreflightError = null } = {}) {
  return {
    reviewRepository: {
      async preflight() {
        calls.push('review.preflight');
        return { backfills: [{}], missingRequired: [{}], legacyIndexes: [{}] };
      },
      async ensureRequiredIndexes() { calls.push('review.indexes'); return 1; },
      async backfillReviews() { calls.push('review.business'); return 1; },
      async dropLegacyUniqueIndexes() { calls.push('review.dropLegacy'); return 1; },
    },
    supportRepository: {
      async preflight() {
        calls.push('support.preflight');
        if (supportPreflightError) throw supportPreflightError;
        return {
          requestWrites: [{}],
          messageWrites: [{}],
          missingRequired: [{}],
          legacyEquivalent: [],
        };
      },
      async applyBusinessWrites() {
        calls.push('support.business');
        return { requestWrites: 1, messageWrites: 1 };
      },
      async ensureRequiredIndexes() { calls.push('support.indexes'); return 1; },
    },
  };
}

describe('SL-008 combined Review and Support migration', () => {
  it('exports the combined coordinator and CLI seam', () => {
    assert.equal(typeof migration.migrateSl008ReviewSupport, 'function');
    assert.equal(typeof migration.runCli, 'function');
    assert.equal(typeof migration.formatDiagnostic, 'function');
  });

  it('preflights both domains before any Review or Support write', async () => {
    const calls = [];
    const error = Object.assign(new Error('support preflight failed'), {
      code: 'SL008_SUPPORT_MESSAGE_AMBIGUOUS',
    });
    await assert.rejects(
      () => migration.migrateSl008ReviewSupport({
        ...repositories(calls, { supportPreflightError: error }),
      }),
      (caught) => caught === error,
    );
    assert.deepEqual(calls, ['review.preflight', 'support.preflight']);
  });

  it('keeps dry-run write-free and applies both approved plans only after preflight', async () => {
    const dryCalls = [];
    const dryResult = await migration.migrateSl008ReviewSupport({
      ...repositories(dryCalls),
      dryRun: true,
    });
    assert.deepEqual(dryCalls, ['review.preflight', 'support.preflight']);
    assert.equal(dryResult.businessWrites, 0);
    assert.equal(dryResult.indexesCreated, 0);

    const calls = [];
    const result = await migration.migrateSl008ReviewSupport(repositories(calls));
    assert.deepEqual(calls, [
      'review.preflight',
      'support.preflight',
      'review.indexes',
      'review.business',
      'review.dropLegacy',
      'support.business',
      'support.indexes',
    ]);
    assert.equal(result.businessWrites, 3);
    assert.equal(result.indexesCreated, 2);
  });

  it('requires a transaction-capable Mongo topology before the combined apply', async () => {
    const calls = [];
    const mongooseClient = {
      set(key, value) { calls.push(['set', key, value]); },
      async disconnect() { calls.push(['disconnect']); },
    };

    await migration.runCli({
      argv: ['--dry-run'],
      loadEnv() { calls.push(['env']); },
      mongooseClient,
      async connect(uri, options) { calls.push(['connect', uri, options]); },
      async migrate() { return { dryRun: true }; },
      logger: { log() {}, table() {} },
    });

    const connectCall = calls.find(([kind]) => kind === 'connect');
    assert.equal(connectCall[2].mongooseClient, mongooseClient);
    assert.equal(connectCall[2].requireTransactions, true);
  });
});
