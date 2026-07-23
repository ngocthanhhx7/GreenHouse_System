const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');

const DEFAULT_PAYMENT_TIMEOUT_MINUTES = 15;
const MINUTE_MS = 60 * 1000;
const PRE_CONFIRMATION_STATUSES = Object.freeze(['Pending', 'WaitingForPayment']);
const RESERVATION_OWNING_STATUSES = Object.freeze([
  'Pending',
  'WaitingForPayment',
  'Confirmed',
  'StockExportRequested',
  // Expired is migrated to Cancelled only after its owned reservation has
  // been reconstructed and released in the same transaction.
  'Expired',
]);
const MISSING_DEADLINE_FILTER = Object.freeze([
  Object.freeze({ paymentDeadlineAt: Object.freeze({ $exists: false }) }),
  Object.freeze({ paymentDeadlineAt: null }),
  Object.freeze({ paymentDeadlineAt: '' }),
]);
const STOCK_EXPORT_OPEN_INDEX = Object.freeze({
  key: Object.freeze({ orderId: 1 }),
  name: 'stock_export_one_open_per_order',
  partialFilterExpression: Object.freeze({
    status: Object.freeze({ $in: Object.freeze(['Pending', 'Approved', 'Processing']) }),
  }),
});
const ORDER_RESERVATION_INDEXES = Object.freeze([
  Object.freeze({
    key: Object.freeze({ reservationKey: 1 }),
    name: 'order_reservation_key_unique',
    unique: true,
  }),
  Object.freeze({
    key: Object.freeze({ orderId: 1, status: 1 }),
    name: 'order_reservation_order_status',
    unique: false,
  }),
]);
const ORDER_CHECKOUT_IDEMPOTENCY_INDEX = Object.freeze({
  key: Object.freeze({ customerId: 1, idempotencyKey: 1 }),
  name: 'order_checkout_idempotency_key',
  unique: true,
  partialFilterExpression: Object.freeze({
    idempotencyKey: Object.freeze({ $type: 'string', $gt: '' }),
  }),
  duplicateMatch: Object.freeze({
    idempotencyKey: Object.freeze({ $type: 'string', $gt: '' }),
  }),
  duplicateGroup: Object.freeze({
    customerId: '$customerId',
    idempotencyKey: '$idempotencyKey',
  }),
  duplicateLabel: 'checkout idempotency identity',
});
const PAYMENT_ATTEMPT_PROVIDER_ORDER_INDEX = Object.freeze({
  key: Object.freeze({ paymentProvider: 1, providerOrderCode: 1 }),
  name: 'payment_attempt_provider_order_code',
  unique: true,
  partialFilterExpression: Object.freeze({
    providerOrderCode: Object.freeze({ $type: 'number' }),
  }),
  duplicateMatch: Object.freeze({
    providerOrderCode: Object.freeze({ $type: 'number' }),
  }),
  duplicateGroup: Object.freeze({
    paymentProvider: '$paymentProvider',
    providerOrderCode: '$providerOrderCode',
  }),
  duplicateLabel: 'payment provider order identity',
});
const PAYMENT_ATTEMPT_ONE_PENDING_INDEX = Object.freeze({
  key: Object.freeze({ orderId: 1, paymentProvider: 1, paymentStatus: 1 }),
  name: 'payment_attempt_one_pending_payos_link',
  unique: true,
  partialFilterExpression: Object.freeze({
    paymentProvider: 'PAYOS',
    paymentStatus: 'Pending',
  }),
  duplicateMatch: Object.freeze({
    paymentProvider: 'PAYOS',
    paymentStatus: 'Pending',
  }),
  duplicateGroup: Object.freeze({
    orderId: '$orderId',
    paymentProvider: '$paymentProvider',
    paymentStatus: '$paymentStatus',
  }),
  duplicateLabel: 'pending payOS attempt identity',
});
const DOMAIN_OUTBOX_IDENTITY_INDEX = Object.freeze({
  key: Object.freeze({ identityKey: 1 }),
  name: 'identityKey_1',
  unique: true,
  duplicateMatch: Object.freeze({}),
  duplicateGroup: '$identityKey',
  duplicateLabel: 'domain outbox identity',
});
const DOMAIN_OUTBOX_LEASE_INDEX = Object.freeze({
  key: Object.freeze({ status: 1, processingStartedAt: 1, createdAt: 1 }),
  name: 'domain_outbox_status_lease',
  unique: false,
});
const REFUND_PENDING_OBLIGATION_INDEX = Object.freeze({
  key: Object.freeze({ obligationKey: 1 }),
  name: 'refund_pending_obligation_key',
  partialFilterExpression: Object.freeze({ obligationKey: Object.freeze({ $type: 'string', $gt: '' }) }),
});
const RETURN_REFUND_PHYSICAL_OPEN_INDEX = Object.freeze({
  key: Object.freeze({ orderId: 1 }),
  name: 'return_refund_one_open_physical_per_order_v3',
  partialFilterExpression: Object.freeze({
    status: Object.freeze({
      $in: Object.freeze([
        'New', 'Pending', 'AwaitingCODReconciliation', 'Approved',
        'AwaitingInspection', 'Received', 'ReadyForRefund', 'CODRecoveryInProgress',
      ]),
    }),
    obligationKey: Object.freeze({ $in: Object.freeze(['', null]) }),
  }),
});
const RETURN_REFUND_OBLIGATION_INDEX = Object.freeze({
  key: Object.freeze({ orderId: 1, obligationKey: 1 }),
  name: 'return_refund_obligation_identity',
  partialFilterExpression: Object.freeze({ obligationKey: Object.freeze({ $type: 'string', $gt: '' }) }),
});
const LEGACY_RETURN_REFUND_OPEN_INDEX = 'return_refund_one_open_request_per_order_v2';

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function validatePaymentTimeoutMinutes(value) {
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new Error('paymentTimeoutMinutes must be a positive integer');
  }
  return timeout;
}

function buildLegacyRepairPlan(order = {}) {
  const expired = ['Expired', 'Cancelled'].includes(String(order.orderStatus));
  const paymentPending = ['Pending', 'WaitingForPayment', 'Failed'].includes(String(order.paymentStatus));
  return {
    orderUpdate: expired
      ? {
          orderStatus: 'Cancelled',
          paymentStatus: paymentPending ? 'Cancelled' : order.paymentStatus,
        }
      : {},
    releaseReservations: expired,
    retireActiveAttempts: expired || paymentPending,
  };
}

function sessionOptions(session) {
  return session ? { session } : undefined;
}

function sameIdentity(left, right) {
  return String(left) === String(right);
}

async function buildReservationLineageBackfill({
  orders,
  orderDetailCollection,
  reservationCollection,
  inventoryCollection,
  session,
}) {
  if (!orderDetailCollection || !reservationCollection) {
    return { inserts: [], requiredByProduct: new Map() };
  }

  const inserts = [];
  const requiredByProduct = new Map();
  for (const order of orders) {
    if (!RESERVATION_OWNING_STATUSES.includes(String(order.orderStatus))) continue;
    const details = await orderDetailCollection.find(
      { orderId: order._id },
      sessionOptions(session)
    ).toArray();
    if (!details.length) {
      throw new Error(`Order ${String(order._id)} has no details for reservation lineage backfill`);
    }
    const reservedAt = new Date(order.createdAt);
    if (Number.isNaN(reservedAt.getTime())) {
      throw new Error(`Order ${String(order._id)} requires a valid createdAt for reservation lineage backfill`);
    }

    for (const detail of details) {
      const quantity = Number(detail.quantity);
      if (!detail._id || !detail.productId || !Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`Order ${String(order._id)} has an invalid detail for reservation lineage backfill`);
      }
      const reservationKey = `ORDER:${String(order._id)}:${String(detail._id)}`;
      const existing = reservationCollection.findOne
        ? await reservationCollection.findOne({ reservationKey }, sessionOptions(session))
        : null;
      if (existing) {
        const compatible = sameIdentity(existing.orderId, order._id)
          && sameIdentity(existing.orderDetailId, detail._id)
          && sameIdentity(existing.productId, detail.productId)
          && Number(existing.quantity) === quantity;
        if (!compatible) {
          throw new Error(`Reservation ${reservationKey} has incompatible immutable lineage`);
        }
        if (existing.status !== 'Reserved') {
          throw new Error(`Active order ${String(order._id)} reservation ${reservationKey} is not Reserved`);
        }
      } else {
        inserts.push({
          reservationKey,
          orderId: order._id,
          orderDetailId: detail._id,
          productId: detail.productId,
          quantity,
          status: 'Reserved',
          reservedAt,
        });
      }
      const productKey = String(detail.productId);
      const required = requiredByProduct.get(productKey) || {
        productId: detail.productId,
        quantity: 0,
      };
      required.quantity += quantity;
      requiredByProduct.set(productKey, required);
    }
  }

  if (requiredByProduct.size && (!inventoryCollection || !inventoryCollection.findOne)) {
    throw new Error('Inventory collection is required to verify active reservation lineage');
  }
  for (const { productId, quantity } of requiredByProduct.values()) {
    const inventory = await inventoryCollection.findOne(
      { productId },
      sessionOptions(session)
    );
    if (!inventory || Number(inventory.reservedQuantity) < quantity) {
      throw new Error(
        `Aggregate reserved inventory for product ${String(productId)} is below active order reservation lineage`
      );
    }
  }
  return { inserts, requiredByProduct };
}

async function readIndexes(collection) {
  try {
    return await collection.indexes();
  } catch (error) {
    if (!['NamespaceNotFound', 'ns not found'].includes(error?.codeName)
      && !/namespace.*not found/i.test(String(error?.message || ''))) {
      throw error;
    }
    return [];
  }
}

async function ensureSl003IdentityIndexes({
  orderCollection,
  attemptCollection,
  domainOutboxCollection,
} = {}) {
  const targets = [
    { collection: orderCollection, definition: ORDER_CHECKOUT_IDEMPOTENCY_INDEX },
    { collection: attemptCollection, definition: PAYMENT_ATTEMPT_PROVIDER_ORDER_INDEX },
    { collection: attemptCollection, definition: PAYMENT_ATTEMPT_ONE_PENDING_INDEX },
    { collection: domainOutboxCollection, definition: DOMAIN_OUTBOX_IDENTITY_INDEX },
    { collection: domainOutboxCollection, definition: DOMAIN_OUTBOX_LEASE_INDEX },
  ].filter((target) => target.collection);

  // Preflight every identity before creating any index so one duplicate set
  // cannot leave a partially upgraded identity surface.
  for (const { collection, definition } of targets) {
    if (!definition.unique) continue;
    if (!collection.aggregate) continue;
    const duplicates = await collection.aggregate([
      { $match: definition.duplicateMatch },
      { $group: { _id: definition.duplicateGroup, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();
    if (duplicates.length) {
      throw new Error(
        `Duplicate ${definition.duplicateLabel} ${JSON.stringify(duplicates[0]._id)}`
      );
    }
  }

  const created = [];
  for (const { collection, definition } of targets) {
    const indexes = collection.indexes ? await readIndexes(collection) : [];
    const existingByName = indexes.find((index) => index.name === definition.name);
    const compatibleByKey = indexes.find((index) => (
      Boolean(index.unique) === Boolean(definition.unique)
      && JSON.stringify(index.key) === JSON.stringify(definition.key)
      && JSON.stringify(index.partialFilterExpression || null)
        === JSON.stringify(definition.partialFilterExpression || null)
    ));
    if (existingByName) {
      const compatible = Boolean(existingByName.unique) === Boolean(definition.unique)
        && JSON.stringify(existingByName.key) === JSON.stringify(definition.key)
        && JSON.stringify(existingByName.partialFilterExpression || null)
          === JSON.stringify(definition.partialFilterExpression || null);
      if (!compatible) throw new Error(`${definition.name} exists with an incompatible definition`);
      continue;
    }
    if (compatibleByKey || !collection.createIndex) continue;
    await collection.createIndex(definition.key, {
      name: definition.name,
      ...(definition.unique ? { unique: true } : {}),
      ...(definition.partialFilterExpression
        ? { partialFilterExpression: definition.partialFilterExpression }
        : {}),
    });
    created.push(definition.name);
  }
  return { created, checked: targets.map(({ definition }) => definition.name) };
}

async function ensureOrderReservationIndexes({ collection } = {}) {
  if (!collection) throw new Error('An order reservation collection is required');
  if (collection.aggregate) {
    const duplicates = await collection.aggregate([
      { $match: { reservationKey: { $type: 'string', $gt: '' } } },
      { $group: { _id: '$reservationKey', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();
    if (duplicates.length) {
      throw new Error(`Duplicate order reservation key ${String(duplicates[0]._id)}`);
    }
  }
  const indexes = collection.indexes ? await readIndexes(collection) : [];
  const ensured = [];
  for (const definition of ORDER_RESERVATION_INDEXES) {
    const existing = indexes.find((index) => index.name === definition.name);
    if (existing) {
      const compatible = existing.unique === Boolean(definition.unique)
        && JSON.stringify(existing.key) === JSON.stringify(definition.key);
      if (!compatible) throw new Error(`${definition.name} exists with an incompatible definition`);
      continue;
    }
    if (!collection.createIndex) continue;
    await collection.createIndex(definition.key, {
      name: definition.name,
      unique: Boolean(definition.unique),
    });
    ensured.push(definition.name);
  }
  return { created: ensured, checked: ORDER_RESERVATION_INDEXES.map((index) => index.name) };
}

async function ensureRefundPendingObligationIndex({ collection } = {}) {
  if (!collection) return { ensured: false };
  if (collection.aggregate) {
    const duplicates = await collection.aggregate([
      { $match: REFUND_PENDING_OBLIGATION_INDEX.partialFilterExpression },
      { $group: { _id: '$obligationKey', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();
    if (duplicates.length) throw new Error(`Duplicate refund obligation key ${String(duplicates[0]._id)}`);
  }
  const indexes = collection.indexes ? await readIndexes(collection) : [];
  const existing = indexes.find((index) => index.name === REFUND_PENDING_OBLIGATION_INDEX.name);
  if (existing) {
    const compatible = existing.unique === true
      && JSON.stringify(existing.key) === JSON.stringify(REFUND_PENDING_OBLIGATION_INDEX.key)
      && JSON.stringify(existing.partialFilterExpression) === JSON.stringify(REFUND_PENDING_OBLIGATION_INDEX.partialFilterExpression);
    if (!compatible) throw new Error(`${REFUND_PENDING_OBLIGATION_INDEX.name} exists with an incompatible definition`);
    return { ensured: true, created: false };
  }
  if (!collection.createIndex) return { ensured: false };
  await collection.createIndex(REFUND_PENDING_OBLIGATION_INDEX.key, {
    unique: true,
    partialFilterExpression: REFUND_PENDING_OBLIGATION_INDEX.partialFilterExpression,
    name: REFUND_PENDING_OBLIGATION_INDEX.name,
  });
  return { ensured: true, created: true };
}

async function ensureReturnRefundRequestIndexes({ collection } = {}) {
  if (!collection) return { ensured: false, created: [], dropped: [] };
  if (collection.aggregate) {
    const obligationDuplicates = await collection.aggregate([
      { $match: RETURN_REFUND_OBLIGATION_INDEX.partialFilterExpression },
      { $group: { _id: { orderId: '$orderId', obligationKey: '$obligationKey' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();
    if (obligationDuplicates.length) {
      throw new Error(`Duplicate return/refund obligation identity ${JSON.stringify(obligationDuplicates[0]._id)}`);
    }
    const physicalDuplicates = await collection.aggregate([
      { $match: RETURN_REFUND_PHYSICAL_OPEN_INDEX.partialFilterExpression },
      { $group: { _id: '$orderId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();
    if (physicalDuplicates.length) {
      throw new Error(`Order ${String(physicalDuplicates[0]._id)} has multiple open physical return/refund requests`);
    }
  }

  const indexes = collection.indexes ? await readIndexes(collection) : [];
  const created = [];
  for (const definition of [RETURN_REFUND_PHYSICAL_OPEN_INDEX, RETURN_REFUND_OBLIGATION_INDEX]) {
    const existing = indexes.find((index) => index.name === definition.name);
    if (existing) {
      const compatible = existing.unique === true
        && JSON.stringify(existing.key) === JSON.stringify(definition.key)
        && JSON.stringify(existing.partialFilterExpression) === JSON.stringify(definition.partialFilterExpression);
      if (!compatible) throw new Error(`${definition.name} exists with an incompatible definition`);
      continue;
    }
    if (!collection.createIndex) continue;
    await collection.createIndex(definition.key, {
      unique: true,
      partialFilterExpression: definition.partialFilterExpression,
      name: definition.name,
    });
    created.push(definition.name);
  }

  const dropped = [];
  if (
    indexes.some((index) => index.name === LEGACY_RETURN_REFUND_OPEN_INDEX)
    && collection.dropIndex
  ) {
    await collection.dropIndex(LEGACY_RETURN_REFUND_OPEN_INDEX);
    dropped.push(LEGACY_RETURN_REFUND_OPEN_INDEX);
  }
  return { ensured: true, created, dropped };
}

function buildMigrationPlan(orders, paymentTimeoutMinutes) {
  const timeout = validatePaymentTimeoutMinutes(paymentTimeoutMinutes);

  return orders.flatMap((order) => {
    const set = {};
    let normalizesWaitingForPayment = false;
    let normalizesExpired = false;
    let normalizesCancelledPayment = false;
    let backfillsDeadline = false;

    if (order.orderStatus === 'WaitingForPayment') {
      set.orderStatus = 'Pending';
      normalizesWaitingForPayment = true;
    } else if (order.orderStatus === 'Expired') {
      set.orderStatus = 'Cancelled';
      normalizesExpired = true;
    }
    if (
      ['Expired', 'Cancelled'].includes(String(order.orderStatus))
      && ['Pending', 'WaitingForPayment', 'Failed', 'Unpaid'].includes(String(order.paymentStatus))
    ) {
      set.paymentStatus = 'Cancelled';
      normalizesCancelledPayment = true;
    }

    if (
      order.paymentMethod === 'ONLINE'
      && PRE_CONFIRMATION_STATUSES.includes(order.orderStatus)
      && isMissing(order.paymentDeadlineAt)
    ) {
      const createdAt = new Date(order.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error(`Order ${String(order._id)} requires a valid createdAt to backfill paymentDeadlineAt`);
      }
      set.paymentDeadlineAt = new Date(createdAt.getTime() + (timeout * MINUTE_MS));
      backfillsDeadline = true;
    }

    if (!Object.keys(set).length) return [];

    const filter = { _id: order._id };
    if (normalizesWaitingForPayment || normalizesExpired || normalizesCancelledPayment || backfillsDeadline) {
      filter.orderStatus = order.orderStatus;
    }
    if (normalizesCancelledPayment) filter.paymentStatus = order.paymentStatus;
    if (backfillsDeadline) {
      filter.$or = MISSING_DEADLINE_FILTER;
    }

    return [{
      filter,
      update: { $set: set },
      normalizesWaitingForPayment,
      normalizesExpired,
      normalizesCancelledPayment,
      backfillsDeadline,
    }];
  });
}

async function migrateSl003OrderPaymentCancellation({
  collection,
  paymentTimeoutMinutes = DEFAULT_PAYMENT_TIMEOUT_MINUTES,
  reservationCollection = null,
  orderReservationCollection = null,
  orderDetailCollection = null,
  inventoryCollection = null,
  paymentCollection = null,
  attemptCollection = null,
  refundCollection = null,
  returnRefundRequestCollection = null,
  domainOutboxCollection = null,
  session = null,
  transactionManager = null,
  skipIndexPreflight = false,
} = {}) {
  if (!collection) throw new Error('An orders collection is required');
  const timeout = validatePaymentTimeoutMinutes(paymentTimeoutMinutes);
  const reservationLedger = orderReservationCollection || reservationCollection;

  // Ensure indexes before opening a write transaction. Index creation inside a
  // Mongo transaction is unsupported; duplicate preflight must also fail before
  // any order/dependent repair is written.
  const identityIndexes = skipIndexPreflight
    ? {
        checked: [
          ORDER_CHECKOUT_IDEMPOTENCY_INDEX.name,
          ...(attemptCollection
            ? [
                PAYMENT_ATTEMPT_PROVIDER_ORDER_INDEX.name,
                PAYMENT_ATTEMPT_ONE_PENDING_INDEX.name,
              ]
            : []),
          ...(domainOutboxCollection ? [DOMAIN_OUTBOX_IDENTITY_INDEX.name] : []),
          ...(domainOutboxCollection ? [DOMAIN_OUTBOX_LEASE_INDEX.name] : []),
        ],
      }
    : await ensureSl003IdentityIndexes({
      orderCollection: collection,
      attemptCollection,
      domainOutboxCollection,
    });
  if (!skipIndexPreflight && reservationLedger) await ensureOrderReservationIndexes({ collection: reservationLedger });
  const refundIndex = skipIndexPreflight
    ? { ensured: Boolean(refundCollection) }
    : await ensureRefundPendingObligationIndex({ collection: refundCollection });
  const returnRefundIndexes = skipIndexPreflight
    ? { ensured: Boolean(returnRefundRequestCollection) }
    : await ensureReturnRefundRequestIndexes({ collection: returnRefundRequestCollection });

  const run = async (activeSession = session) => {
    const orders = await collection.find(
      {
        $or: [
          // Existing Cancelled orders are included solely for dependent
          // reconciliation; buildMigrationPlan emits no base write for them.
          {
            orderStatus: {
              $in: [
                'Pending',
                'WaitingForPayment',
                'Confirmed',
                'StockExportRequested',
                'Expired',
                'Cancelled',
              ],
            },
          },
          {
            paymentMethod: 'ONLINE',
            orderStatus: { $in: PRE_CONFIRMATION_STATUSES },
            $or: MISSING_DEADLINE_FILTER,
          },
        ],
      },
      {
        projection: {
          _id: 1,
          paymentMethod: 1,
          paymentStatus: 1,
          paymentDeadlineAt: 1,
          orderStatus: 1,
          createdAt: 1,
        },
        ...(activeSession ? { session: activeSession } : {}),
      },
    ).toArray();
    const plan = buildMigrationPlan(orders, timeout);
    const result = {
      // "scanned" counts base repair candidates. Cancelled rows are scanned
      // separately for dependent reconciliation and do not inflate this count.
      scanned: plan.length,
      waitingForPaymentNormalized: 0,
      expiredNormalized: 0,
      cancelledPaymentNormalized: 0,
      deadlinesBackfilled: 0,
    };
    const dependentResult = {
      reservationsReleased: 0,
      paymentsCancelled: 0,
      attemptsRetired: 0,
      reservationLineageBackfilled: 0,
      refundIndexesEnsured: refundIndex.ensured ? 1 : 0,
      returnRefundRequestIndexesEnsured: returnRefundIndexes.ensured ? 1 : 0,
      orderReservationIndexesEnsured: reservationLedger ? 1 : 0,
      identityIndexesEnsured: identityIndexes.checked.length,
    };

    const lineagePlan = await buildReservationLineageBackfill({
      orders,
      orderDetailCollection,
      reservationCollection: reservationLedger,
      inventoryCollection,
      session: activeSession,
    });

    for (const reservation of lineagePlan.inserts) {
      const write = await reservationLedger.updateOne(
        { reservationKey: reservation.reservationKey },
        { $setOnInsert: reservation },
        { upsert: true, ...sessionOptions(activeSession) }
      );
      dependentResult.reservationLineageBackfilled += Number(write.upsertedCount || 0);
    }

    for (const item of plan) {
      const write = await collection.updateOne(item.filter, item.update, sessionOptions(activeSession));
      if (write.modifiedCount !== 1) continue;
      if (item.normalizesWaitingForPayment) result.waitingForPaymentNormalized += 1;
      if (item.normalizesExpired) result.expiredNormalized += 1;
      if (item.normalizesCancelledPayment) result.cancelledPaymentNormalized += 1;
      if (item.backfillsDeadline) result.deadlinesBackfilled += 1;
    }

    // Every dependent repair is conditional and repeat-safe. The CLI supplies
    // a Mongo session so the order transition, payment/attempt retirement,
    // reservation release, and inventory decrement commit atomically.
    if (reservationLedger || paymentCollection || attemptCollection || refundCollection) {
      for (const order of orders) {
        if (!['Expired', 'Cancelled'].includes(String(order.orderStatus))) continue;
        const orderId = order._id;
        if (reservationLedger?.find) {
          const reservations = await reservationLedger.find(
            { orderId, status: 'Reserved' },
            activeSession ? { session: activeSession } : undefined
          ).toArray();
          for (const reservation of reservations) {
            const write = await reservationLedger.updateOne(
              { _id: reservation._id, status: 'Reserved' },
              { $set: { status: 'Released', releasedAt: new Date(), releaseReason: 'SL-003 expiry migration' } },
              sessionOptions(activeSession)
            );
            if (write.modifiedCount !== 1) continue;
            dependentResult.reservationsReleased += 1;
            if (inventoryCollection?.updateOne) {
              const inventoryWrite = await inventoryCollection.updateOne(
                { productId: reservation.productId, reservedQuantity: { $gte: Number(reservation.quantity) } },
                { $inc: { reservedQuantity: -Number(reservation.quantity) } },
                sessionOptions(activeSession)
              );
              if (inventoryWrite.matchedCount === 0 && inventoryWrite.modifiedCount === 0) {
                throw new Error(`Order ${String(orderId)} inventory reservation could not be reconciled`);
              }
            }
          }
        }
        if (paymentCollection?.updateMany || paymentCollection?.updateOne) {
          const write = paymentCollection.updateMany
            ? await paymentCollection.updateMany(
              { orderId, paymentStatus: { $in: ['Pending', 'WaitingForPayment', 'Unpaid', 'Failed'] } },
              { $set: { paymentStatus: 'Cancelled' } },
              sessionOptions(activeSession)
            )
            : await paymentCollection.updateOne(
              { orderId, paymentStatus: { $in: ['Pending', 'WaitingForPayment', 'Unpaid', 'Failed'] } },
              { $set: { paymentStatus: 'Cancelled' } },
              sessionOptions(activeSession)
            );
          dependentResult.paymentsCancelled += Number(write.modifiedCount || 0);
        }
        if (attemptCollection?.updateMany || attemptCollection?.updateOne) {
          const write = attemptCollection.updateMany
            ? await attemptCollection.updateMany(
              { orderId, paymentStatus: { $in: ['Pending', 'Unpaid'] } },
              { $set: { paymentStatus: 'Expired' } },
              sessionOptions(activeSession)
            )
            : await attemptCollection.updateOne(
              { orderId, paymentStatus: { $in: ['Pending', 'Unpaid'] } },
              { $set: { paymentStatus: 'Expired' } },
              sessionOptions(activeSession)
            );
          dependentResult.attemptsRetired += Number(write.modifiedCount || 0);
        }
      }
      Object.assign(result, dependentResult);
    }

    return result;
  };

  if (transactionManager?.withTransaction) {
    return transactionManager.withTransaction((activeSession) => run(activeSession));
  }
  return run(session);
}

async function ensureStockExportOpenIndex({ collection } = {}) {
  if (!collection) throw new Error('A stock export requests collection is required');
  const duplicates = await collection.aggregate([
    { $match: STOCK_EXPORT_OPEN_INDEX.partialFilterExpression },
    { $group: { _id: '$orderId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  if (duplicates.length) {
    throw new Error(`Order ${String(duplicates[0]._id)} has multiple open stock export requests`);
  }

  let indexes;
  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (!['NamespaceNotFound', 'ns not found'].includes(error?.codeName)
      && !/namespace.*not found/i.test(String(error?.message || ''))) {
      throw error;
    }
    indexes = [];
  }
  const existing = indexes.find((index) => index.name === STOCK_EXPORT_OPEN_INDEX.name);
  if (existing) {
    const expectedStatuses = STOCK_EXPORT_OPEN_INDEX.partialFilterExpression.status.$in;
    const actualStatuses = existing.partialFilterExpression?.status?.$in || [];
    const compatible = existing.unique === true
      && JSON.stringify(existing.key) === JSON.stringify(STOCK_EXPORT_OPEN_INDEX.key)
      && JSON.stringify(actualStatuses) === JSON.stringify(expectedStatuses);
    if (!compatible) {
      throw new Error(`${STOCK_EXPORT_OPEN_INDEX.name} exists with an incompatible definition`);
    }
    return { created: false };
  }

  await collection.createIndex(STOCK_EXPORT_OPEN_INDEX.key, {
    name: STOCK_EXPORT_OPEN_INDEX.name,
    unique: true,
    partialFilterExpression: STOCK_EXPORT_OPEN_INDEX.partialFilterExpression,
  });
  return { created: true };
}

async function runCli({
  loadEnv = () => require('dotenv').config(),
  connect = connectDatabase,
  mongooseClient = mongoose,
  logger = console,
  env = process.env,
} = {}) {
  loadEnv();
  const paymentTimeoutMinutes = isMissing(env.PAYMENT_TIMEOUT_MINUTES)
    ? DEFAULT_PAYMENT_TIMEOUT_MINUTES
    : validatePaymentTimeoutMinutes(env.PAYMENT_TIMEOUT_MINUTES);
  await connect();
  try {
    const orderCollection = mongooseClient.connection.collection('orders');
    const orderReservationCollection = mongooseClient.connection.collection('orderreservations');
    const orderDetailCollection = mongooseClient.connection.collection('orderdetails');
    const inventoryCollection = mongooseClient.connection.collection('inventories');
    const paymentCollection = mongooseClient.connection.collection('payments');
    const attemptCollection = mongooseClient.connection.collection('paymentattempts');
    const refundCollection = mongooseClient.connection.collection('refundpendings');
    const returnRefundRequestCollection = mongooseClient.connection.collection('returnrefundrequests');
    const domainOutboxCollection = mongooseClient.connection.collection('domainoutboxes');
    const stockExportIndex = await ensureStockExportOpenIndex({
      collection: mongooseClient.connection.collection('stockexportrequests'),
    });
    await ensureOrderReservationIndexes({ collection: orderReservationCollection });
    await ensureRefundPendingObligationIndex({ collection: refundCollection });
    await ensureReturnRefundRequestIndexes({ collection: returnRefundRequestCollection });
    await ensureSl003IdentityIndexes({
      orderCollection,
      attemptCollection,
      domainOutboxCollection,
    });
    let result;
    const migrateOptions = {
      collection: orderCollection,
      paymentTimeoutMinutes,
      orderReservationCollection,
      orderDetailCollection,
      inventoryCollection,
      paymentCollection,
      attemptCollection,
      refundCollection,
      returnRefundRequestCollection,
      domainOutboxCollection,
      skipIndexPreflight: true,
    };
    if (typeof mongooseClient.startSession === 'function') {
      const session = await mongooseClient.startSession();
      try {
        await session.withTransaction(async () => {
          result = await migrateSl003OrderPaymentCancellation({ ...migrateOptions, session });
        });
      } finally {
        await session.endSession();
      }
    } else {
      result = await migrateSl003OrderPaymentCancellation(migrateOptions);
    }
    logger.log('SL-003 Order migration completed.');
    logger.table([{ ...result, stockExportIndexCreated: stockExportIndex.created }]);
  } finally {
    await mongooseClient.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('SL-003 Order migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_PAYMENT_TIMEOUT_MINUTES,
  MISSING_DEADLINE_FILTER,
  PRE_CONFIRMATION_STATUSES,
  RESERVATION_OWNING_STATUSES,
  STOCK_EXPORT_OPEN_INDEX,
  ORDER_RESERVATION_INDEXES,
  ORDER_CHECKOUT_IDEMPOTENCY_INDEX,
  PAYMENT_ATTEMPT_PROVIDER_ORDER_INDEX,
  PAYMENT_ATTEMPT_ONE_PENDING_INDEX,
  DOMAIN_OUTBOX_IDENTITY_INDEX,
  DOMAIN_OUTBOX_LEASE_INDEX,
  REFUND_PENDING_OBLIGATION_INDEX,
  RETURN_REFUND_PHYSICAL_OPEN_INDEX,
  RETURN_REFUND_OBLIGATION_INDEX,
  buildMigrationPlan,
  buildLegacyRepairPlan,
  buildReservationLineageBackfill,
  ensureOrderReservationIndexes,
  ensureSl003IdentityIndexes,
  ensureRefundPendingObligationIndex,
  ensureReturnRefundRequestIndexes,
  ensureStockExportOpenIndex,
  migrateSl003OrderPaymentCancellation,
  runCli,
  validatePaymentTimeoutMinutes,
};
