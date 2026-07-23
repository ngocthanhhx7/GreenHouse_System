const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const DamageReport = require('../models/damageReport.model');
const ReplenishmentRequest = require('../models/replenishmentRequest.model');
const LowStockAlert = require('../models/lowStockAlert.model');
const ReplenishmentReceipt = require('../models/replenishmentReceipt.model');

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
    status: item.status === 'PendingWarehouseConfirmation' ? 'PendingReview' : (item.status || 'PendingReview'),
  };
}

function normalizeReplenishmentDocument(item) {
  const requested = Number(item.requestedQuantity || item.quantity || 0);
  const received = Number(item.netAcceptedQuantity ?? item.receivedQuantity ?? 0);
  const status = item.status === 'Receiving' ? 'PartiallyReceived' : (item.status === 'Received' ? 'Completed' : item.status);
  return {
    quantity: requested,
    requestedQuantity: requested,
    approvedQuantity: item.approvedQuantity ?? (['Approved', 'PartiallyReceived', 'Completed'].includes(status) ? requested : null),
    netAcceptedQuantity: received,
    receivedQuantity: received,
    status,
  };
}

function createMigrationRepository() {
  return {
    async backfillInventories() {
      const documents = await Inventory.find({}).lean();
      let modified = 0;
      for (const item of documents) {
        const result = await Inventory.updateOne({ _id: item._id }, { $set: normalizeInventoryDocument(item) });
        modified += result.modifiedCount || 0;
      }
      return modified;
    },
    async backfillDamageReports() {
      const documents = await DamageReport.find({}).lean();
      let modified = 0;
      for (const item of documents) {
        const result = await DamageReport.updateOne({ _id: item._id }, { $set: normalizeDamageDocument(item) });
        modified += result.modifiedCount || 0;
      }
      return modified;
    },
    async backfillReplenishments() {
      const documents = await ReplenishmentRequest.find({}).lean();
      let modified = 0;
      for (const item of documents) {
        const result = await ReplenishmentRequest.updateOne({ _id: item._id }, { $set: normalizeReplenishmentDocument(item) });
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
  const inventoriesBackfilled = await repository.backfillInventories();
  const damageReportsBackfilled = await repository.backfillDamageReports();
  const replenishmentsBackfilled = await repository.backfillReplenishments();
  const indexesVerified = await repository.verifyIndexes();
  return { inventoriesBackfilled, damageReportsBackfilled, replenishmentsBackfilled, indexesVerified };
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
  createMigrationRepository,
  migrateSl005Inventory,
  runCli,
};
