const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const CodDiscrepancy = require('../models/codDiscrepancy.model');
const DeliveryIncident = require('../models/deliveryIncident.model');
const FulfillmentCycle = require('../models/fulfillmentCycle.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const OrderReservation = require('../models/orderReservation.model');
const PackingRecord = require('../models/packingRecord.model');
const RefundPending = require('../models/refundPending.model');
const ReturnedParcelReceipt = require('../models/returnedParcelReceipt.model');
const Shipment = require('../models/shipment.model');
const ShipmentDestinationVersion = require('../models/shipmentDestinationVersion.model');
const ShipmentEvent = require('../models/shipmentEvent.model');
const StockExportRequest = require('../models/stockExportRequest.model');

function legacyExportPatch(document) {
  const status = String(document.status || 'Pending');
  if (status === 'Approved') {
    return { status: 'Pending', failureCode: '', failureReason: '' };
  }
  if (status === 'Rejected') {
    return {
      status: 'Failed',
      failureCode: 'LEGACY_WAREHOUSE_REJECTED',
      failureReason: String(document.note || 'Legacy Warehouse rejection requires review'),
    };
  }
  if (status === 'Exported') {
    const completedAt = document.completedAt || document.exportedAt || document.updatedAt || document.createdAt;
    return {
      status: 'Completed',
      completedAt,
      exportedAt: completedAt,
      failureCode: '',
      failureReason: '',
    };
  }
  if (status === 'Processing') {
    return {
      status: 'Failed',
      failureCode: 'MIGRATION_RETRY_REQUIRED',
      failureReason: 'Legacy in-flight export must be retried through the exact SL-004 process command',
    };
  }
  if (status === 'Completed') {
    const completedAt = document.completedAt || document.exportedAt || document.updatedAt || document.createdAt;
    return {
      status: 'Completed',
      completedAt,
      exportedAt: completedAt,
      failureCode: document.failureCode || '',
      failureReason: document.failureReason || '',
    };
  }
  if (status === 'Failed') {
    return {
      status: 'Failed',
      failureCode: document.failureCode || 'EXPORT_FAILED',
      failureReason: document.failureReason || 'Export requires retry',
    };
  }
  if (status === 'Pending' || status === 'Cancelled') {
    return {
      status,
      failureCode: document.failureCode || '',
      failureReason: document.failureReason || '',
    };
  }
  throw new Error(`Unsupported legacy StockExportRequest status: ${status}`);
}

async function backfillLegacyExportRequest({
  model = StockExportRequest,
  requestId,
  cycleId,
  requestKind,
  patch,
  session,
}) {
  if (requestKind === 'Resend') return { acknowledged: true, modifiedCount: 0 };
  return model.collection.updateOne(
    { _id: requestId },
    {
      $set: {
        ...patch,
        cycleId,
        requestKind: 'Initial',
      },
    },
    { session },
  );
}

function initialExportBackfillFilter() {
  return {
    $or: [
      { requestKind: { $exists: false } },
      { requestKind: 'Initial' },
    ],
  };
}

function summarizeGroups(groups) {
  return groups
    .map((group) => `${String(group._id)}=[${(group.ids || []).map(String).join(',')}]`)
    .join('; ');
}

async function dropIndexIfPresent(Model, name) {
  try {
    await Model.collection.dropIndex(name);
  } catch (error) {
    if (error?.codeName !== 'IndexNotFound' && error?.code !== 27) throw error;
  }
}

function createMigrationRepository() {
  return {
    async assertNoConflicts() {
      const duplicateInitialExports = await StockExportRequest.aggregate([
        {
          $match: {
            $or: [
              { requestKind: { $exists: false } },
              { requestKind: 'Initial' },
            ],
          },
        },
        { $group: { _id: '$orderId', ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ]);
      if (duplicateInitialExports.length) {
        throw new Error(
          `SL-004 migration blocked by duplicate initial export requests: ${summarizeGroups(duplicateInitialExports)}`,
        );
      }

      const duplicateCycles = await Shipment.aggregate([
        { $group: { _id: '$cycleId', ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
      ]);
      if (duplicateCycles.length) {
        throw new Error(`SL-004 migration blocked by duplicate Shipment cycles: ${summarizeGroups(duplicateCycles)}`);
      }
      const duplicateTracking = await Shipment.aggregate([
        { $match: { trackingReference: { $type: 'string', $gt: '' } } },
        { $group: { _id: '$trackingReference', ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ]);
      if (duplicateTracking.length) {
        throw new Error(`SL-004 migration blocked by duplicate tracking references: ${summarizeGroups(duplicateTracking)}`);
      }

      const retryableExports = await StockExportRequest.find({
        status: { $in: ['Pending', 'Approved', 'Processing', 'Failed'] },
      }).select('_id orderId').lean();
      for (const request of retryableExports) {
        const [details, reservations] = await Promise.all([
          OrderDetail.find({ orderId: request.orderId }).select('_id quantity').lean(),
          OrderReservation.find({ orderId: request.orderId, status: 'Reserved' })
            .select('orderDetailId quantity')
            .lean(),
        ]);
        const quantityByDetail = new Map(
          reservations.map((reservation) => [
            String(reservation.orderDetailId),
            Number(reservation.quantity),
          ]),
        );
        const invalid = !details.length || details.some(
          (detail) => quantityByDetail.get(String(detail._id)) !== Number(detail.quantity),
        );
        if (invalid || quantityByDetail.size !== details.length) {
          throw new Error(
            `SL-004 migration blocked by invalid reservation lineage for export ${String(request._id)}`,
          );
        }
      }
    },

    async normalizeLegacyOrderStates() {
      const result = await Order.updateMany(
        { orderStatus: 'StockExportRequested' },
        { $set: { orderStatus: 'Confirmed' } },
        { timestamps: false, runValidators: false },
      );
      return result.modifiedCount || 0;
    },

    async backfillInitialCyclesAndExports() {
      const requests = await StockExportRequest.find(initialExportBackfillFilter())
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      let cyclesCreated = 0;
      let exportsBackfilled = 0;
      for (const request of requests) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const current = await StockExportRequest.findById(request._id).session(session).lean();
            if (!current) return;
            const patch = legacyExportPatch(current);
            let cycle = await FulfillmentCycle.findOne({
              orderId: current.orderId,
              cycleNumber: 1,
            }).session(session).lean();
            if (!cycle) {
              const [created] = await FulfillmentCycle.create([{
                cycleKey: `fulfillment:${String(current.orderId)}:1`,
                orderId: current.orderId,
                cycleNumber: 1,
                cycleType: 'Initial',
                status: patch.status === 'Completed' ? 'Exported' : 'AwaitingExport',
                commandKey: `sl004-migration:${String(current.orderId)}`,
                createdBy: current.requestedBy,
              }], { session });
              cycle = created.toObject();
              cyclesCreated += 1;
            }
            const result = await backfillLegacyExportRequest({
              requestId: current._id,
              cycleId: cycle._id,
              requestKind: current.requestKind,
              patch,
              session,
            });
            exportsBackfilled += result.modifiedCount || 0;
          });
        } finally {
          await session.endSession();
        }
      }
      return { cyclesCreated, exportsBackfilled };
    },

    async reportUnverifiableFulfillment() {
      const candidates = await Order.find({
        orderStatus: { $in: ['Packed', 'Shipped', 'Delivered', 'DeliveryFailed'] },
      }).select('_id orderStatus').lean();
      const orderIds = [];
      for (const order of candidates) {
        const packing = await PackingRecord.findOne({
          orderId: order._id,
          status: 'Completed',
        }).select('_id').lean();
        const requiresShipment = ['Shipped', 'Delivered', 'DeliveryFailed'].includes(order.orderStatus);
        const shipment = requiresShipment
          ? await Shipment.findOne({ orderId: order._id }).select('_id').lean()
          : null;
        if (!packing || (requiresShipment && !shipment)) orderIds.push(String(order._id));
      }
      return { count: orderIds.length, orderIds };
    },

    async verifyIndexes() {
      await dropIndexIfPresent(StockExportRequest, 'stock_export_one_open_per_order');
      const models = [
        FulfillmentCycle,
        StockExportRequest,
        PackingRecord,
        Shipment,
        ShipmentEvent,
        ShipmentDestinationVersion,
        DeliveryIncident,
        ReturnedParcelReceipt,
        CodDiscrepancy,
        InventoryTransaction,
        Order,
        RefundPending,
      ];
      for (const Model of models) await Model.createIndexes();
      return models.length;
    },
  };
}

async function migrateSl004FulfillmentDelivery({
  repository = createMigrationRepository(),
} = {}) {
  await repository.assertNoConflicts();
  const ordersNormalized = await repository.normalizeLegacyOrderStates();
  const cycleResult = await repository.backfillInitialCyclesAndExports();
  const reconciliation = await repository.reportUnverifiableFulfillment();
  const indexesVerified = await repository.verifyIndexes();
  return {
    ordersNormalized,
    cyclesCreated: cycleResult.cyclesCreated,
    exportsBackfilled: cycleResult.exportsBackfilled,
    reconciliationRequired: reconciliation.count,
    reconciliationOrderIds: reconciliation.orderIds,
    indexesVerified,
  };
}

async function runCli({
  loadEnv = () => require('dotenv').config(),
  mongooseClient = mongoose,
  connect = connectDatabase,
  migrate = migrateSl004FulfillmentDelivery,
  logger = console,
} = {}) {
  loadEnv();
  mongooseClient.set('autoIndex', false);
  await connect();
  try {
    const result = await migrate();
    logger.log('SL-004 Fulfillment/Delivery migration completed.');
    logger.table([result]);
    if (result.reconciliationRequired > 0) {
      logger.warn(
        'SL-004 did not fabricate packing/shipment evidence. Operational reconciliation is required for:',
        result.reconciliationOrderIds,
      );
    }
  } finally {
    await mongooseClient.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('SL-004 Fulfillment/Delivery migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  backfillLegacyExportRequest,
  createMigrationRepository,
  initialExportBackfillFilter,
  legacyExportPatch,
  migrateSl004FulfillmentDelivery,
  runCli,
};
