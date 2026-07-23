const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');

const DEFAULT_PAYMENT_TIMEOUT_MINUTES = 15;
const MINUTE_MS = 60 * 1000;
const PRE_CONFIRMATION_STATUSES = Object.freeze(['Pending', 'WaitingForPayment']);
const MISSING_DEADLINE_FILTER = Object.freeze([
  Object.freeze({ paymentDeadlineAt: Object.freeze({ $exists: false }) }),
  Object.freeze({ paymentDeadlineAt: null }),
  Object.freeze({ paymentDeadlineAt: '' }),
]);

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

function buildMigrationPlan(orders, paymentTimeoutMinutes) {
  const timeout = validatePaymentTimeoutMinutes(paymentTimeoutMinutes);

  return orders.flatMap((order) => {
    const set = {};
    let normalizesWaitingForPayment = false;
    let normalizesExpired = false;
    let backfillsDeadline = false;

    if (order.orderStatus === 'WaitingForPayment') {
      set.orderStatus = 'Pending';
      normalizesWaitingForPayment = true;
    } else if (order.orderStatus === 'Expired') {
      set.orderStatus = 'Cancelled';
      normalizesExpired = true;
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
    if (normalizesWaitingForPayment || normalizesExpired || backfillsDeadline) {
      filter.orderStatus = order.orderStatus;
    }
    if (backfillsDeadline) {
      filter.$or = MISSING_DEADLINE_FILTER;
    }

    return [{
      filter,
      update: { $set: set },
      normalizesWaitingForPayment,
      normalizesExpired,
      backfillsDeadline,
    }];
  });
}

async function migrateSl003OrderPaymentCancellation({
  collection,
  paymentTimeoutMinutes = DEFAULT_PAYMENT_TIMEOUT_MINUTES,
} = {}) {
  if (!collection) throw new Error('An orders collection is required');
  const timeout = validatePaymentTimeoutMinutes(paymentTimeoutMinutes);
  const orders = await collection.find(
    {
      $or: [
        { orderStatus: { $in: ['WaitingForPayment', 'Expired'] } },
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
        paymentDeadlineAt: 1,
        orderStatus: 1,
        createdAt: 1,
      },
    },
  ).toArray();
  const plan = buildMigrationPlan(orders, timeout);
  const result = {
    scanned: orders.length,
    waitingForPaymentNormalized: 0,
    expiredNormalized: 0,
    deadlinesBackfilled: 0,
  };

  for (const item of plan) {
    const write = await collection.updateOne(item.filter, item.update);
    if (write.modifiedCount !== 1) continue;
    if (item.normalizesWaitingForPayment) result.waitingForPaymentNormalized += 1;
    if (item.normalizesExpired) result.expiredNormalized += 1;
    if (item.backfillsDeadline) result.deadlinesBackfilled += 1;
  }

  return result;
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
    const result = await migrateSl003OrderPaymentCancellation({
      collection: mongooseClient.connection.collection('orders'),
      paymentTimeoutMinutes,
    });
    logger.log('SL-003 Order migration completed.');
    logger.table([result]);
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
  buildMigrationPlan,
  migrateSl003OrderPaymentCancellation,
  runCli,
  validatePaymentTimeoutMinutes,
};
