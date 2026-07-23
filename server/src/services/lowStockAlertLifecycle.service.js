const LowStockAlert = require('../models/lowStockAlert.model');
const SystemSetting = require('../models/systemSetting.model');
const { notificationService } = require('./notification.service');

const DEFAULT_THRESHOLD = 5;

function productIdOf(inventory) {
  return inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId;
}

function createModelRepository() {
  return {
    async listInventories() { return require('../models/inventory.model').find({}).lean(); },
    async findDefaultThreshold() {
      const setting = await SystemSetting.findOne({ key: 'LOW_STOCK_DEFAULT_THRESHOLD' }).lean();
      return setting ? Number(setting.value) : DEFAULT_THRESHOLD;
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
  async function publishCrossing(alert, context) {
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
      sourceEventKey: context.eventKey || '',
      subject: 'Low stock alert',
      content: `Product ${String(alert.productId)} has ${alert.availableQuantity} available.`,
    };
    try {
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
      await publishCrossing(created, context);
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
