const LowStockAlert = require('../models/lowStockAlert.model');
const Product = require('../models/product.model');
const SystemSettingVersion = require('../models/systemSettingVersion.model');
const { notificationService } = require('./notification.service');

const DEFAULT_THRESHOLD = 5;

function productIdOf(inventory) {
  return inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId;
}

function createModelRepository() {
  return {
    async listInventories() { return require('../models/inventory.model').find({}).lean(); },
    async findDefaultThreshold() {
      const version = await SystemSettingVersion.findOne({}).sort({ version: -1 }).lean();
      return version ? Number(version.values.LOW_STOCK_DEFAULT_THRESHOLD) : DEFAULT_THRESHOLD;
    },
    async findProductName(productId) {
      const product = await Product.findById(productId).select('name').lean();
      return product?.name || '';
    },
    async findOpen(productId) {
      return LowStockAlert.findOne({ productId, status: 'Open' }).lean();
    },
    async createOpen(data) {
      return LowStockAlert.create(data);
    },
    async refreshOpen(id, data) {
      return LowStockAlert.findOneAndUpdate(
        { _id: id, status: 'Open' },
        { $set: data },
        { new: true, runValidators: true },
      ).lean();
    },
    async resolveOpen(id, data) {
      return LowStockAlert.findOneAndUpdate(
        { _id: id, status: 'Open' },
        { $set: { status: 'Resolved', ...data } },
        { new: true, runValidators: true },
      ).lean();
    },
  };
}

function createLowStockAlertLifecycle({
  repository = createModelRepository(),
  eventPublisher = null,
  clock = () => new Date(),
} = {}) {
  async function publishCrossing(alert, context, inventory) {
    try {
      if (!eventPublisher) return;
      const populatedName = typeof inventory.productId === 'object' ? inventory.productId?.name : '';
      const productName = String(
        populatedName || await repository.findProductName?.(productIdOf(inventory)) || '',
      ).trim();
      if (!productName) throw new Error('Low-stock Notification product name is required');
      const event = {
        idempotencyKey: `low-stock-crossing:${String(alert._id)}`,
        type: 'LOW_STOCK_OPENED',
        recipientRole: 'WarehouseManager',
        targetCollection: 'LowStockAlert',
        targetId: alert._id,
        productId: alert.productId,
        inventoryId: alert.inventoryId,
        availableQuantity: alert.availableQuantity,
        effectiveThreshold: alert.effectiveThreshold,
        displayValues: {
          productName,
          availableQuantity: alert.availableQuantity,
          effectiveThreshold: alert.effectiveThreshold,
        },
        sourceEventKey: context.eventKey || '',
      };
      if (eventPublisher?.publishDomainEvent) await eventPublisher.publishDomainEvent(event);
      else if (eventPublisher?.createRoleNotifications) await eventPublisher.createRoleNotifications(event);
    } catch (_) {
      // Alert state is authoritative; post-commit notification delivery is retryable.
    }
  }

  async function evaluate(inventory, context = {}) {
    const now = new Date(clock());
    const productId = productIdOf(inventory);
    const sellableQuantity = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
    const reservedQuantity = Number(inventory.reservedQuantity || 0);
    const availableQuantity = inventory.inventoryHealth === 'ReconciliationRequired'
      ? 0
      : Math.max(0, sellableQuantity - reservedQuantity);
    const effectiveThreshold = inventory.lowStockThresholdOverride !== null
      && inventory.lowStockThresholdOverride !== undefined
      ? Number(inventory.lowStockThresholdOverride)
      : Number(await repository.findDefaultThreshold?.() ?? inventory.lowStockThreshold ?? DEFAULT_THRESHOLD);
    const open = await repository.findOpen(productId);

    if (availableQuantity <= effectiveThreshold) {
      const patch = {
        availableQuantity,
        effectiveThreshold,
        lastEvaluatedAt: now,
        crossingKey: context.eventKey || open?.crossingKey || '',
      };
      if (open) {
        const refreshed = await repository.refreshOpen(open._id, patch);
        return {
          alert: refreshed || open,
          opened: false,
          resolved: false,
          replay: Boolean(context.replay),
          availableQuantity,
          effectiveThreshold,
        };
      }

      let created;
      try {
        created = await repository.createOpen({
          productId,
          inventoryId: inventory._id,
          status: 'Open',
          ...patch,
          openedAt: now,
          resolvedAt: null,
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const winner = await repository.findOpen(productId);
        if (!winner) throw error;
        const refreshed = await repository.refreshOpen(winner._id, patch);
        return {
          alert: refreshed || winner,
          opened: false,
          resolved: false,
          replay: true,
          availableQuantity,
          effectiveThreshold,
        };
      }
      await publishCrossing(created, context, inventory);
      return {
        alert: created,
        opened: true,
        resolved: false,
        availableQuantity,
        effectiveThreshold,
      };
    }

    if (!open) {
      return {
        alert: null,
        opened: false,
        resolved: false,
        availableQuantity,
        effectiveThreshold,
      };
    }
    const resolved = await repository.resolveOpen(open._id, {
      availableQuantity,
      effectiveThreshold,
      resolvedAt: now,
      lastEvaluatedAt: now,
      crossingKey: context.eventKey || open.crossingKey || '',
    });
    return {
      alert: resolved || open,
      opened: false,
      resolved: Boolean(resolved),
      replay: !resolved,
      availableQuantity,
      effectiveThreshold,
    };
  }

  async function evaluateAll(context = {}) {
    if (!repository.listInventories) return [];
    const inventories = await repository.listInventories();
    return Promise.all(inventories.map((inventory) => evaluate(inventory, context)));
  }

  return { evaluate, evaluateAll };
}

const lowStockAlertLifecycle = createLowStockAlertLifecycle({ eventPublisher: notificationService });

module.exports = {
  createLowStockAlertLifecycle,
  lowStockAlertLifecycle,
};
