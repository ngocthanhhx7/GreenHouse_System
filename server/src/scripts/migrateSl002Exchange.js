const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');

const AfterSalesOrderLock = require('../models/afterSalesOrderLock.model');
const ExchangeCase = require('../models/exchangeCase.model');
const ExchangeLine = require('../models/exchangeLine.model');
const ExchangeUnitLineage = require('../models/exchangeUnitLineage.model');
const StockReservation = require('../models/stockReservation.model');
const ExchangeInspection = require('../models/exchangeInspection.model');
const ExchangeShipment = require('../models/exchangeShipment.model');
const ExchangeShipmentEvent = require('../models/exchangeShipmentEvent.model');
const ExchangeConversion = require('../models/exchangeConversion.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Order = require('../models/order.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_RETURN_STATUSES = [
  'New', 'Pending', 'AwaitingCODReconciliation', 'Approved',
  'AwaitingInspection', 'Received', 'ReadyForRefund', 'CODRecoveryInProgress',
];

function createMigrationRepository() {
  const indexedModels = [
    AfterSalesOrderLock, ExchangeCase, ExchangeLine, ExchangeUnitLineage,
    StockReservation, ExchangeInspection, ExchangeShipment,
    ExchangeShipmentEvent, ExchangeConversion, InventoryTransaction,
  ];
  return {
    async loadReturnCasesForLockBackfill() {
      return ReturnRefundRequest.find({
        status: { $in: [...ACTIVE_RETURN_STATUSES, 'Completed'] },
      }).select('_id orderId status createdAt completedAt').lean();
    },
    async loadDeliveredOrdersWithoutExchangeDeadline() {
      return Order.find({
        orderStatus: 'Delivered',
        deliveredAt: { $ne: null },
        exchangeDeadlineAt: null,
      }).select('_id deliveredAt').lean();
    },
    async backfillExchangeDeadline(orderId, exchangeDeadlineAt) {
      const result = await Order.updateOne(
        { _id: orderId, exchangeDeadlineAt: null },
        { $set: { exchangeDeadlineAt } }
      );
      return result.modifiedCount;
    },
    async backfillReturnLock(item) {
      const result = await AfterSalesOrderLock.updateOne(
        { orderId: item.orderId },
        { $setOnInsert: item },
        { upsert: true }
      );
      return result.upsertedCount;
    },
    async loadUnitsWithoutPhysicalClaim() {
      return ExchangeUnitLineage.find({
        exclusivePhysicalClaimKey: { $exists: false },
      }).select('_id exchangeCaseId orderId orderDetailId parentUnitId originalUnitOrdinal').lean();
    },
    async loadExchangeCaseStatuses(caseIds) {
      return ExchangeCase.find({ _id: { $in: caseIds } }).select('_id status').lean();
    },
    async backfillPhysicalClaim(unitId, exclusivePhysicalClaimKey) {
      const result = await ExchangeUnitLineage.updateOne(
        { _id: unitId, exclusivePhysicalClaimKey: { $exists: false } },
        { $set: { exclusivePhysicalClaimKey } }
      );
      return result.modifiedCount;
    },
    async verifyIndexes() {
      for (const model of indexedModels) await model.createIndexes();
      return indexedModels.length;
    },
  };
}

function createLockBackfillConflict(orderId, activeCount, completedCount) {
  const error = new Error(
    `SL-002 Return lock backfill is ambiguous for orderId=${orderId}; `
    + `active=${activeCount}; completed=${completedCount}`
  );
  error.code = 'SL002_LOCK_BACKFILL_CONFLICT';
  return error;
}

function planReturnLockBackfill(returnCases, { clock = () => new Date() } = {}) {
  const grouped = new Map();
  for (const item of returnCases) {
    const orderId = String(item.orderId);
    if (!grouped.has(orderId)) grouped.set(orderId, []);
    grouped.get(orderId).push(item);
  }

  const plan = [];
  for (const [orderId, items] of grouped) {
    const active = items.filter((item) => ACTIVE_RETURN_STATUSES.includes(item.status));
    const completed = items.filter((item) => item.status === 'Completed');
    const allowed = (active.length === 1 && completed.length === 0)
      || (active.length === 0 && completed.length === 1);
    if (!allowed) {
      throw createLockBackfillConflict(orderId, active.length, completed.length);
    }
    const item = active[0] || completed[0];
    const isActive = active.length === 1;
    plan.push({
      orderId: item.orderId,
      caseType: 'RETURN_REFUND',
      caseId: item._id,
      status: isActive ? 'Active' : 'ClosedPermanently',
      acquiredAt: item.createdAt || new Date(clock()),
      releasedAt: isActive ? null : (item.completedAt || new Date(clock())),
      terminalStatus: isActive ? '' : 'Completed',
    });
  }
  return plan;
}

async function migrateSl002Exchange({
  repository = createMigrationRepository(),
  clock = () => new Date(),
} = {}) {
  const returnCases = await repository.loadReturnCasesForLockBackfill();
  const lockPlan = planReturnLockBackfill(returnCases, { clock });

  const delivered = await repository.loadDeliveredOrdersWithoutExchangeDeadline();
  let deadlinesBackfilled = 0;
  for (const order of delivered) {
    deadlinesBackfilled += await repository.backfillExchangeDeadline(
      order._id,
      new Date(new Date(order.deliveredAt).getTime() + 5 * DAY_MS)
    );
  }

  let locksBackfilled = 0;
  for (const item of lockPlan) {
    locksBackfilled += await repository.backfillReturnLock(item);
  }

  const unitsWithoutClaim = await repository.loadUnitsWithoutPhysicalClaim();
  const unitCaseIds = [...new Set(unitsWithoutClaim.map((item) => String(item.exchangeCaseId)))];
  const unitCases = await repository.loadExchangeCaseStatuses(unitCaseIds);
  const statusByCase = new Map(unitCases.map((item) => [String(item._id), item.status]));
  let physicalClaimsBackfilled = 0;
  for (const unit of unitsWithoutClaim) {
    if (['Rejected', 'Cancelled', 'Expired'].includes(statusByCase.get(String(unit.exchangeCaseId)))) continue;
    const exclusivePhysicalClaimKey = unit.parentUnitId
      ? `REPLACEMENT:${String(unit.parentUnitId)}`
      : `ORIGINAL:${String(unit.orderId)}:${String(unit.orderDetailId)}:${Number(unit.originalUnitOrdinal)}`;
    physicalClaimsBackfilled += await repository.backfillPhysicalClaim(
      unit._id,
      exclusivePhysicalClaimKey
    );
  }

  const indexesVerified = await repository.verifyIndexes();
  return {
    deadlinesBackfilled,
    locksBackfilled,
    physicalClaimsBackfilled,
    indexesVerified,
  };
}

async function runCli() {
  require('dotenv').config();
  await connectDatabase();
  try {
    const result = await migrateSl002Exchange();
    console.log('SL-002 Exchange migration completed.');
    console.table([result]);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('SL-002 Exchange migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  ACTIVE_RETURN_STATUSES,
  createMigrationRepository,
  migrateSl002Exchange,
  planReturnLockBackfill,
};
