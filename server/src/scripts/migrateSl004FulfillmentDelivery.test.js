const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  backfillLegacyExportRequest,
  initialExportBackfillFilter,
  legacyExportPatch,
  migrateSl004FulfillmentDelivery,
} = require('./migrateSl004FulfillmentDelivery');

describe('SL-004 fulfillment and delivery migration', () => {
  it('maps legacy Warehouse decisions to the exact retryable lifecycle without inventing packing', () => {
    const completedAt = new Date('2026-07-01T10:00:00.000Z');
    assert.deepEqual(legacyExportPatch({ status: 'Approved' }), {
      status: 'Pending',
      failureCode: '',
      failureReason: '',
    });
    assert.deepEqual(legacyExportPatch({ status: 'Rejected', note: 'Warehouse rejected' }), {
      status: 'Failed',
      failureCode: 'LEGACY_WAREHOUSE_REJECTED',
      failureReason: 'Warehouse rejected',
    });
    assert.deepEqual(legacyExportPatch({ status: 'Exported', exportedAt: completedAt }), {
      status: 'Completed',
      completedAt,
      exportedAt: completedAt,
      failureCode: '',
      failureReason: '',
    });
    assert.equal(legacyExportPatch({ status: 'Processing' }).status, 'Failed');
  });

  it('runs conflict preflight before repeat-safe backfill, reports unverifiable evidence, then creates indexes', async () => {
    const calls = [];
    const result = await migrateSl004FulfillmentDelivery({
      repository: {
        async assertNoConflicts() { calls.push('preflight'); },
        async normalizeLegacyOrderStates() { calls.push('orders'); return 2; },
        async backfillInitialCyclesAndExports() {
          calls.push('cycles');
          return { cyclesCreated: 3, exportsBackfilled: 3 };
        },
        async reportUnverifiableFulfillment() {
          calls.push('report');
          return { count: 2, orderIds: ['order-packed', 'order-shipped'] };
        },
        async verifyIndexes() { calls.push('indexes'); return 9; },
      },
    });

    assert.deepEqual(calls, ['preflight', 'orders', 'cycles', 'report', 'indexes']);
    assert.deepEqual(result, {
      ordersNormalized: 2,
      cyclesCreated: 3,
      exportsBackfilled: 3,
      reconciliationRequired: 2,
      reconciliationOrderIds: ['order-packed', 'order-shipped'],
      indexesVerified: 9,
    });
  });

  it('surfaces preflight conflicts before any business write', async () => {
    const calls = [];
    await assert.rejects(
      () => migrateSl004FulfillmentDelivery({
        repository: {
          async assertNoConflicts() {
            calls.push('preflight');
            throw new Error('duplicate initial export requests');
          },
          async normalizeLegacyOrderStates() { calls.push('orders'); return 1; },
        },
      }),
      /duplicate initial export/i,
    );
    assert.deepEqual(calls, ['preflight']);
  });

  it('reports zero writes on a second already-normalized run', async () => {
    const repository = {
      async assertNoConflicts() {},
      async normalizeLegacyOrderStates() { return 0; },
      async backfillInitialCyclesAndExports() {
        return { cyclesCreated: 0, exportsBackfilled: 0 };
      },
      async reportUnverifiableFulfillment() { return { count: 0, orderIds: [] }; },
      async verifyIndexes() { return 9; },
    };
    const second = await migrateSl004FulfillmentDelivery({ repository });
    assert.equal(second.ordersNormalized, 0);
    assert.equal(second.cyclesCreated, 0);
    assert.equal(second.exportsBackfilled, 0);
  });

  it('uses an immutable-safe legacy export write that attaches the Initial cycle and is repeat-safe', async () => {
    const document = {
      _id: 'export-legacy-1',
      status: 'Approved',
    };
    const model = {
      collection: {
        async updateOne(filter, update) {
          assert.equal(filter._id, document._id);
          const changed = Object.entries(update.$set)
            .some(([key, value]) => String(document[key] ?? '') !== String(value ?? ''));
          Object.assign(document, update.$set);
          return { modifiedCount: changed ? 1 : 0 };
        },
      },
    };
    const input = {
      model,
      requestId: document._id,
      cycleId: 'cycle-initial-1',
      patch: legacyExportPatch(document),
      session: { id: 'migration-session' },
    };

    const first = await backfillLegacyExportRequest(input);
    assert.equal(first.modifiedCount, 1);
    assert.equal(document.status, 'Pending');
    assert.equal(document.cycleId, 'cycle-initial-1');
    assert.equal(document.requestKind, 'Initial');

    const second = await backfillLegacyExportRequest({
      ...input,
      patch: legacyExportPatch(document),
    });
    assert.equal(second.modifiedCount, 0);
  });

  it('never rewrites a post-migration Resend request when the migration is rerun later', async () => {
    assert.deepEqual(initialExportBackfillFilter(), {
      $or: [
        { requestKind: { $exists: false } },
        { requestKind: 'Initial' },
      ],
    });
    let writes = 0;
    const result = await backfillLegacyExportRequest({
      model: {
        collection: {
          async updateOne() {
            writes += 1;
            return { modifiedCount: 1 };
          },
        },
      },
      requestId: 'export-resend-1',
      cycleId: 'cycle-initial-1',
      requestKind: 'Resend',
      patch: { status: 'Pending' },
      session: { id: 'migration-session' },
    });

    assert.equal(writes, 0);
    assert.equal(result.modifiedCount, 0);
  });
});
