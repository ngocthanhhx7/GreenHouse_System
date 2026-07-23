const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  DEFAULT_PAYMENT_TIMEOUT_MINUTES,
  buildLegacyRepairPlan,
  ORDER_CHECKOUT_IDEMPOTENCY_INDEX,
  PAYMENT_ATTEMPT_PROVIDER_ORDER_INDEX,
  PAYMENT_ATTEMPT_ONE_PENDING_INDEX,
  DOMAIN_OUTBOX_IDENTITY_INDEX,
  DOMAIN_OUTBOX_LEASE_INDEX,
  STOCK_EXPORT_OPEN_INDEX,
  RETURN_REFUND_PHYSICAL_OPEN_INDEX,
  RETURN_REFUND_OBLIGATION_INDEX,
  ensureRefundPendingObligationIndex,
  ensureReturnRefundRequestIndexes,
  ensureSl003IdentityIndexes,
  ensureStockExportOpenIndex,
  migrateSl003OrderPaymentCancellation,
  runCli,
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
  it('plans repeat-safe dependent repairs for expired reservations and active attempts', () => {
    const plan = buildLegacyRepairPlan({
      _id: 'expired-order',
      orderStatus: 'Expired',
      paymentStatus: 'Pending',
      paymentMethod: 'ONLINE',
    });
    assert.deepEqual(plan.orderUpdate, { orderStatus: 'Cancelled', paymentStatus: 'Cancelled' });
    assert.equal(plan.releaseReservations, true);
    assert.equal(plan.retireActiveAttempts, true);
  });
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
      cancelledPaymentNormalized: 1,
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
    assert.equal(collection.documents[3].paymentStatus, 'Cancelled');
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
      cancelledPaymentNormalized: 0,
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

  it('replaces the legacy one-order refund index with physical and obligation-scoped identities', async () => {
    const indexes = [{
      name: 'return_refund_one_open_request_per_order_v2',
      key: { orderId: 1 },
      unique: true,
    }];
    const calls = { createIndex: [], dropIndex: [], aggregate: 0 };
    const collection = {
      aggregate() {
        calls.aggregate += 1;
        return { async toArray() { return []; } };
      },
      async indexes() { return clone(indexes); },
      async createIndex(key, options) {
        calls.createIndex.push({ key: clone(key), options: clone(options) });
        indexes.push({ key: clone(key), ...clone(options) });
      },
      async dropIndex(name) {
        calls.dropIndex.push(name);
      },
    };

    const result = await ensureReturnRefundRequestIndexes({ collection });

    assert.equal(result.ensured, true);
    assert.equal(calls.aggregate, 2);
    assert.deepEqual(
      calls.createIndex.map((entry) => entry.options.name).sort(),
      [RETURN_REFUND_PHYSICAL_OPEN_INDEX.name, RETURN_REFUND_OBLIGATION_INDEX.name].sort(),
    );
    assert.deepEqual(calls.dropIndex, ['return_refund_one_open_request_per_order_v2']);
  });

  it('fails refund index preflight before creating or dropping indexes when obligation identities collide', async () => {
    const calls = { createIndex: [], dropIndex: [] };
    const collection = {
      aggregate() {
        return {
          async toArray() {
            return [{ _id: { orderId: 'order-1', obligationKey: 'EXCESS_PAYMENT:attempt-1' }, count: 2 }];
          },
        };
      },
      async indexes() { return []; },
      async createIndex(...args) { calls.createIndex.push(args); },
      async dropIndex(name) { calls.dropIndex.push(name); },
    };

    await assert.rejects(
      () => ensureReturnRefundRequestIndexes({ collection }),
      /duplicate return\/refund obligation identity/i,
    );
    assert.deepEqual(calls.createIndex, []);
    assert.deepEqual(calls.dropIndex, []);
  });

  it('does not suppress duplicate RefundPending obligation data during index preflight', async () => {
    const collection = {
      aggregate() {
        return { async toArray() { return [{ _id: 'PAYMENT_REVERSAL:attempt-1', count: 2 }]; } };
      },
      async indexes() { return []; },
      async createIndex() {
        throw new Error('index creation must not run after duplicate preflight');
      },
    };

    await assert.rejects(
      () => ensureRefundPendingObligationIndex({ collection }),
      /duplicate refund obligation key/i,
    );
  });

  it('ensures checkout, payOS-attempt, and durable-outbox identities repeat-safely', async () => {
    const created = [];
    function collection(label) {
      const indexes = [];
      return {
        aggregate() { return { async toArray() { return []; } }; },
        async indexes() { return clone(indexes); },
        async createIndex(key, options) {
          created.push({ label, key: clone(key), options: clone(options) });
          indexes.push({ key: clone(key), ...clone(options) });
        },
      };
    }
    const orderCollection = collection('orders');
    const attemptCollection = collection('attempts');
    const domainOutboxCollection = collection('outbox');

    await ensureSl003IdentityIndexes({ orderCollection, attemptCollection, domainOutboxCollection });
    await ensureSl003IdentityIndexes({ orderCollection, attemptCollection, domainOutboxCollection });

    assert.deepEqual(
      created.map((entry) => entry.options.name).sort(),
      [
        ORDER_CHECKOUT_IDEMPOTENCY_INDEX.name,
        PAYMENT_ATTEMPT_PROVIDER_ORDER_INDEX.name,
        PAYMENT_ATTEMPT_ONE_PENDING_INDEX.name,
        DOMAIN_OUTBOX_IDENTITY_INDEX.name,
        DOMAIN_OUTBOX_LEASE_INDEX.name,
      ].sort(),
    );
  });

  it('fails all SL-003 identity index writes when duplicate pending payOS attempts exist', async () => {
    const writes = [];
    const safeCollection = {
      aggregate() { return { async toArray() { return []; } }; },
      async indexes() { return []; },
      async createIndex(...args) { writes.push(args); },
    };
    const attemptCollection = {
      aggregate(pipeline) {
        const isPendingPayOS = pipeline[0]?.$match?.paymentStatus === 'Pending';
        return {
          async toArray() {
            return isPendingPayOS
              ? [{ _id: { orderId: 'order-1', paymentProvider: 'PAYOS', paymentStatus: 'Pending' }, count: 2 }]
              : [];
          },
        };
      },
      async indexes() { return []; },
      async createIndex(...args) { writes.push(args); },
    };

    await assert.rejects(
      () => ensureSl003IdentityIndexes({
        orderCollection: safeCollection,
        attemptCollection,
        domainOutboxCollection: safeCollection,
      }),
      /duplicate.*payos|pending payos.*duplicate/i,
    );
    assert.deepEqual(writes, []);
  });

  it('wires every dependent collection through the production CLI transaction', async () => {
    const requestedCollections = [];
    const createdIndexes = [];
    const emptyIndexedCollection = (name) => ({
      aggregate() { return { async toArray() { return []; } }; },
      async indexes() { return []; },
      async createIndex(key, options) {
        createdIndexes.push({ name, key: clone(key), options: clone(options) });
      },
      find() { return { async toArray() { return []; } }; },
    });
    const collections = new Map();
    const collection = (name) => {
      requestedCollections.push(name);
      if (!collections.has(name)) collections.set(name, emptyIndexedCollection(name));
      return collections.get(name);
    };
    let transactionCalls = 0;
    let disconnected = false;
    const mongooseClient = {
      connection: { collection },
      async startSession() {
        return {
          async withTransaction(work) {
            transactionCalls += 1;
            return work();
          },
          async endSession() {},
        };
      },
      async disconnect() { disconnected = true; },
    };

    await runCli({
      loadEnv() {},
      connect: async () => {},
      mongooseClient,
      env: {},
      logger: { log() {}, table() {} },
    });

    assert.equal(transactionCalls, 1);
    assert.equal(disconnected, true);
    [
      'orders', 'orderreservations', 'orderdetails', 'inventories', 'payments',
      'paymentattempts', 'refundpendings', 'returnrefundrequests', 'domainoutboxes',
      'stockexportrequests',
    ].forEach((name) => assert.ok(requestedCollections.includes(name), `${name} must be wired`));
    assert.ok(createdIndexes.some((entry) => entry.name === 'returnrefundrequests'
      && entry.options.name === RETURN_REFUND_PHYSICAL_OPEN_INDEX.name));
    assert.ok(createdIndexes.some((entry) => entry.name === 'returnrefundrequests'
      && entry.options.name === RETURN_REFUND_OBLIGATION_INDEX.name));
  });

  it('backfills exact reservation lineage for active legacy orders and is repeat-safe', async () => {
    const orders = [{
      _id: 'legacy-pending',
      paymentMethod: 'COD',
      paymentStatus: 'Unpaid',
      orderStatus: 'Pending',
      createdAt: new Date('2026-07-23T09:00:00.000Z'),
    }];
    const details = [{
      _id: 'legacy-detail',
      orderId: 'legacy-pending',
      productId: 'product-1',
      quantity: 2,
    }];
    const reservations = [];
    const orderCollection = {
      find() { return { async toArray() { return clone(orders); } }; },
      async updateOne() { return { modifiedCount: 0 }; },
    };
    const orderDetailCollection = {
      find({ orderId }) {
        return {
          async toArray() {
            return clone(details.filter((detail) => detail.orderId === orderId));
          },
        };
      },
    };
    const orderReservationCollection = {
      aggregate() { return { async toArray() { return []; } }; },
      async indexes() { return []; },
      async createIndex() {},
      async findOne({ reservationKey }) {
        return clone(reservations.find((entry) => entry.reservationKey === reservationKey) || null);
      },
      async updateOne(filter, update) {
        const existing = reservations.find((entry) => entry.reservationKey === filter.reservationKey);
        if (existing) return { matchedCount: 1, modifiedCount: 0, upsertedCount: 0 };
        reservations.push(clone(update.$setOnInsert));
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      },
      find({ orderId, status }) {
        return {
          async toArray() {
            return clone(reservations.filter((entry) => entry.orderId === orderId && entry.status === status));
          },
        };
      },
    };
    const inventoryCollection = {
      async findOne({ productId }) {
        return productId === 'product-1' ? { productId, reservedQuantity: 2 } : null;
      },
    };

    const first = await migrateSl003OrderPaymentCancellation({
      collection: orderCollection,
      orderDetailCollection,
      orderReservationCollection,
      inventoryCollection,
    });
    const second = await migrateSl003OrderPaymentCancellation({
      collection: orderCollection,
      orderDetailCollection,
      orderReservationCollection,
      inventoryCollection,
    });

    assert.equal(first.reservationLineageBackfilled, 1);
    assert.equal(second.reservationLineageBackfilled, 0);
    assert.deepEqual(reservations, [{
      reservationKey: 'ORDER:legacy-pending:legacy-detail',
      orderId: 'legacy-pending',
      orderDetailId: 'legacy-detail',
      productId: 'product-1',
      quantity: 2,
      status: 'Reserved',
      reservedAt: new Date('2026-07-23T09:00:00.000Z'),
    }]);
  });

  it('fails before lineage writes when active legacy reservations exceed the aggregate inventory counter', async () => {
    const orders = [
      { _id: 'order-a', paymentMethod: 'COD', paymentStatus: 'Unpaid', orderStatus: 'Pending', createdAt: new Date('2026-07-23T09:00:00.000Z') },
      { _id: 'order-b', paymentMethod: 'COD', paymentStatus: 'Unpaid', orderStatus: 'Confirmed', createdAt: new Date('2026-07-23T09:05:00.000Z') },
    ];
    const details = [
      { _id: 'detail-a', orderId: 'order-a', productId: 'product-1', quantity: 2 },
      { _id: 'detail-b', orderId: 'order-b', productId: 'product-1', quantity: 2 },
    ];
    const writes = [];
    const orderReservationCollection = {
      aggregate() { return { async toArray() { return []; } }; },
      async indexes() { return []; },
      async createIndex() {},
      async findOne() { return null; },
      async updateOne(...args) { writes.push(args); return { upsertedCount: 1 }; },
    };

    await assert.rejects(
      () => migrateSl003OrderPaymentCancellation({
        collection: {
          find() { return { async toArray() { return clone(orders); } }; },
          async updateOne() { throw new Error('base Order writes must not run after failed lineage preflight'); },
        },
        orderDetailCollection: {
          find({ orderId }) {
            return { async toArray() { return clone(details.filter((detail) => detail.orderId === orderId)); } };
          },
        },
        orderReservationCollection,
        inventoryCollection: {
          async findOne() { return { productId: 'product-1', reservedQuantity: 3 }; },
        },
      }),
      /aggregate reserved inventory.*product-1|product-1.*reservation lineage/i,
    );
    assert.deepEqual(writes, []);
  });

  it('repairs existing Cancelled orders through the reservation ledger and dependent collections', async () => {
    const order = {
      _id: 'already-cancelled',
      paymentMethod: 'ONLINE',
      paymentStatus: 'Pending',
      orderStatus: 'Cancelled',
      createdAt: new Date('2026-07-23T09:00:00.000Z'),
    };
    let baseOrderWrites = 0;
    const orderCollection = {
      find() {
        return { async toArray() { return [clone(order)]; } };
      },
      async updateOne(filter, update) {
        assert.equal(filter.orderStatus, 'Cancelled');
        assert.equal(filter.paymentStatus, 'Pending');
        assert.equal(update.$set.paymentStatus, 'Cancelled');
        order.paymentStatus = 'Cancelled';
        baseOrderWrites += 1;
        return { modifiedCount: 1 };
      },
    };
    const reservation = { _id: 'reservation-1', orderId: order._id, productId: 'product-1', quantity: 2, status: 'Reserved' };
    const reservationCollection = {
      indexes: async () => [],
      aggregate: () => ({ async toArray() { return []; } }),
      async createIndex(key, options) {
        this.createdIndexes = this.createdIndexes || [];
        this.createdIndexes.push({ key, options });
      },
      find() {
        return { async toArray() { return reservation.status === 'Reserved' ? [reservation] : []; } };
      },
      async updateOne(filter, update) {
        if (filter.status === reservation.status) {
          Object.assign(reservation, update.$set);
          return { matchedCount: 1, modifiedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      },
    };
    const inventoryCollection = {
      async updateOne() { return { matchedCount: 1, modifiedCount: 1 }; },
    };
    const paymentCollection = {
      async updateMany() { return { modifiedCount: 1 }; },
    };
    const attemptCollection = {
      async updateMany() { return { modifiedCount: 1 }; },
    };
    const refundCollection = {
      async createIndex() {},
    };

    const result = await migrateSl003OrderPaymentCancellation({
      collection: orderCollection,
      reservationCollection,
      inventoryCollection,
      paymentCollection,
      attemptCollection,
      refundCollection,
    });

    assert.equal(result.scanned, 1);
    assert.equal(result.cancelledPaymentNormalized, 1);
    assert.equal(baseOrderWrites, 1);
    assert.equal(result.reservationsReleased, 1);
    assert.equal(result.paymentsCancelled, 1);
    assert.equal(result.attemptsRetired, 1);
    assert.equal(result.orderReservationIndexesEnsured, 1);
    assert.equal(reservation.status, 'Released');
    assert.equal(reservationCollection.createdIndexes.length, 2);
  });
});
