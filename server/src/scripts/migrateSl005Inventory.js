const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const DamageReport = require('../models/damageReport.model');
const ReplenishmentRequest = require('../models/replenishmentRequest.model');
const LowStockAlert = require('../models/lowStockAlert.model');
const ReplenishmentReceipt = require('../models/replenishmentReceipt.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');

function normalizeInventoryDocument(item) {
  const sellable = Number(item.sellableQuantity ?? item.stockQuantity ?? 0);
  const reserved = Number(item.reservedQuantity || 0);
  return {
    stockQuantity: sellable,
    sellableQuantity: sellable,
    reservedQuantity: reserved,
    quarantinedQuantity: Number(item.quarantinedQuantity || 0),
    damagedQuantity: Number(item.damagedQuantity || 0),
    inventoryHealth: reserved > sellable ? 'ReconciliationRequired' : (item.inventoryHealth || 'Normal'),
    lowStockThresholdOverride: item.lowStockThresholdOverride ?? null,
  };
}

function normalizeDamageDocument(item) {
  return {
    quantity: Number(item.quantity || item.reportedQuantity || 0),
    reportedQuantity: Number(item.reportedQuantity || item.quantity || 0),
    evidence: Array.isArray(item.evidence) && item.evidence.length
      ? item.evidence
      : [{ type: 'migration', reference: `sl005-migration-damage:${String(item._id || '')}` }],
    status: item.status === 'PendingWarehouseConfirmation' ? 'PendingReview' : (item.status || 'PendingReview'),
  };
}

function normalizeReplenishmentDocument(item) {
  const requested = Number(item.requestedQuantity || item.quantity || 0);
  const received = Number(item.netAcceptedQuantity ?? item.receivedQuantity ?? 0);
  let status = item.status;
  if (status === 'Pending') status = 'PendingApproval';
  if (status === 'Receiving') {
    status = received >= requested ? 'Completed' : (received > 0 ? 'PartiallyReceived' : 'Approved');
  }
  if (status === 'Received') status = 'Completed';
  return {
    quantity: requested,
    requestedQuantity: requested,
    approvedQuantity: item.approvedQuantity ?? (['Approved', 'PartiallyReceived', 'Completed'].includes(status) ? requested : null),
    netAcceptedQuantity: received,
    receivedQuantity: received,
    status,
  };
}

function updateBackfillDocument(Model, filter, fields, options = {}) {
  return Model.updateOne(
    filter,
    { $set: fields },
    { ...options, timestamps: false },
  );
}

function createMigrationRepository() {
  async function findAffectedOrderIds(productId, session) {
    const details = await OrderDetail.find({ productId }).select('orderId').session(session).lean();
    const orderIds = [...new Set(details.map((detail) => String(detail.orderId)))];
    if (!orderIds.length) return [];
    const orders = await Order.find({
      _id: { $in: orderIds },
      orderStatus: { $nin: ['Delivered', 'Cancelled', 'Returned'] },
    }).select('_id').session(session).lean();
    return orders.map((order) => order._id);
  }
  return {
    async assertNoActiveReplenishmentConflicts() {
      const conflicts = await ReplenishmentRequest.aggregate([
        {
          $match: {
            status: {
              $in: ['Pending', 'PendingApproval', 'Approved', 'Receiving', 'PartiallyReceived', 'ShortClosurePending'],
            },
          },
        },
        { $group: { _id: '$productId', requestIds: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ]);
      if (conflicts.length) {
        const summary = conflicts
          .map((item) => `${String(item._id)}=[${item.requestIds.map(String).join(',')}]`)
          .join('; ');
        throw new Error(`SL-005 migration blocked by duplicate active replenishment requests: ${summary}`);
      }
    },
    async backfillInventories() {
      const documents = await Inventory.find({}).lean();
      let modified = 0;
      for (const item of documents) {
        const result = await updateBackfillDocument(
          Inventory,
          { _id: item._id },
          normalizeInventoryDocument(item),
        );
        modified += result.modifiedCount || 0;
      }
      return modified;
    },
    async reconcileDamageReports() {
      const documents = await DamageReport.find({
        $or: [
          { status: 'PendingWarehouseConfirmation' },
          { status: 'PendingReview', idempotencyKey: { $in: ['', null] } },
        ],
      }).lean();
      let reports = 0;
      let quarantines = 0;
      for (const item of documents) {
        const movementKey = `sl005-migration-damage-quarantine:${String(item._id)}`;
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const current = await DamageReport.findById(item._id).session(session).lean();
            if (!current || !['PendingWarehouseConfirmation', 'PendingReview'].includes(current.status)) return;
            const existing = await InventoryTransaction.findOne({ idempotencyKey: movementKey }).session(session).lean();
            const quantity = Number(current.reportedQuantity ?? current.quantity ?? 0);
            if (!Number.isInteger(quantity) || quantity <= 0) {
              throw new Error(`Damage report ${String(current._id)} has an invalid legacy quantity`);
            }
            if (!existing) {
              const inventory = await Inventory.findById(current.inventoryId).session(session).lean();
              if (!inventory) throw new Error(`Damage report ${String(current._id)} has no Inventory`);
              const sellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
              if (sellable < quantity) {
                throw new Error(`Damage report ${String(current._id)} cannot quarantine ${quantity}; only ${sellable} sellable`);
              }
              const nextSellable = sellable - quantity;
              const health = nextSellable < Number(inventory.reservedQuantity || 0)
                ? 'ReconciliationRequired'
                : 'Normal';
              const affectedOrderIds = health === 'ReconciliationRequired'
                ? await findAffectedOrderIds(current.productId, session)
                : [];
              const updated = await Inventory.findOneAndUpdate(
                {
                  _id: inventory._id,
                  $expr: { $gte: [{ $ifNull: ['$sellableQuantity', '$stockQuantity'] }, quantity] },
                },
                {
                  $inc: {
                    stockQuantity: -quantity,
                    sellableQuantity: -quantity,
                    quarantinedQuantity: quantity,
                  },
                  $set: { inventoryHealth: health, affectedOrderIds },
                },
                { new: true, runValidators: false, session },
              ).lean();
              if (!updated) throw new Error(`Damage report ${String(current._id)} changed during quarantine migration`);
              await InventoryTransaction.create([{
                productId: current.productId,
                relatedCollection: 'DamageReport',
                relatedId: current._id,
                performedBy: current.reportedBy,
                transactionType: 'DAMAGE_QUARANTINED',
                quantity: -quantity,
                beforeQuantity: sellable,
                afterQuantity: nextSellable,
                beforeSellableQuantity: sellable,
                afterSellableQuantity: nextSellable,
                beforeQuarantinedQuantity: Number(inventory.quarantinedQuantity || 0),
                afterQuarantinedQuantity: Number(inventory.quarantinedQuantity || 0) + quantity,
                dimension: 'quarantined',
                reason: 'SL-005 migration of legacy pending damage custody',
                evidence: current.evidence || [],
                movementKey,
                idempotencyKey: movementKey,
              }], { session });
              quarantines += 1;
            }
            const result = await updateBackfillDocument(
              DamageReport,
              { _id: current._id },
              {
                ...normalizeDamageDocument(current),
                idempotencyKey: current.idempotencyKey || `sl005-migrated-damage:${String(current._id)}`,
              },
              { session },
            );
            reports += result.modifiedCount || 0;
          });
        } finally {
          await session.endSession();
        }
      }
      return { reports, quarantines };
    },
    async backfillReplenishments() {
      const documents = await ReplenishmentRequest.find({}).lean();
      let modified = 0;
      for (const item of documents) {
        const result = await updateBackfillDocument(
          ReplenishmentRequest,
          { _id: item._id },
          normalizeReplenishmentDocument(item),
        );
        modified += result.modifiedCount || 0;
      }
      return modified;
    },
    async verifyIndexes() {
      await Inventory.createIndexes();
      await InventoryTransaction.createIndexes();
      await DamageReport.createIndexes();
      await ReplenishmentRequest.createIndexes();
      await LowStockAlert.createIndexes();
      await ReplenishmentReceipt.createIndexes();
      return 6;
    },
  };
}

async function migrateSl005Inventory({ repository = createMigrationRepository() } = {}) {
  await repository.assertNoActiveReplenishmentConflicts();
  const inventoriesBackfilled = await repository.backfillInventories();
  const damageResult = await repository.reconcileDamageReports();
  const damageReportsBackfilled = typeof damageResult === 'number' ? damageResult : damageResult.reports;
  const damageQuarantinesCreated = typeof damageResult === 'number' ? 0 : damageResult.quarantines;
  const replenishmentsBackfilled = await repository.backfillReplenishments();
  const indexesVerified = await repository.verifyIndexes();
  return {
    inventoriesBackfilled,
    damageReportsBackfilled,
    damageQuarantinesCreated,
    replenishmentsBackfilled,
    indexesVerified,
  };
}

async function runCli({
  loadEnv = () => require('dotenv').config(),
  mongooseClient = mongoose,
  connect = connectDatabase,
  migrate = migrateSl005Inventory,
  logger = console,
} = {}) {
  loadEnv();
  mongooseClient.set('autoIndex', false);
  await connect();
  try {
    const result = await migrate();
    logger.log('SL-005 Inventory migration completed.');
    logger.table([result]);
  } finally {
    await mongooseClient.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('SL-005 Inventory migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  normalizeInventoryDocument,
  normalizeDamageDocument,
  normalizeReplenishmentDocument,
  updateBackfillDocument,
  createMigrationRepository,
  migrateSl005Inventory,
  runCli,
};
