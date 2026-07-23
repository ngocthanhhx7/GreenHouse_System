const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');

const LEGACY_ORDER_INDEX_NAME = 'orderId_1';
const OPEN_RETURN_STATUSES = [
  'New', 'Pending', 'AwaitingCODReconciliation', 'Approved',
  'AwaitingInspection', 'Received', 'ReadyForRefund', 'CODRecoveryInProgress',
];

const TARGET_INDEXES = Object.freeze({
  refunds: Object.freeze([
    Object.freeze([{ orderId: 1, obligationType: 1 }, { name: 'refund_pending_obligations_by_order_type' }]),
    Object.freeze([{ returnRefundRequestId: 1, obligationType: 1 }, { name: 'refund_pending_by_return_request_type' }]),
    Object.freeze([{ obligationKey: 1 }, { unique: true, partialFilterExpression: { obligationKey: { $type: 'string', $gt: '' } }, name: 'refund_pending_obligation_key' }]),
  ]),
  returnRequests: Object.freeze([
    Object.freeze([{ orderId: 1 }, { unique: true, partialFilterExpression: { status: { $in: OPEN_RETURN_STATUSES } }, name: 'return_refund_one_open_request_per_order_v2' }]),
  ]),
  codEvidence: Object.freeze([
    Object.freeze([{ orderId: 1 }, { unique: true, partialFilterExpression: { eventType: 'COLLECTION' }, name: 'cod_evidence_one_collection_per_order' }]),
    Object.freeze([{ eventId: 1 }, { unique: true, name: 'cod_evidence_event_id' }]),
  ]),
  recoveryReceipts: Object.freeze([
    Object.freeze([{ orderId: 1 }, { unique: true, name: 'cod_recovery_one_receipt_per_order' }]),
    Object.freeze([{ receiptId: 1 }, { unique: true, name: 'cod_recovery_receipt_id' }]),
  ]),
  refundDestinations: Object.freeze([
    Object.freeze([{ returnRefundRequestId: 1, version: 1 }, { unique: true, name: 'refund_destination_version_unique' }]),
    Object.freeze([{ returnRefundRequestId: 1, idempotencyKey: 1 }, { unique: true, name: 'refund_destination_idempotency_unique' }]),
    Object.freeze([{ returnRefundRequestId: 1, status: 1, createdAt: -1 }, { name: 'refund_destination_request_status_created' }]),
  ]),
  payoutEvidence: Object.freeze([
    Object.freeze([{ idempotencyKey: 1 }, { unique: true, name: 'refund_payout_idempotency_unique' }]),
    Object.freeze([{ returnRefundRequestId: 1, createdAt: -1 }, { name: 'refund_payout_request_created' }]),
    Object.freeze([{ refundPendingId: 1, status: 1, createdAt: -1 }, { name: 'refund_payout_obligation_status_created' }]),
  ]),
  payoutIncidents: Object.freeze([
    Object.freeze([{ incidentKey: 1 }, { unique: true, name: 'refund_payout_incident_key' }]),
    Object.freeze([{ payoutEvidenceId: 1, cause: 1 }, { unique: true, name: 'refund_payout_incident_evidence_cause' }]),
    Object.freeze([{ returnRefundRequestId: 1, status: 1, createdAt: -1 }, { name: 'refund_payout_incident_request_status_created' }]),
  ]),
  inventoryTransactions: Object.freeze([
    Object.freeze([{ movementKey: 1 }, { unique: true, partialFilterExpression: { movementKey: { $type: 'string', $gt: '' } }, name: 'inventory_movement_key_unique' }]),
  ]),
});

function sameJson(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function sameKey(left, right) {
  return sameJson(left, right);
}

function indexMatchesDefinition(index, [key, options]) {
  return sameKey(index?.key, key)
    && Boolean(index?.unique) === Boolean(options?.unique)
    && sameJson(index?.partialFilterExpression, options?.partialFilterExpression);
}

async function listIndexes(collection) {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

async function readAll(collection) {
  const cursor = collection.find({});
  if (typeof cursor.toArray === 'function') return cursor.toArray();
  const documents = [];
  for await (const document of cursor) documents.push(document);
  return documents;
}

function idOf(document) {
  return String(document?._id || '');
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function assertExistingCodExpectations(orders) {
  for (const order of orders) {
    if (order.paymentMethod !== 'COD') continue;
    const total = Number(order.totalAmount);
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error(`COD order ${idOf(order)} has an invalid totalAmount; migration stopped`);
    }
    if (!isMissing(order.codExpectedAmount) && Number(order.codExpectedAmount) !== total) {
      throw new Error(`COD order ${idOf(order)} has codExpectedAmount different from totalAmount; manual reconciliation is required`);
    }
  }
}

function assertDeliveredOrderTimestamps(orders) {
  for (const order of orders) {
    if (order.orderStatus !== 'Delivered' || !isMissing(order.returnDeadlineAt)) continue;
    const deliveredAt = new Date(order.deliveredAt);
    if (Number.isNaN(deliveredAt.getTime())) {
      throw new Error(`Delivered order ${idOf(order)} has no valid deliveredAt; return deadline requires manual reconciliation`);
    }
  }
}

function assertNoDuplicateCollectionEvidence(evidence) {
  const seen = new Set();
  for (const event of evidence) {
    if (event.eventType !== 'COLLECTION') continue;
    const orderId = idOf(event.orderId);
    if (seen.has(orderId)) throw new Error(`Order ${orderId} has more than one collection evidence; migration stopped`);
    seen.add(orderId);
  }
}

function assertNoDuplicateObligationKeys(refunds) {
  const seen = new Set();
  for (const refund of refunds) {
    if (isMissing(refund.obligationKey)) continue;
    const key = String(refund.obligationKey);
    if (seen.has(key)) throw new Error(`Refund obligation key ${key} is duplicated; migration stopped`);
    seen.add(key);
  }
}

function assertNoDuplicateOpenRequests(requests) {
  const seen = new Set();
  for (const request of requests) {
    if (!OPEN_RETURN_STATUSES.includes(request.status)) continue;
    const orderId = idOf(request.orderId);
    if (seen.has(orderId)) throw new Error(`Order ${orderId} has more than one open return/refund request; migration stopped`);
    seen.add(orderId);
  }
}

async function backfillOrders(collection, orders) {
  const operations = [];
  let ordersBackfilled = 0;
  let returnDeadlinesBackfilled = 0;
  for (const order of orders) {
    const fields = {};
    if (order.paymentMethod === 'COD' && isMissing(order.codExpectedAmount)) {
      fields.codExpectedAmount = Number(order.totalAmount);
      ordersBackfilled += 1;
    }
    if (order.orderStatus === 'Delivered' && isMissing(order.returnDeadlineAt)) {
      fields.returnDeadlineAt = new Date(new Date(order.deliveredAt).getTime() + (5 * 24 * 60 * 60 * 1000));
      returnDeadlinesBackfilled += 1;
    }
    if (Object.keys(fields).length) {
      operations.push({ updateOne: { filter: { _id: order._id }, update: { $set: fields } } });
    }
  }
  if (operations.length) await collection.bulkWrite(operations, { ordered: true });
  return { ordersBackfilled, returnDeadlinesBackfilled };
}

async function backfillLegacyRefunds(collection, refunds) {
  const operations = refunds
    .filter((refund) => isMissing(refund.obligationKey))
    .map((refund) => ({
      updateOne: {
        filter: { _id: refund._id },
        update: {
          $set: {
            obligationType: ['PAYMENT_REVERSAL', 'NORMAL_RETURN', 'COD_RECOVERY', 'EXCESS_PAYMENT'].includes(refund.obligationType)
              ? refund.obligationType
              : 'LEGACY',
            obligationKey: `LEGACY_REFUND:${idOf(refund)}`,
          },
        },
      },
    }));
  if (operations.length) await collection.bulkWrite(operations, { ordered: true });
  return operations.length;
}

function assertLegacyIndexShape(index, collectionLabel) {
  if (!index || !sameKey(index.key, { orderId: 1 }) || index.unique !== true) {
    throw new Error(`Unexpected legacy ${collectionLabel} orderId index; inspect indexes before migration`);
  }
}

async function dropLegacyOrderIndex(collection, collectionLabel, allowedDefinitions = []) {
  const indexes = await listIndexes(collection);
  const legacy = indexes.find((index) => index.name === LEGACY_ORDER_INDEX_NAME);
  if (legacy) {
    assertLegacyIndexShape(legacy, collectionLabel);
    await collection.dropIndex(LEGACY_ORDER_INDEX_NAME);
    return true;
  }
  const unknownUniqueOrderIndex = indexes.find((index) => (
    sameKey(index.key, { orderId: 1 })
    && index.unique === true
    && !allowedDefinitions.some((definition) => indexMatchesDefinition(index, definition))
  ));
  if (unknownUniqueOrderIndex) {
    throw new Error(`Unexpected unique ${collectionLabel} orderId index ${unknownUniqueOrderIndex.name}; inspect indexes before migration`);
  }
  return false;
}

async function ensureIndexes(collection, definitions) {
  let created = 0;
  const indexes = await listIndexes(collection);
  for (const definition of definitions) {
    const [key, options] = definition;
    const equivalent = indexes.find((index) => indexMatchesDefinition(index, definition));
    if (equivalent) continue;
    const named = indexes.find((index) => index.name === options.name);
    if (named) throw new Error(`Index ${options.name} exists with a different definition; migration stopped`);
    await collection.createIndex(key, options);
    indexes.push({ key, ...options });
    created += 1;
  }
  return created;
}

async function dropMismatchedNamedTarget(collection, definition) {
  const [key, options] = definition;
  const indexes = await listIndexes(collection);
  const named = indexes.find((index) => index.name === options.name);
  if (!named || indexMatchesDefinition(named, definition)) return false;
  if (!sameKey(named.key, key) || Boolean(named.unique) !== Boolean(options.unique)) {
    throw new Error(`Index ${options.name} has an unexpected key or uniqueness; inspect indexes before migration`);
  }
  await collection.dropIndex(options.name);
  return true;
}

async function migrateCodReconciliation({ collections }) {
  if (!collections?.orders || !collections?.refunds || !collections?.returnRequests || !collections?.codEvidence
    || !collections?.recoveryReceipts || !collections?.refundDestinations || !collections?.payoutEvidence || !collections?.payoutIncidents
    || !collections?.inventoryTransactions) {
    throw new Error('All COD and SL-001 reconciliation collections are required');
  }

  const [orders, refunds, returnRequests, evidence] = await Promise.all([
    readAll(collections.orders), readAll(collections.refunds), readAll(collections.returnRequests), readAll(collections.codEvidence),
  ]);
  assertExistingCodExpectations(orders);
  assertDeliveredOrderTimestamps(orders);
  assertNoDuplicateCollectionEvidence(evidence);
  assertNoDuplicateObligationKeys(refunds);
  assertNoDuplicateOpenRequests(returnRequests);

  const { ordersBackfilled, returnDeadlinesBackfilled } = await backfillOrders(collections.orders, orders);
  const legacyRefundsBackfilled = await backfillLegacyRefunds(collections.refunds, refunds);
  const returnTargetIndexReplaced = await dropMismatchedNamedTarget(collections.returnRequests, TARGET_INDEXES.returnRequests[0]);
  const refundLegacyIndexDropped = await dropLegacyOrderIndex(collections.refunds, 'RefundPending');
  const returnLegacyIndexDropped = await dropLegacyOrderIndex(
    collections.returnRequests,
    'ReturnRefundRequest',
    TARGET_INDEXES.returnRequests,
  );
  const indexesCreated = {
    refunds: await ensureIndexes(collections.refunds, TARGET_INDEXES.refunds),
    returnRequests: await ensureIndexes(collections.returnRequests, TARGET_INDEXES.returnRequests),
    codEvidence: await ensureIndexes(collections.codEvidence, TARGET_INDEXES.codEvidence),
    recoveryReceipts: await ensureIndexes(collections.recoveryReceipts, TARGET_INDEXES.recoveryReceipts),
    refundDestinations: await ensureIndexes(collections.refundDestinations, TARGET_INDEXES.refundDestinations),
    payoutEvidence: await ensureIndexes(collections.payoutEvidence, TARGET_INDEXES.payoutEvidence),
    payoutIncidents: await ensureIndexes(collections.payoutIncidents, TARGET_INDEXES.payoutIncidents),
    inventoryTransactions: await ensureIndexes(collections.inventoryTransactions, TARGET_INDEXES.inventoryTransactions),
  };

  return {
    ordersBackfilled,
    returnDeadlinesBackfilled,
    legacyRefundsBackfilled,
    refundLegacyIndexDropped,
    returnLegacyIndexDropped,
    returnTargetIndexReplaced,
    indexesCreated,
  };
}

async function runCli() {
  require('dotenv').config();
  await connectDatabase();
  const collections = {
    orders: mongoose.connection.collection('orders'),
    refunds: mongoose.connection.collection('refundpendings'),
    returnRequests: mongoose.connection.collection('returnrefundrequests'),
    codEvidence: mongoose.connection.collection('codevidences'),
    recoveryReceipts: mongoose.connection.collection('codrecoveryreceipts'),
    refundDestinations: mongoose.connection.collection('refunddestinations'),
    payoutEvidence: mongoose.connection.collection('refundpayoutevidences'),
    payoutIncidents: mongoose.connection.collection('refundpayoutincidents'),
    inventoryTransactions: mongoose.connection.collection('inventorytransactions'),
  };
  try {
    const result = await migrateCodReconciliation({ collections });
    console.log('COD reconciliation migration completed.');
    console.table([result]);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('COD reconciliation migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  LEGACY_ORDER_INDEX_NAME,
  OPEN_RETURN_STATUSES,
  TARGET_INDEXES,
  migrateCodReconciliation,
  indexMatchesDefinition,
  listIndexes,
  dropMismatchedNamedTarget,
};
