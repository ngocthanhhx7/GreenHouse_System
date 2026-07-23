const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Product = require('../models/product.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const { notificationService } = require('./notification.service');
const { logAudit } = require('../utils/auditLogger');

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
  const stockQuantity = Number(inventory.stockQuantity || 0);
  const reservedQuantity = Number(inventory.reservedQuantity || 0);
  const lowStockThreshold = Number(inventory.lowStockThreshold || 0);
  return {
    id: String(inventory._id),
    productId: String(inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId),
    productName: inventory.productId && inventory.productId.name ? inventory.productId.name : inventory.productName,
    stockQuantity,
    reservedQuantity,
    availableQuantity: stockQuantity - reservedQuantity,
    damagedQuantity: Number(inventory.damagedQuantity || 0),
    lowStockThreshold,
    isLowStock: stockQuantity - reservedQuantity <= lowStockThreshold,
    updatedAt: inventory.updatedAt,
  };
}

function toStockExportResponse(request, order, details = []) {
  return {
    id: String(request._id), orderId: String(request.orderId && request.orderId._id ? request.orderId._id : request.orderId),
    status: request.status, note: request.note || '', exportedAt: request.exportedAt || null,
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
    async claimAdjustment(id, delta, userId, session) {
      const filter = { _id: id };
      if (delta < 0) filter.$expr = { $gte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, -delta] };
      return withOptionalSession(Inventory.findOneAndUpdate(filter, { $inc: { stockQuantity: delta }, $set: { lastUpdatedBy: userId } }, { new: true, runValidators: true }).populate('productId'), session).lean();
    },
    async captureReservation(productId, quantity, userId, session) {
      return withOptionalSession(Inventory.findOneAndUpdate(
        { productId, stockQuantity: { $gte: quantity }, reservedQuantity: { $gte: quantity } },
        { $inc: { stockQuantity: -quantity, reservedQuantity: -quantity }, $set: { lastUpdatedBy: userId } },
        { new: true, runValidators: true }
      ).populate('productId'), session).lean();
    },
    async updateProductStock(productId, stockQuantity, session) { return withOptionalSession(Product.findByIdAndUpdate(productId, { stockQuantity }, { new: true, runValidators: true }), session).lean(); },
    async createTransaction(data, session) { const [transaction] = await InventoryTransaction.create([data], session ? { session } : undefined); return transaction.toObject(); },
    async listTransactions() { return InventoryTransaction.find({}).sort({ createdAt: -1 }).lean(); },
    async listStockExports() { return StockExportRequest.find({}).sort({ createdAt: -1 }).lean(); },
    async findStockExportById(id, session) { return withOptionalSession(StockExportRequest.findById(id), session).lean(); },
    async updateStockExport(id, data, session) { return withOptionalSession(StockExportRequest.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async claimExportDecision(id, status, userId, note, session) {
      return withOptionalSession(StockExportRequest.findOneAndUpdate(
        { _id: id, status: 'Pending' },
        { $set: { status, processedBy: userId, note } },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async claimExport(id, userId, note, session) {
      return withOptionalSession(StockExportRequest.findOneAndUpdate(
        { _id: id, status: 'Approved' }, { $set: { status: 'Processing', processedBy: userId, note } }, { new: true, runValidators: true }
      ), session).lean();
    },
    async completeExport(id, session) { return withOptionalSession(StockExportRequest.findOneAndUpdate({ _id: id, status: 'Processing' }, { $set: { status: 'Exported', exportedAt: new Date() } }, { new: true, runValidators: true }), session).lean(); },
    async findOrderById(id, session) { return withOptionalSession(Order.findById(id), session).lean(); },
    async updateOrder(id, data, session) { return withOptionalSession(Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async markOrderPacked(id, session) { return withOptionalSession(Order.findOneAndUpdate({ _id: id, orderStatus: 'StockExportRequested' }, { $set: { orderStatus: 'Packed', packedAt: new Date() } }, { new: true, runValidators: true }), session).lean(); },
    async reopenOrderAfterRejectedExport(id, session) {
      return withOptionalSession(Order.findOneAndUpdate(
        { _id: id, orderStatus: 'StockExportRequested' },
        { $set: { orderStatus: 'Confirmed' } },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async listOrderDetails(orderId, session) { return withOptionalSession(OrderDetail.find({ orderId }), session).lean(); },
    async listProducts() { return Product.find({ status: 'Active' }).lean(); },
    async createInventory(data) { return Inventory.create(data); },
  };
}

function createInventoryService({ repository = createModelRepository(), auditLogger = { log: logAudit }, transactionManager = createModelTransactionManager(), eventPublisher = notificationService } = {}) {
  async function getInventoryOrThrow(id) { const inventory = await repository.findInventoryById(id); if (!inventory) throw new ApiError(404, 'Inventory record not found'); return inventory; }
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
    }, session);
  }
  async function emitEvent(event) {
    try {
      if (event.recipientId && eventPublisher && eventPublisher.createInAppNotification) await eventPublisher.createInAppNotification({ userId: event.recipientId, type: event.type, subject: event.subject, content: event.content, eventId: event.idempotencyKey });
    } catch (_) { /* Notification delivery is intentionally outside the inventory transaction. */ }
  }
  async function ensureInventoryRecords() {
    const products = await repository.listProducts();
    for (const product of products) {
      const existing = await repository.findInventoryByProductId(product._id);
      if (!existing) await repository.createInventory({ productId: product._id, stockQuantity: Number(product.stockQuantity || 0), reservedQuantity: 0, damagedQuantity: 0, lowStockThreshold: 5, lastUpdatedBy: null });
    }
  }
  return {
    async listInventory() { await ensureInventoryRecords(); const inventories = await repository.listInventories(); return { items: inventories.map(toInventoryResponse), total: inventories.length }; },
    async getInventory(id) { return toInventoryResponse(await getInventoryOrThrow(id)); },
    async adjustInventory(userId, id, input = {}) {
      if (!String(input.reason || '').trim()) throw new ApiError(400, 'Adjustment reason is required');
      const delta = Number(input.delta);
      if (!Number.isInteger(delta) || delta === 0) throw new ApiError(400, 'Adjustment delta must be a non-zero integer');
      const result = await transactionManager.withTransaction(async (session) => {
        const inventory = await repository.findInventoryById(id, session);
        if (!inventory) throw new ApiError(404, 'Inventory record not found');
        if (Number(inventory.stockQuantity) + delta < 0) throw new ApiError(400, 'Inventory stock cannot be negative');
        if (delta < 0 && Number(inventory.stockQuantity) - Number(inventory.reservedQuantity) < -delta) {
          throw new ApiError(400, 'Inventory adjustment would violate available inventory');
        }
        const updated = repository.claimAdjustment
          ? await repository.claimAdjustment(id, delta, userId, session)
          : await repository.updateInventory(id, { stockQuantity: Number(inventory.stockQuantity) + delta, lastUpdatedBy: userId }, session);
        if (!updated) throw new ApiError(409, 'Inventory adjustment would violate available inventory');
        const updatedResponse = toInventoryResponse(updated);
        await repository.updateProductStock(updatedResponse.productId, updatedResponse.stockQuantity, session);
        await createTransaction(userId, inventory, {
          transactionType: 'ADJUSTMENT', quantity: delta,
          beforeQuantity: Number(inventory.stockQuantity), afterQuantity: updatedResponse.stockQuantity,
          reason: String(input.reason).trim(), relatedCollection: 'Inventory', relatedId: id,
        }, session);
        return { updated, updatedResponse };
      });
      await auditLogger.log({ userId, action: 'INVENTORY_ADJUST', targetEntity: 'Inventory', targetId: String(id), description: `Adjusted stock by ${delta}` });
      if (result.updatedResponse.isLowStock) await emitEvent({ idempotencyKey: `low-stock:${id}:${result.updated.updatedAt || result.updatedResponse.stockQuantity}`, recipientId: userId, type: 'LOW_STOCK', subject: 'Cảnh báo tồn kho thấp', content: `${result.updatedResponse.productName} còn ${result.updatedResponse.availableQuantity} khả dụng.` });
      return { inventory: result.updatedResponse };
    },
    async listLowStock() { const inventory = await this.listInventory(); const items = inventory.items.filter((item) => item.isLowStock); return { items, total: items.length }; },
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
        await emitEvent({ idempotencyKey: `stock-export-decision:${id}:${nextStatus}`, recipientId: request.requestedBy, type: `STOCK_EXPORT_${nextStatus.toUpperCase()}`, subject: `Phiếu xuất kho đã ${nextStatus === 'Approved' ? 'được duyệt' : 'bị từ chối'}`, content: `Phiếu xuất kho ${id} đã được xử lý.` });
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
          const before = await repository.findInventoryByProductId(detail.productId, session);
          if (!before || Number(before.stockQuantity) < quantity) throw new ApiError(409, 'Insufficient stock for export');
          if (!before || Number(before.reservedQuantity) < quantity) throw new ApiError(409, 'Stock export requires a full reservation');
          const after = repository.captureReservation ? await repository.captureReservation(detail.productId, quantity, userId, session) : await repository.updateInventory(before._id, { stockQuantity: Number(before.stockQuantity) - quantity, reservedQuantity: Number(before.reservedQuantity) - quantity, lastUpdatedBy: userId }, session);
          if (!after) throw new ApiError(409, 'Stock export requires a full reservation');
          const afterResponse = toInventoryResponse(after);
          await repository.updateProductStock(afterResponse.productId, afterResponse.stockQuantity, session);
          await createTransaction(userId, before, { transactionType: 'STOCK_EXPORT', quantity: -quantity, beforeQuantity: Number(before.stockQuantity), afterQuantity: afterResponse.stockQuantity, reason: `Stock export for order ${order.orderCode}`, orderId: order._id, relatedCollection: 'StockExportRequest', relatedId: id }, session);
          transactions.push(afterResponse);
        }
        const packed = repository.markOrderPacked ? await repository.markOrderPacked(order._id, session) : await repository.updateOrder(order._id, { orderStatus: 'Packed', packedAt: new Date() }, session);
        if (!packed) throw new ApiError(409, 'Order changed while stock export was being processed');
        const exported = repository.completeExport ? await repository.completeExport(id, session) : await repository.updateStockExport(id, { status: 'Exported' }, session);
        if (!exported) throw new ApiError(409, 'Stock export could not be completed');
        return { exported, packed, details, inventories: transactions };
      });
      await auditLogger.log({ userId, action: 'INVENTORY_EXPORT', targetEntity: 'StockExportRequest', targetId: String(id), description: `Exported stock for order ${result.packed.orderCode}` });
      await emitEvent({ idempotencyKey: `stock-export:${id}`, recipientId: result.packed.customerId, type: 'STOCK_EXPORT', subject: 'Đơn hàng đã được xuất kho', content: `Đơn ${result.packed.orderCode} đã được xuất kho.` });
      const stockExport = toStockExportResponse(result.exported, result.packed, result.details);
      return { stockExport, order: { id: String(result.packed._id), orderStatus: result.packed.orderStatus } };
    },
  };
}

module.exports = { createInventoryService, inventoryService: createInventoryService() };
