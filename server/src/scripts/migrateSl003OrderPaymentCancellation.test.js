const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  DEFAULT_PAYMENT_TIMEOUT_MINUTES,
  STOCK_EXPORT_OPEN_INDEX,
  ensureStockExportOpenIndex,
  migrateSl003OrderPaymentCancellation,
} = require('./migrateSl003OrderPaymentCancellation');

function clone(value) {
  return structuredClone(value);
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function matchesFilter(document, filter) {
  if (String(document._id) !== String(filter._id)) return false;
  if (filter.orderStatus !== undefined && document.orderStatus !== filter.orderStatus) return false;
  if (filter.$or && !filter.$or.some((condition) => {
    if (condition.paymentDeadlineAt === null) return document.paymentDeadlineAt === null;
    if (condition.paymentDeadlineAt === '') return document.paymentDeadlineAt === '';
    if (condition.paymentDeadlineAt?.$exists === false) return document.paymentDeadlineAt === undefined;
    return false;
  })) return false;
  return true;
}

function isMigrationCandidate(document) {
  return ['WaitingForPayment', 'Expired'].includes(document.orderStatus)
    || (
      document.paymentMethod === 'ONLINE'
      && ['Pending', 'WaitingForPayment'].includes(document.orderStatus)
      && isMissing(document.paymentDeadlineAt)
    );
}

function createOrdersCollection(documents) {
  const calls = { find: [], updateOne: [], dropIndex: [] };
  return {
    documents,
    calls,
    find(query, options) {
      calls.find.push({ query: clone(query), options: clone(options) });
      return {
        async toArray() {
          return clone(documents.filter(isMigrationCandidate));
        },
      };
    },
    async updateOne(filter, update) {
      calls.updateOne.push({ filter: clone(filter), update: clone(update) });
      const document = documents.find((entry) => matchesFilter(entry, filter));
      if (!document) return { modifiedCount: 0 };
      Object.assign(document, clone(update.$set));
      return { modifiedCount: 1 };
    },
    async dropIndex(name) {
      calls.dropIndex.push(name);
    },
  };
}

function createStockExportCollection(documents, initialIndexes = []) {
  const indexes = clone(initialIndexes);
  const calls = { createIndex: [] };
  return {
    calls,
    aggregate() {
      return {
        async toArray() {
          const openCounts = new Map();
          for (const document of documents) {
            if (!STOCK_EXPORT_OPEN_INDEX.partialFilterExpression.status.$in.includes(document.status)) continue;
            openCounts.set(document.orderId, (openCounts.get(document.orderId) || 0) + 1);
          }
          return [...openCounts.entries()]
            .filter(([, count]) => count > 1)
            .slice(0, 1)
            .map(([_id, count]) => ({ _id, count }));
        },
      };
    },
    async indexes() { return clone(indexes); },
    async createIndex(key, options) {
      calls.createIndex.push({ key: clone(key), options: clone(options) });
      indexes.push({ key: clone(key), ...clone(options) });
      return options.name;
    },
  };
}

describe('SL-003 Order migration', () => {
  it('exports the approved default timeout and migration entry point', () => {
    assert.equal(DEFAULT_PAYMENT_TIMEOUT_MINUTES, 15);
    assert.equal(typeof migrateSl003OrderPaymentCancellation, 'function');
  });

  it('normalizes legacy Order states and backfills only missing online pre-confirmation deadlines', async () => {
    const existingDeadline = new Date('2026-07-23T11:30:00.000Z');
    const collection = createOrdersCollection([
      {
        _id: 'waiting-online',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Pending',
        orderStatus: 'WaitingForPayment',
        createdAt: new Date('2026-07-23T10:00:00.000Z'),
      },
      {
        _id: 'pending-online-existing',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Pending',
        orderStatus: 'Pending',
        createdAt: new Date('2026-07-23T11:00:00.000Z'),
        paymentDeadlineAt: existingDeadline,
      },
      {
        _id: 'pending-online-missing',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Paid',
        orderStatus: 'Pending',
        createdAt: new Date('2026-07-23T12:00:00.000Z'),
        paymentDeadlineAt: null,
      },
      {
        _id: 'expired-online',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Failed',
        orderStatus: 'Expired',
        createdAt: new Date('2026-07-23T09:00:00.000Z'),
      },
      {
        _id: 'pending-cod',
        paymentMethod: 'COD',
        paymentStatus: 'Unpaid',
        orderStatus: 'Pending',
        createdAt: new Date('2026-07-23T13:00:00.000Z'),
      },
      {
        _id: 'confirmed-online',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Paid',
        orderStatus: 'Confirmed',
        createdAt: new Date('2026-07-23T14:00:00.000Z'),
      },
    ]);

    const result = await migrateSl003OrderPaymentCancellation({ collection });

    assert.deepEqual(result, {
      scanned: 3,
      waitingForPaymentNormalized: 1,
      expiredNormalized: 1,
      deadlinesBackfilled: 2,
    });
    assert.equal(collection.documents[0].orderStatus, 'Pending');
    assert.equal(collection.documents[0].paymentStatus, 'Pending');
    assert.equal(
      new Date(collection.documents[0].paymentDeadlineAt).toISOString(),
      '2026-07-23T10:15:00.000Z',
    );
    assert.equal(collection.documents[1].paymentDeadlineAt.getTime(), existingDeadline.getTime());
    assert.equal(
      new Date(collection.documents[2].paymentDeadlineAt).toISOString(),
      '2026-07-23T12:15:00.000Z',
    );
    assert.equal(collection.documents[2].paymentStatus, 'Paid');
    assert.equal(collection.documents[3].orderStatus, 'Cancelled');
    assert.equal(collection.documents[3].paymentStatus, 'Failed');
    assert.equal(collection.documents[3].paymentDeadlineAt, undefined);
    assert.equal(collection.documents[4].paymentDeadlineAt, undefined);
    assert.equal(collection.documents[5].paymentDeadlineAt, undefined);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('uses a configurable timeout without rewriting an existing deadline', async () => {
    const existingDeadline = new Date('2026-07-23T10:15:00.000Z');
    const collection = createOrdersCollection([
      {
        _id: 'custom-timeout',
        paymentMethod: 'ONLINE',
        orderStatus: 'Pending',
        createdAt: new Date('2026-07-23T10:00:00.000Z'),
      },
      {
        _id: 'immutable-deadline',
        paymentMethod: 'ONLINE',
        orderStatus: 'Pending',
        createdAt: new Date('2026-07-23T10:00:00.000Z'),
        paymentDeadlineAt: existingDeadline,
      },
    ]);

    await migrateSl003OrderPaymentCancellation({
      collection,
      paymentTimeoutMinutes: 30,
    });

    assert.equal(
      new Date(collection.documents[0].paymentDeadlineAt).toISOString(),
      '2026-07-23T10:30:00.000Z',
    );
    assert.equal(collection.documents[1].paymentDeadlineAt.getTime(), existingDeadline.getTime());
  });

  it('is repeat-safe and performs no writes on a second run', async () => {
    const collection = createOrdersCollection([
      {
        _id: 'repeat-safe',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Pending',
        orderStatus: 'WaitingForPayment',
        createdAt: new Date('2026-07-23T10:00:00.000Z'),
      },
      {
        _id: 'repeat-expired',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Failed',
        orderStatus: 'Expired',
        createdAt: new Date('2026-07-23T09:00:00.000Z'),
      },
    ]);

    await migrateSl003OrderPaymentCancellation({ collection });
    const writesAfterFirstRun = collection.calls.updateOne.length;
    const secondRun = await migrateSl003OrderPaymentCancellation({ collection });

    assert.equal(collection.calls.updateOne.length, writesAfterFirstRun);
    assert.deepEqual(secondRun, {
      scanned: 0,
      waitingForPaymentNormalized: 0,
      expiredNormalized: 0,
      deadlinesBackfilled: 0,
    });
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('stops before any write when a missing deadline cannot be derived safely', async () => {
    const collection = createOrdersCollection([
      {
        _id: 'valid-waiting',
        paymentMethod: 'ONLINE',
        orderStatus: 'WaitingForPayment',
        createdAt: new Date('2026-07-23T10:00:00.000Z'),
      },
      {
        _id: 'missing-created-at',
        paymentMethod: 'ONLINE',
        orderStatus: 'Pending',
      },
    ]);

    await assert.rejects(
      () => migrateSl003OrderPaymentCancellation({ collection }),
      /missing-created-at.*valid createdAt/i,
    );
    assert.deepEqual(collection.calls.updateOne, []);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('rejects an unsafe timeout before reading or writing Orders', async () => {
    const collection = createOrdersCollection([]);

    await assert.rejects(
      () => migrateSl003OrderPaymentCancellation({
        collection,
        paymentTimeoutMinutes: 0,
      }),
      /positive integer/i,
    );
    assert.deepEqual(collection.calls.find, []);
    assert.deepEqual(collection.calls.updateOne, []);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('creates the one-open-stock-export index once and is repeat-safe', async () => {
    const collection = createStockExportCollection([
      { orderId: 'order-1', status: 'Pending' },
      { orderId: 'order-1', status: 'Cancelled' },
    ]);

    assert.deepEqual(await ensureStockExportOpenIndex({ collection }), { created: true });
    assert.deepEqual(await ensureStockExportOpenIndex({ collection }), { created: false });
    assert.equal(collection.calls.createIndex.length, 1);
    assert.equal(collection.calls.createIndex[0].options.unique, true);
    assert.deepEqual(
      collection.calls.createIndex[0].options.partialFilterExpression,
      STOCK_EXPORT_OPEN_INDEX.partialFilterExpression,
    );
  });

  it('stops before index creation when an order already has multiple open export requests', async () => {
    const collection = createStockExportCollection([
      { orderId: 'order-duplicate', status: 'Pending' },
      { orderId: 'order-duplicate', status: 'Approved' },
    ]);

    await assert.rejects(
      () => ensureStockExportOpenIndex({ collection }),
      /multiple open stock export requests/i,
    );
    assert.deepEqual(collection.calls.createIndex, []);
  });
});
