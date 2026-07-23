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

async function migrateSl002Exchange() {
  const delivered = await Order.find({
    orderStatus: 'Delivered',
    deliveredAt: { $ne: null },
    exchangeDeadlineAt: null,
  }).select('_id deliveredAt').lean();
  let deadlinesBackfilled = 0;
  for (const order of delivered) {
    const result = await Order.updateOne(
      { _id: order._id, exchangeDeadlineAt: null },
      { $set: { exchangeDeadlineAt: new Date(new Date(order.deliveredAt).getTime() + 5 * DAY_MS) } }
    );
    deadlinesBackfilled += result.modifiedCount;
  }

  const returnCases = await ReturnRefundRequest.find({
    status: { $in: [...ACTIVE_RETURN_STATUSES, 'Completed'] },
  }).select('_id orderId status createdAt completedAt').sort({ createdAt: 1 }).lean();
  let locksBackfilled = 0;
  for (const item of returnCases) {
    const active = ACTIVE_RETURN_STATUSES.includes(item.status);
    const result = await AfterSalesOrderLock.updateOne(
      { orderId: item.orderId },
      {
        $setOnInsert: {
          orderId: item.orderId,
          caseType: 'RETURN_REFUND',
          caseId: item._id,
          status: active ? 'Active' : 'ClosedPermanently',
          acquiredAt: item.createdAt || new Date(),
          releasedAt: active ? null : (item.completedAt || new Date()),
          terminalStatus: active ? '' : 'Completed',
        },
      },
      { upsert: true }
    );
    locksBackfilled += result.upsertedCount;
  }

  const models = [
    AfterSalesOrderLock, ExchangeCase, ExchangeLine, ExchangeUnitLineage,
    StockReservation, ExchangeInspection, ExchangeShipment,
    ExchangeShipmentEvent, ExchangeConversion, InventoryTransaction,
  ];
  for (const model of models) await model.createIndexes();
  return { deadlinesBackfilled, locksBackfilled, indexesVerified: models.length };
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

module.exports = { migrateSl002Exchange, ACTIVE_RETURN_STATUSES };
