// SL-005 inventory core. SL-004 exact export commands are composed in inventory.service.js.
const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Product = require('../models/product.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const OrderReservation = require('../models/orderReservation.model');
const LowStockAlert = require('../models/lowStockAlert.model');
const { notificationService } = require('./notification.service');
const { systemSettingService } = require('./systemSetting.service');
const { lowStockAlertLifecycle: defaultLowStockLifecycle } = require('./lowStockAlertLifecycle.service');
const { logAudit } = require('../utils/auditLogger');
const {
  assignmentCoordinator: defaultAssignmentCoordinator,
} = require('./assignmentCoordination.service');

function withOptionalSession(query, session) { return session ? query.session(session) : query; }

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } finally { await session.endSession(); }
    },
  };
}

function toInventoryResponse(inventory) {
  const sellableQuantity = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
  const stockQuantity = sellableQuantity;
  const reservedQuantity = Number(inventory.reservedQuantity || 0);
  const quarantinedQuantity = Number(inventory.quarantinedQuantity || 0);
  const damagedQuantity = Number(inventory.damagedQuantity || 0);
  const lowStockThreshold = Number(inventory.lowStockThreshold || 0);
  const effectiveThreshold = inventory.effectiveThreshold !== undefined && inventory.effectiveThreshold !== null
    ? Number(inventory.effectiveThreshold)
    : (inventory.lowStockThresholdOverride !== undefined && inventory.lowStockThresholdOverride !== null
      ? Number(inventory.lowStockThresholdOverride)
      : lowStockThreshold);
  const inventoryHealth = inventory.inventoryHealth || (reservedQuantity > sellableQuantity ? 'ReconciliationRequired' : 'Normal');
  const availableQuantity = inventoryHealth === 'ReconciliationRequired'
    ? 0
    : Math.max(0, sellableQuantity - reservedQuantity);
  return {
    id: String(inventory._id),
    productId: String(inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId),
    productName: inventory.productId && inventory.productId.name ? inventory.productId.name : inventory.productName,
    stockQuantity,
    sellableQuantity,
    reservedQuantity,
    quarantinedQuantity,
    onHandQuantity: sellableQuantity + quarantinedQuantity + damagedQuantity,
    availableQuantity,
    damagedQuantity,
    inventoryHealth,
    affectedOrderIds: (inventory.affectedOrderIds || []).map((id) => String(id)),
    effectiveThreshold,
    lowStockThreshold,
    isLowStock: availableQuantity <= effectiveThreshold,
    updatedAt: inventory.updatedAt,
  };
}

function toStockExportResponse(request, order, details = []) {
  return {
    id: String(request._id), orderId: String(request.orderId && request.orderId._id ? request.orderId._id : request.orderId),
    cycleId: request.cycleId ? String(request.cycleId) : null,
    requestKind: request.requestKind || 'Initial',
    status: request.status,
    note: request.note || '',
    processingStartedAt: request.processingStartedAt || null,
    completedAt: request.completedAt || request.exportedAt || null,
    failureCode: request.failureCode || '',
    failureReason: request.failureReason || '',
    order: order ? { id: String(order._id), orderCode: order.orderCode, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, totalAmount: order.totalAmount, shippingAddress: order.shippingAddress } : null,
    details, createdAt: request.createdAt, updatedAt: request.updatedAt,
  };
}

function createModelRepository() {
  return {
    async listInventories() { return Inventory.find({}).populate('productId').sort({ updatedAt: -1 }).lean(); },
    async findInventoryById(id, session) { return withOptionalSession(Inventory.findById(id).populate('productId'), session).lean(); },
    async findInventoryByProductId(productId, session) { return withOptionalSession(Inventory.findOne({ productId }).populate('productId'), session).lean(); },
    async updateInventory(id, data, session) { return withOptionalSession(Inventory.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('productId'), session).lean(); },
    async findTransactionByIdempotencyKey(idempotencyKey, session) {
      if (!idempotencyKey) return null;
      return withOptionalSession(InventoryTransaction.findOne({ idempotencyKey }), session).lean();
    },
    async claimPhysicalCount(id, countedSellableQuantity, userId, patch, session) {
      return withOptionalSession(Inventory.findByIdAndUpdate(
        id,
        {
          $set: {
            stockQuantity: countedSellableQuantity,
            sellableQuantity: countedSellableQuantity,
            lastUpdatedBy: userId,
            ...patch,
          },
        },
        { new: true, runValidators: false },
      ).populate('productId'), session).lean();
    },
    async claimAdjustment(id, delta, userId, session) {
      const filter = { _id: id };
      if (delta < 0) filter.$expr = { $gte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, -delta] };
      return withOptionalSession(Inventory.findOneAndUpdate(filter, { $inc: { stockQuantity: delta, sellableQuantity: delta }, $set: { lastUpdatedBy: userId } }, { new: true, runValidators: true }).populate('productId'), session).lean();
    },
    async captureReservation(productId, quantity, userId, session) {
      return withOptionalSession(Inventory.findOneAndUpdate(
        { productId, inventoryHealth: { $ne: 'ReconciliationRequired' }, stockQuantity: { $gte: quantity }, reservedQuantity: { $gte: quantity } },
        { $inc: { stockQuantity: -quantity, sellableQuantity: -quantity, reservedQuantity: -quantity }, $set: { lastUpdatedBy: userId } },
        { new: true, runValidators: true }
      ).populate('productId'), session).lean();
    },
    async createTransaction(data, session) { const [transaction] = await InventoryTransaction.create([data], session ? { session } : undefined); return transaction.toObject(); },
    async listTransactions() { return InventoryTransaction.find({}).sort({ createdAt: -1 }).lean(); },
    async listLowStockAlerts(query = {}) { return LowStockAlert.find(query).sort({ updatedAt: -1 }).lean(); },
    async listStockExports() { return StockExportRequest.find({}).sort({ createdAt: -1 }).lean(); },
    async findStockExportById(id, session) { return withOptionalSession(StockExportRequest.findById(id), session).lean(); },
    async updateStockExport(id, data, session) { return withOptionalSession(StockExportRequest.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async claimExportProcessing(id, commandKey, userId, note, session) {
      return withOptionalSession(StockExportRequest.findOneAndUpdate(
        { _id: id, status: { $in: ['Pending', 'Failed'] } },
        {
          $set: {
            status: 'Processing',
            processingCommandKey: commandKey,
            processingStartedAt: new Date(),
            processedBy: userId,
            note,
            failureCode: '',
            failureReason: '',
          },
        },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async completeExport(id, commandKey, completedAt, session) {
      return withOptionalSession(StockExportRequest.findOneAndUpdate(
        { _id: id, status: 'Processing', processingCommandKey: commandKey },
        {
          $set: {
            status: 'Completed',
            completedCommandKey: commandKey,
            completedAt,
            exportedAt: completedAt,
          },
        },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async failExport(id, commandKey, failureCode, failureReason, session) {
      return withOptionalSession(StockExportRequest.findOneAndUpdate(
        { _id: id, status: 'Processing', processingCommandKey: commandKey },
        { $set: { status: 'Failed', failureCode, failureReason } },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async findOrderById(id, session) { return withOptionalSession(Order.findById(id), session).lean(); },
    async updateOrder(id, data, session) { return withOptionalSession(Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async listOrderDetails(orderId, session) { return withOptionalSession(OrderDetail.find({ orderId }), session).lean(); },
    async claimOrderReservationConsumption(orderId, orderDetailId, session) {
      return withOptionalSession(
        OrderReservation.findOneAndUpdate(
          { orderId, orderDetailId, status: 'Reserved' },
          { $set: { status: 'Consumed' } },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async listProducts() { return Product.find({ status: 'Active' }).lean(); },
    async findAffectedOrderIds(productId, session) {
      const details = await withOptionalSession(OrderDetail.find({ productId }).select('orderId'), session).lean();
      const orderIds = [...new Set(details.map((detail) => String(detail.orderId)))];
      if (!orderIds.length) return [];
      const orders = await withOptionalSession(Order.find({
        _id: { $in: orderIds },
        orderStatus: { $nin: ['Delivered', 'Cancelled', 'Returned'] },
      }).select('_id'), session).lean();
      return orders.map((order) => order._id);
    },
    async createInventory(data) { return Inventory.create(data); },
  };
}

function createInventoryService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
  transactionManager = createModelTransactionManager(),
  eventPublisher = notificationService,
  thresholdProvider = null,
  lowStockLifecycle = null,
  assignmentCoordinator = defaultAssignmentCoordinator,
} = {}) {
  const physicalCountResults = new Map();
  async function getInventoryOrThrow(id) { const inventory = await repository.findInventoryById(id); if (!inventory) throw new ApiError(404, 'Inventory record not found'); return inventory; }
  function evidenceRequired(evidence) {
    return Array.isArray(evidence) && evidence.length > 0;
  }
  function quantityOf(inventory) {
    return Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
  }
  async function createTransaction(performedBy, inventory, input, session) {
    return repository.createTransaction({
      productId: inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId,
      orderId: input.orderId || null,
      relatedCollection: input.relatedCollection || '',
      relatedId: input.relatedId || null,
      performedBy,
      transactionType: input.transactionType,
      quantity: input.quantity,
      beforeQuantity: input.beforeQuantity,
      afterQuantity: input.afterQuantity,
      reason: input.reason || '',
      movementKey: input.movementKey || input.idempotencyKey || '',
      idempotencyKey: input.idempotencyKey || '',
      dimension: input.dimension || '',
      beforeSellableQuantity: input.beforeSellableQuantity ?? null,
      afterSellableQuantity: input.afterSellableQuantity ?? null,
      beforeQuarantinedQuantity: input.beforeQuarantinedQuantity ?? null,
      afterQuarantinedQuantity: input.afterQuarantinedQuantity ?? null,
      beforeDamagedQuantity: input.beforeDamagedQuantity ?? null,
      afterDamagedQuantity: input.afterDamagedQuantity ?? null,
      evidence: input.evidence || [],
    }, session);
  }
  async function emitEvent(event) {
    try {
      if (eventPublisher?.publishDomainEvent) await eventPublisher.publishDomainEvent(event);
      else if (eventPublisher?.createRoleNotifications && event.recipientRole) await eventPublisher.createRoleNotifications(event);
      else if (event.recipientId && eventPublisher && eventPublisher.createInAppNotification) await eventPublisher.createInAppNotification({ userId: event.recipientId, type: event.type, displayValues: event.displayValues || {}, eventId: event.idempotencyKey, targetCollection: event.targetCollection || '', targetId: event.targetId || null });
    } catch (_) { /* Notification delivery is intentionally outside the inventory transaction. */ }
  }
  async function ensureInventoryRecords() {
    const products = await repository.listProducts();
    let defaultThreshold = 5;
    try {
      const settings = thresholdProvider && await thresholdProvider.listSettings();
      const settingValues = settings?.current?.values || settings;
      if (settingValues?.LOW_STOCK_DEFAULT_THRESHOLD !== undefined) defaultThreshold = Number(settingValues.LOW_STOCK_DEFAULT_THRESHOLD);
    } catch (_) { /* keep legacy fallback when settings are unavailable */ }
    for (const product of products) {
      const existing = await repository.findInventoryByProductId(product._id);
      if (!existing) await repository.createInventory({ productId: product._id, stockQuantity: 0, sellableQuantity: 0, reservedQuantity: 0, quarantinedQuantity: 0, damagedQuantity: 0, lowStockThreshold: defaultThreshold, lowStockThresholdOverride: null, lastUpdatedBy: null });
    }
  }
  async function withEffectiveThreshold(inventory) {
    if (inventory.lowStockThresholdOverride !== undefined && inventory.lowStockThresholdOverride !== null) return inventory;
    try {
      const settings = thresholdProvider && await thresholdProvider.listSettings();
      const settingValues = settings?.current?.values || settings;
      if (settingValues?.LOW_STOCK_DEFAULT_THRESHOLD !== undefined) {
        return { ...inventory, effectiveThreshold: Number(settingValues.LOW_STOCK_DEFAULT_THRESHOLD), lowStockThreshold: Number(settingValues.LOW_STOCK_DEFAULT_THRESHOLD) };
      }
    } catch (_) { /* fallback to persisted legacy threshold */ }
    return inventory;
  }
  return {
    async listInventory() { await ensureInventoryRecords(); const inventories = await repository.listInventories(); const normalized = await Promise.all(inventories.map(withEffectiveThreshold)); return { items: normalized.map(toInventoryResponse), total: normalized.length }; },
    async getInventory(id) { return toInventoryResponse(await withEffectiveThreshold(await getInventoryOrThrow(id))); },
    async recordPhysicalCount(userId, id, input = {}) {
      if (input.delta !== undefined || input.adjustmentDelta !== undefined) {
        throw new ApiError(400, 'Physical count requires countedSellableQuantity, not a signed delta');
      }
      const countedSellableQuantity = Number(input.countedSellableQuantity);
      if (!Number.isInteger(countedSellableQuantity) || countedSellableQuantity < 0) {
        throw new ApiError(400, 'countedSellableQuantity must be a non-negative integer');
      }
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Physical count reason is required');
      if (!evidenceRequired(input.evidence)) throw new ApiError(400, 'Physical count evidence is required');
      const idempotencyKey = String(input.idempotencyKey || '').trim();
      if (!idempotencyKey) throw new ApiError(400, 'Physical count idempotencyKey is required');

      if (physicalCountResults.has(idempotencyKey)) {
        const existing = physicalCountResults.get(idempotencyKey);
        const inventory = await repository.findInventoryById(id);
        return { inventory: toInventoryResponse(inventory), transaction: existing, replay: true };
      }
      if (repository.findTransactionByIdempotencyKey) {
        const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);
        if (existing) {
          const inventory = await repository.findInventoryById(id);
          return { inventory: toInventoryResponse(inventory), transaction: existing, replay: true };
        }
      }

      const result = await transactionManager.withTransaction(async (session) => {
        const inventory = await repository.findInventoryById(id, session);
        if (!inventory) throw new ApiError(404, 'Inventory record not found');
        const beforeSellableQuantity = quantityOf(inventory);
        const patch = {
          stockQuantity: countedSellableQuantity,
          sellableQuantity: countedSellableQuantity,
          lastUpdatedBy: userId,
          inventoryHealth: countedSellableQuantity < Number(inventory.reservedQuantity || 0)
            ? 'ReconciliationRequired'
            : (inventory.inventoryHealth === 'ReconciliationRequired' ? 'Normal' : (inventory.inventoryHealth || 'Normal')),
        };
        if (patch.inventoryHealth === 'ReconciliationRequired') {
          patch.affectedOrderIds = repository.findAffectedOrderIds
            ? await repository.findAffectedOrderIds(inventory.productId, session)
            : (inventory.affectedOrderIds || []);
        } else {
          patch.affectedOrderIds = [];
        }
        const updated = repository.claimPhysicalCount
          ? await repository.claimPhysicalCount(id, countedSellableQuantity, userId, {
            inventoryHealth: patch.inventoryHealth,
            affectedOrderIds: patch.affectedOrderIds,
          }, session)
          : await repository.updateInventory(id, patch, session);
        if (!updated) throw new ApiError(409, 'Inventory changed while recording physical count');
        // Some test/dummy repositories only implement claimPhysicalCount and do not
        // apply health fields; preserve the derived result in the returned object.
        Object.assign(updated, { ...patch });
        const transaction = await createTransaction(userId, inventory, {
          transactionType: 'PHYSICAL_COUNT',
          quantity: countedSellableQuantity - beforeSellableQuantity,
          beforeQuantity: beforeSellableQuantity,
          afterQuantity: countedSellableQuantity,
          beforeSellableQuantity,
          afterSellableQuantity: countedSellableQuantity,
          dimension: 'sellable',
          reason,
          evidence: input.evidence,
          idempotencyKey,
          relatedCollection: 'Inventory',
          relatedId: id,
        }, session);
        return { updated, transaction };
      });
      await auditLogger.log({ userId, action: 'INVENTORY_PHYSICAL_COUNT', targetEntity: 'Inventory', targetId: String(id), description: `Recorded sellable count ${countedSellableQuantity}` });
      physicalCountResults.set(idempotencyKey, result.transaction);
      const response = toInventoryResponse(result.updated);
      await lowStockLifecycle?.evaluate(result.updated, { eventKey: idempotencyKey });
      return { inventory: response, transaction: result.transaction };
    },
    async setThresholdOverride(userId, id, input = {}) {
      const hasValue = input.threshold !== undefined && input.threshold !== null && input.threshold !== '';
      const threshold = hasValue ? Number(input.threshold) : null;
      if (hasValue && (!Number.isInteger(threshold) || threshold < 0)) throw new ApiError(400, 'Threshold must be a non-negative integer');
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Threshold change reason is required');
      const inventory = await repository.findInventoryById(id);
      if (!inventory) throw new ApiError(404, 'Inventory record not found');
      let fallbackThreshold = 0;
      if (threshold === null && thresholdProvider?.listSettings) {
        try {
          const settings = await thresholdProvider.listSettings();
          fallbackThreshold = Number((settings?.current?.values || settings)?.LOW_STOCK_DEFAULT_THRESHOLD ?? 0);
        } catch (_) { /* leave zero only when settings are unavailable */ }
      }
      const updated = await repository.updateInventory(id, { lowStockThreshold: threshold === null ? fallbackThreshold : threshold, lowStockThresholdOverride: threshold, lastUpdatedBy: userId }, null);
      if (!updated) throw new ApiError(409, 'Inventory threshold changed concurrently');
      await auditLogger.log({ userId, action: 'INVENTORY_THRESHOLD_OVERRIDE', targetEntity: 'Inventory', targetId: String(id), description: reason });
      await lowStockLifecycle?.evaluate(updated, { eventKey: `threshold-override:${id}:${updated.updatedAt || threshold}` });
      return { inventory: toInventoryResponse(updated) };
    },
    async adjustInventory(userId, id, input = {}) {
      if (!String(input.reason || '').trim()) throw new ApiError(400, 'Adjustment reason is required');
      const delta = Number(input.delta);
      if (!Number.isInteger(delta) || delta === 0) throw new ApiError(400, 'Adjustment delta must be a non-zero integer');
      const result = await transactionManager.withTransaction(async (session) => {
        const inventory = await repository.findInventoryById(id, session);
        if (!inventory) throw new ApiError(404, 'Inventory record not found');
        const beforeSellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
        if (beforeSellable + delta < 0) throw new ApiError(400, 'Inventory stock cannot be negative');
        if (delta < 0 && beforeSellable - Number(inventory.reservedQuantity || 0) < -delta) {
          throw new ApiError(400, 'Inventory adjustment would violate available inventory');
        }
        const updated = repository.claimAdjustment
          ? await repository.claimAdjustment(id, delta, userId, session)
          : await repository.updateInventory(id, {
            stockQuantity: beforeSellable + delta,
            sellableQuantity: beforeSellable + delta,
            lastUpdatedBy: userId,
          }, session);
        if (!updated) throw new ApiError(409, 'Inventory adjustment would violate available inventory');
        const updatedResponse = toInventoryResponse(updated);
        await createTransaction(userId, inventory, {
          transactionType: 'ADJUSTMENT', quantity: delta,
          beforeQuantity: beforeSellable, afterQuantity: updatedResponse.stockQuantity,
          reason: String(input.reason).trim(), relatedCollection: 'Inventory', relatedId: id,
        }, session);
        return { updated, updatedResponse };
      });
      await auditLogger.log({ userId, action: 'INVENTORY_ADJUST', targetEntity: 'Inventory', targetId: String(id), description: `Adjusted stock by ${delta}` });
      await lowStockLifecycle?.evaluate(result.updated, { eventKey: `legacy-adjustment:${id}:${result.updated.updatedAt || result.updatedResponse.stockQuantity}` });
      return { inventory: result.updatedResponse };
    },
    async listLowStock() { const inventory = await this.listInventory(); const items = inventory.items.filter((item) => item.isLowStock); return { items, total: items.length }; },
    async listLowStockAlerts(query = {}) {
      if (repository.listLowStockAlerts) {
        const alerts = await repository.listLowStockAlerts(query.status ? { status: query.status } : {});
        return { items: alerts, total: alerts.length };
      }
      const inventory = await this.listInventory();
      return {
        items: inventory.items.filter((item) => item.isLowStock).map((item) => ({
          productId: item.productId,
          inventoryId: item.id,
          status: 'Open',
          availableQuantity: item.availableQuantity,
          effectiveThreshold: item.effectiveThreshold,
        })),
        total: inventory.items.filter((item) => item.isLowStock).length,
      };
    },
    async listTransactions() {
      const transactions = repository.listTransactions ? await repository.listTransactions() : [];
      return { items: transactions, total: transactions.length };
    },
    async listStockExports() { const requests = await repository.listStockExports(); const items = await Promise.all(requests.map(async (request) => toStockExportResponse(request, await repository.findOrderById(request.orderId)))); return { items, total: items.length }; },
    async getStockExport(id) { const request = await repository.findStockExportById(id); if (!request) throw new ApiError(404, 'Stock export request not found'); const [order, details] = await Promise.all([repository.findOrderById(request.orderId), repository.listOrderDetails(request.orderId)]); return toStockExportResponse(request, order, details); },
    async updateStockExportStatus(userId, id, input = {}) {
      const request = await repository.findStockExportById(id);
      if (!request) throw new ApiError(404, 'Stock export request not found');
      const nextStatus = input.status;
      if (!['Approved', 'Rejected', 'Exported'].includes(nextStatus)) throw new ApiError(400, 'Invalid stock export status');
      if (request.status === 'Exported' && nextStatus === 'Exported') return { stockExport: await this.getStockExport(id), order: { id: String(request.orderId), orderStatus: 'Packed' }, replay: true };
      if (request.status === 'Rejected' || request.status === 'Exported') throw new ApiError(409, 'Stock export request is already closed');
      if (nextStatus !== 'Exported') {
        if (request.status !== 'Pending') throw new ApiError(409, 'Only Pending stock export requests can be decided');
        const decision = await transactionManager.withTransaction(async (session) => {
          if (nextStatus === 'Approved') {
            await assignmentCoordinator.coordinate({
              userId,
              expectedRole: 'WarehouseManager',
              session,
            });
          }
          const note = input.note !== undefined ? String(input.note || '').trim() : request.note;
          const updatedRequest = repository.claimExportDecision
            ? await repository.claimExportDecision(id, nextStatus, userId, note, session)
            : await repository.updateStockExport(id, { status: nextStatus, processedBy: userId, note }, session);
          if (!updatedRequest) throw new ApiError(409, 'Stock export request was already decided');

          let order = await repository.findOrderById(updatedRequest.orderId, session);
          if (nextStatus === 'Rejected') {
            order = repository.reopenOrderAfterRejectedExport
              ? await repository.reopenOrderAfterRejectedExport(updatedRequest.orderId, session)
              : await repository.updateOrder(updatedRequest.orderId, { orderStatus: 'Confirmed' }, session);
            if (!order) throw new ApiError(409, 'Order changed while rejecting the stock export request');
          } else if (nextStatus === 'Approved' && order && order.orderStatus === 'Confirmed') {
            // SL-003 confirmation creates the downstream request while the
            // order remains Confirmed. Once Warehouse accepts that request,
            // advance the fulfillment hand-off exactly once so the export
            // command can atomically capture the reservation.
            order = await repository.updateOrder(
              updatedRequest.orderId,
              { orderStatus: 'StockExportRequested' },
              session
            );
            if (!order) throw new ApiError(409, 'Order changed while approving the stock export request');
          }
          return { updatedRequest, order };
        });
        await auditLogger.log({ userId, action: `STOCK_EXPORT_${nextStatus.toUpperCase()}`, targetEntity: 'StockExportRequest', targetId: String(id), description: `${nextStatus} stock export request` });
        await emitEvent({ idempotencyKey: `stock-export-decision:${id}:${nextStatus}`, recipientId: request.requestedBy, type: `STOCK_EXPORT_${nextStatus.toUpperCase()}`, displayValues: { quantity: request.requestedQuantity || 0 }, targetCollection: 'StockExportRequest', targetId: request._id });
        return {
          stockExport: await this.getStockExport(decision.updatedRequest._id),
          order: { id: String(decision.order._id), orderStatus: decision.order.orderStatus },
        };
      }
      if (request.status !== 'Approved') throw new ApiError(409, 'Stock export request must be approved before export');
      const result = await transactionManager.withTransaction(async (session) => {
        const claimed = repository.claimExport ? await repository.claimExport(id, userId, input.note !== undefined ? String(input.note || '').trim() : request.note, session) : await repository.updateStockExport(id, { status: 'Processing' }, session);
        if (!claimed) throw new ApiError(409, 'Stock export request is already being processed');
        const order = await repository.findOrderById(claimed.orderId, session);
        if (!order || order.orderStatus !== 'StockExportRequested') throw new ApiError(409, 'Stock export requires a valid StockExportRequested order');
        const details = await repository.listOrderDetails(claimed.orderId, session);
        if (!details.length) throw new ApiError(409, 'Stock export requires order items');
        const transactions = [];
        for (const detail of details) {
          const quantity = Number(detail.quantity);
          if (repository.claimOrderReservationConsumption) {
            const reservation = await repository.claimOrderReservationConsumption(
              order._id,
              detail._id,
              session
            );
            if (!reservation) {
              throw new ApiError(409, 'Order reservation lineage is missing or already consumed');
            }
          }
          const before = await repository.findInventoryByProductId(detail.productId, session);
          if (before?.inventoryHealth === 'ReconciliationRequired') {
            throw new ApiError(409, 'Stock export is blocked while Inventory reconciliation is required');
          }
          const beforeSellable = Number(before?.sellableQuantity ?? before?.stockQuantity ?? 0);
          if (!before || beforeSellable < quantity) throw new ApiError(409, 'Insufficient stock for export');
          if (!before || Number(before.reservedQuantity) < quantity) throw new ApiError(409, 'Stock export requires a full reservation');
          const after = repository.captureReservation
            ? await repository.captureReservation(detail.productId, quantity, userId, session)
            : await repository.updateInventory(before._id, {
              stockQuantity: beforeSellable - quantity,
              sellableQuantity: beforeSellable - quantity,
              reservedQuantity: Number(before.reservedQuantity) - quantity,
              lastUpdatedBy: userId,
            }, session);
          if (!after) throw new ApiError(409, 'Stock export requires a full reservation');
          const afterResponse = toInventoryResponse(after);
          await createTransaction(userId, before, { transactionType: 'STOCK_EXPORT', quantity: -quantity, beforeQuantity: beforeSellable, afterQuantity: afterResponse.stockQuantity, reason: `Stock export for order ${order.orderCode}`, orderId: order._id, relatedCollection: 'StockExportRequest', relatedId: id }, session);
          transactions.push(after);
        }
        const packed = repository.markOrderPacked ? await repository.markOrderPacked(order._id, session) : await repository.updateOrder(order._id, { orderStatus: 'Packed', packedAt: new Date() }, session);
        if (!packed) throw new ApiError(409, 'Order changed while stock export was being processed');
        const exported = repository.completeExport ? await repository.completeExport(id, session) : await repository.updateStockExport(id, { status: 'Exported' }, session);
        if (!exported) throw new ApiError(409, 'Stock export could not be completed');
        return { exported, packed, details, inventories: transactions };
      });
      await auditLogger.log({ userId, action: 'INVENTORY_EXPORT', targetEntity: 'StockExportRequest', targetId: String(id), description: `Exported stock for order ${result.packed.orderCode}` });
      for (const inventory of result.inventories) {
        await lowStockLifecycle?.evaluate(inventory, { eventKey: `stock-export:${id}` });
      }
      await emitEvent({ idempotencyKey: `stock-export:${id}`, recipientId: result.packed.customerId, type: 'STOCK_EXPORT', displayValues: { quantity: result.details.reduce((total, detail) => total + Number(detail.quantity || 0), 0) }, targetCollection: 'StockExportRequest', targetId: result.exported._id });
      const stockExport = toStockExportResponse(result.exported, result.packed, result.details);
      return { stockExport, order: { id: String(result.packed._id), orderStatus: result.packed.orderStatus } };
    },
  };
}

module.exports = {
  createInventoryService,
  inventoryService: createInventoryService({
    thresholdProvider: systemSettingService,
    lowStockLifecycle: defaultLowStockLifecycle,
  }),
};
