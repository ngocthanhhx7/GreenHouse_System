const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  LEGACY_ORDER_INDEX_NAME,
  TARGET_INDEXES,
  migrateCodReconciliation,
} = require('./migrateCodReconciliation');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeCollection(name, documents, initialIndexes = []) {
  const indexes = [{ key: { _id: 1 }, name: '_id_' }, ...initialIndexes];
  const calls = { dropped: [], created: [], bulkWrites: [] };
  return {
    name,
    documents,
    calls,
    async indexes() { return clone(indexes); },
    find() {
      return { async toArray() { return clone(documents); } };
    },
    async bulkWrite(operations) {
      calls.bulkWrites.push(operations);
      for (const operation of operations) {
        const id = String(operation.updateOne.filter._id);
        const document = documents.find((entry) => String(entry._id) === id);
        Object.assign(document, operation.updateOne.update.$set);
      }
      return { modifiedCount: operations.length };
    },
    async dropIndex(indexName) {
      calls.dropped.push(indexName);
      const index = indexes.findIndex((entry) => entry.name === indexName);
      if (index >= 0) indexes.splice(index, 1);
    },
    async createIndex(key, options = {}) {
      calls.created.push({ key, options });
      indexes.push({ key, ...options });
      return options.name;
    },
  };
}

function makeCollections({ duplicate = false } = {}) {
  return {
    orders: makeCollection('orders', [
      { _id: 'order-1', paymentMethod: 'COD', totalAmount: 125 },
      { _id: 'order-2', paymentMethod: 'ONLINE', totalAmount: 80, orderStatus: 'Delivered', deliveredAt: '2026-07-20T10:00:00.000Z' },
    ]),
    refunds: makeCollection('refundpendings', [{ _id: 'refund-1', orderId: 'order-1', amount: 125, reason: 'legacy' }], [
      { key: { orderId: 1 }, name: LEGACY_ORDER_INDEX_NAME, unique: true },
    ]),
    returnRequests: makeCollection('returnrefundrequests', [], [
      { key: { orderId: 1 }, name: LEGACY_ORDER_INDEX_NAME, unique: true },
    ]),
    codEvidence: makeCollection('codevidences', duplicate
      ? [{ _id: 'e1', orderId: 'order-1', eventType: 'COLLECTION' }, { _id: 'e2', orderId: 'order-1', eventType: 'COLLECTION' }]
      : []),
    recoveryReceipts: makeCollection('codrecoveryreceipts', []),
    refundDestinations: makeCollection('refunddestinations', []),
    payoutEvidence: makeCollection('refundpayoutevidences', []),
    payoutIncidents: makeCollection('refundpayoutincidents', []),
    inventoryTransactions: makeCollection('inventorytransactions', []),
  };
}

describe('COD reconciliation migration', () => {
  it('backfills fixed COD expectations, gives legacy refunds explicit identities, and installs v2 indexes', async () => {
    const collections = makeCollections();
    const result = await migrateCodReconciliation({ collections });

    assert.equal(collections.orders.documents[0].codExpectedAmount, 125);
    assert.equal(new Date(collections.orders.documents[1].returnDeadlineAt).toISOString(), '2026-07-25T10:00:00.000Z');
    assert.equal(collections.refunds.documents[0].obligationType, 'LEGACY');
    assert.equal(collections.refunds.documents[0].obligationKey, 'LEGACY_REFUND:refund-1');
    assert.deepEqual(collections.refunds.calls.dropped, [LEGACY_ORDER_INDEX_NAME]);
    assert.deepEqual(collections.returnRequests.calls.dropped, [LEGACY_ORDER_INDEX_NAME]);
    assert.ok(collections.refunds.calls.created.some((entry) => entry.options.name === 'refund_pending_obligation_key'));
    assert.ok(collections.codEvidence.calls.created.some((entry) => entry.options.name === 'cod_evidence_one_collection_per_order'));
    assert.ok(collections.recoveryReceipts.calls.created.some((entry) => entry.options.name === 'cod_recovery_one_receipt_per_order'));
    assert.ok(collections.refundDestinations.calls.created.some((entry) => entry.options.name === 'refund_destination_version_unique'));
    assert.ok(collections.payoutEvidence.calls.created.some((entry) => entry.options.name === 'refund_payout_idempotency_unique'));
    assert.ok(collections.payoutIncidents.calls.created.some((entry) => entry.options.name === 'refund_payout_incident_key'));
    assert.ok(collections.inventoryTransactions.calls.created.some((entry) => entry.options.name === 'inventory_movement_key_unique'));
    assert.equal(result.ordersBackfilled, 1);
    assert.equal(result.returnDeadlinesBackfilled, 1);
    assert.equal(result.legacyRefundsBackfilled, 1);
  });

  it('stops before dropping indexes when existing collection evidence violates the one-collection invariant', async () => {
    const collections = makeCollections({ duplicate: true });
    await assert.rejects(
      () => migrateCodReconciliation({ collections }),
      /more than one collection evidence/i,
    );
    assert.deepEqual(collections.refunds.calls.dropped, []);
    assert.deepEqual(collections.returnRequests.calls.dropped, []);
  });

  it('is idempotent when the target indexes already exist', async () => {
    const collections = makeCollections();
    await migrateCodReconciliation({ collections });

    const secondRun = await migrateCodReconciliation({ collections });

    assert.equal(secondRun.ordersBackfilled, 0);
    assert.equal(secondRun.returnDeadlinesBackfilled, 0);
    assert.equal(secondRun.legacyRefundsBackfilled, 0);
    assert.equal(secondRun.refundLegacyIndexDropped, false);
    assert.equal(secondRun.returnLegacyIndexDropped, false);
    assert.equal(secondRun.returnTargetIndexReplaced, false);
    assert.deepEqual(secondRun.indexesCreated, {
      refunds: 0,
      returnRequests: 0,
      codEvidence: 0,
      recoveryReceipts: 0,
      refundDestinations: 0,
      payoutEvidence: 0,
      payoutIncidents: 0,
      inventoryTransactions: 0,
    });
  });

  it('safely replaces the older named open-request index after checking the expanded lifecycle', async () => {
    const collections = makeCollections();
    collections.returnRequests = makeCollection('returnrefundrequests', [], [{
      key: { orderId: 1 },
      name: 'return_refund_one_open_request_per_order_v2',
      unique: true,
      partialFilterExpression: { status: { $in: ['Pending', 'AwaitingInspection', 'ReadyForRefund'] } },
    }]);

    const result = await migrateCodReconciliation({ collections });

    assert.equal(result.returnTargetIndexReplaced, true);
    assert.deepEqual(collections.returnRequests.calls.dropped, ['return_refund_one_open_request_per_order_v2']);
    assert.ok(collections.returnRequests.calls.created.some((entry) => entry.options.name === 'return_refund_one_open_request_per_order_v2'));
  });
});
