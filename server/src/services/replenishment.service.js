const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Product = require('../models/product.model');
const ReplenishmentRequest = require('../models/replenishmentRequest.model');
const { notificationService } = require('./notification.service');
const { logAudit } = require('../utils/auditLogger');

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function getProductId(inventory) {
  return inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId;
}

function getProductName(inventory) {
  return inventory.productId && inventory.productId.name ? inventory.productId.name : inventory.productName;
}

function normalizeStatus(status) {
  return status === 'Pending' ? 'PendingApproval' : status;
}

function toResponse(request, inventory) {
  return {
    id: String(request._id),
    productId: String(request.productId),
    inventoryId: String(request.inventoryId),
    productName: inventory ? getProductName(inventory) : request.productName,
    requestedBy: String(request.requestedBy),
    approvedBy: request.approvedBy ? String(request.approvedBy) : null,
    receivedBy: request.receivedBy ? String(request.receivedBy) : null,
    quantity: Number(request.quantity),
    receivedQuantity: Number(request.receivedQuantity || 0),
    status: normalizeStatus(request.status),
    reason: request.reason,
    adminNote: request.adminNote || '',
    receivedAt: request.receivedAt || null,
    createdAt: request.createdAt,
  };
}

function createModelRepository() {
  return {
    async findInventoryById(id, session) {
      return withOptionalSession(Inventory.findById(id).populate('productId'), session).lean();
    },
    async updateInventory(id, data, session) {
      return withOptionalSession(
        Inventory.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('productId'),
        session,
      ).lean();
    },
    async addReceivedStock(id, quantity, userId, session) {
      return withOptionalSession(
        Inventory.findOneAndUpdate(
          { _id: id },
          { $inc: { stockQuantity: quantity }, $set: { lastUpdatedBy: userId } },
          { new: true, runValidators: true },
        ).populate('productId'),
        session,
      ).lean();
    },
    async updateProductStock(productId, stockQuantity, session) {
      return withOptionalSession(
        Product.findByIdAndUpdate(productId, { stockQuantity }, { new: true, runValidators: true }),
        session,
      ).lean();
    },
    async createRequest(data) {
      return ReplenishmentRequest.create(data);
    },
    async listRequests(query = {}) {
      const filter = {};
      if (query.status === 'PendingApproval') filter.status = { $in: ['Pending', 'PendingApproval'] };
      else if (query.status) filter.status = query.status;
      return ReplenishmentRequest.find(filter).sort({ createdAt: -1 }).lean();
    },
    async findRequestById(id, session) {
      return withOptionalSession(ReplenishmentRequest.findById(id), session).lean();
    },
    async updateRequest(id, data, session) {
      return withOptionalSession(
        ReplenishmentRequest.findByIdAndUpdate(id, data, { new: true, runValidators: true }),
        session,
      ).lean();
    },
    async claimDecision(id, status, adminId, note, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          { _id: id, status: { $in: ['Pending', 'PendingApproval'] } },
          { $set: { status, approvedBy: adminId, adminNote: note } },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async claimReceipt(id, receivedQuantity, userId, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          { _id: id, status: 'Approved', quantity: receivedQuantity, receivedQuantity: 0 },
          { $set: { status: 'Receiving', receivedQuantity, receivedBy: userId } },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async completeReceipt(id, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          { _id: id, status: 'Receiving' },
          { $set: { status: 'Received', receivedAt: new Date() } },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async createTransaction(data, session) {
      const [transaction] = await InventoryTransaction.create([data], session ? { session } : undefined);
      return transaction.toObject();
    },
  };
}

function createReplenishmentService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
  transactionManager = createModelTransactionManager(),
  eventPublisher = notificationService,
} = {}) {
  async function writeAudit(userId, action, targetId, description) {
    await auditLogger.log({
      userId,
      action,
      targetEntity: 'ReplenishmentRequest',
      targetId: String(targetId),
      description,
    });
  }

  async function emitEvent(event) {
    try {
      if (event.recipientId && eventPublisher && eventPublisher.createInAppNotification) {
        await eventPublisher.createInAppNotification({
          userId: event.recipientId,
          type: event.type,
          subject: event.subject,
          content: event.content,
          eventId: event.idempotencyKey,
        });
      }
    } catch (_) {
      // Notification delivery must not roll back the warehouse transaction.
    }
  }

  async function listRequests(query = {}) {
    const requests = await repository.listRequests(query);
    const items = await Promise.all(
      requests.map(async (request) => toResponse(request, await repository.findInventoryById(request.inventoryId))),
    );
    return { items, total: items.length };
  }

  return {
    async createRequest(userId, input = {}) {
      const quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, 'Replenishment quantity must be a positive integer');
      }
      if (!String(input.reason || '').trim()) throw new ApiError(400, 'Replenishment reason is required');

      const inventory = await repository.findInventoryById(input.inventoryId);
      if (!inventory) throw new ApiError(404, 'Inventory record not found');
      const request = await repository.createRequest({
        productId: getProductId(inventory),
        inventoryId: inventory._id,
        requestedBy: userId,
        quantity,
        status: 'PendingApproval',
        reason: String(input.reason).trim(),
      });
      await writeAudit(userId, 'REPLENISHMENT_CREATE', request._id, `Requested replenishment for ${getProductName(inventory)}`);
      return toResponse(request, inventory);
    },

    async listWarehouseRequests(query = {}) {
      return listRequests(query);
    },

    async listAdminRequests(query = {}) {
      return listRequests(query);
    },

    async updateRequestStatus(adminId, id, input = {}) {
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      if (!['Approved', 'Rejected'].includes(input.status)) {
        throw new ApiError(400, 'Invalid replenishment decision');
      }

      const currentStatus = normalizeStatus(request.status);
      const updated = repository.claimDecision
        ? await repository.claimDecision(id, input.status, adminId, String(input.note || '').trim())
        : currentStatus === 'PendingApproval'
          ? await repository.updateRequest(id, {
              status: input.status,
              approvedBy: adminId,
              adminNote: String(input.note || '').trim(),
            })
          : null;
      if (!updated) throw new ApiError(409, 'Only PendingApproval replenishment requests can be decided');

      const inventory = await repository.findInventoryById(updated.inventoryId);
      await writeAudit(adminId, `REPLENISHMENT_${input.status.toUpperCase()}`, id, `${input.status} replenishment request`);
      await emitEvent({
        idempotencyKey: `replenishment-decision:${id}:${input.status}`,
        recipientId: updated.requestedBy,
        type: `REPLENISHMENT_${input.status.toUpperCase()}`,
        subject: `Yêu cầu bổ sung đã ${input.status === 'Approved' ? 'được duyệt' : 'bị từ chối'}`,
        content: `Yêu cầu bổ sung ${id} đã được xử lý.`,
      });
      return toResponse(updated, inventory);
    },

    async receiveRequest(userId, id, input = {}) {
      const receivedQuantity = Number(input.receivedQuantity);
      if (!Number.isInteger(receivedQuantity) || receivedQuantity <= 0) {
        throw new ApiError(400, 'Received quantity must be a positive integer');
      }

      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      if (request.status !== 'Approved') {
        throw new ApiError(409, 'Only Approved replenishment requests can be received');
      }
      if (receivedQuantity !== Number(request.quantity)) {
        throw new ApiError(400, 'Received quantity must exactly match requested quantity');
      }

      const result = await transactionManager.withTransaction(async (session) => {
        const claimed = repository.claimReceipt
          ? await repository.claimReceipt(id, receivedQuantity, userId, session)
          : request.status === 'Approved'
            ? await repository.updateRequest(id, { status: 'Receiving', receivedQuantity, receivedBy: userId }, session)
            : null;
        if (!claimed) throw new ApiError(409, 'Only Approved replenishment requests can be received once');

        const inventory = await repository.findInventoryById(claimed.inventoryId, session);
        if (!inventory) throw new ApiError(404, 'Inventory record not found');
        const updatedInventory = repository.addReceivedStock
          ? await repository.addReceivedStock(inventory._id, receivedQuantity, userId, session)
          : await repository.updateInventory(
              inventory._id,
              { stockQuantity: Number(inventory.stockQuantity || 0) + receivedQuantity, lastUpdatedBy: userId },
              session,
            );
        await repository.updateProductStock(
          getProductId(updatedInventory),
          Number(updatedInventory.stockQuantity),
          session,
        );
        await repository.createTransaction({
          productId: getProductId(inventory),
          orderId: null,
          relatedCollection: 'ReplenishmentRequest',
          relatedId: claimed._id,
          performedBy: userId,
          transactionType: 'REPLENISHMENT_RECEIVE',
          quantity: receivedQuantity,
          beforeQuantity: Number(inventory.stockQuantity || 0),
          afterQuantity: Number(updatedInventory.stockQuantity),
          reason: `Received replenishment request ${claimed._id}`,
        }, session);
        const completed = repository.completeReceipt
          ? await repository.completeReceipt(id, session)
          : await repository.updateRequest(id, { status: 'Received', receivedAt: new Date() }, session);
        if (!completed) throw new ApiError(409, 'Replenishment receipt could not be completed');
        return { completed, inventory: updatedInventory };
      });

      await writeAudit(userId, 'REPLENISHMENT_RECEIVE', id, `Received ${receivedQuantity} for ${getProductName(result.inventory)}`);
      await emitEvent({
        idempotencyKey: `replenishment-receipt:${id}`,
        recipientId: result.completed.requestedBy,
        type: 'REPLENISHMENT_RECEIVED',
        subject: 'Yêu cầu bổ sung đã được nhận',
        content: `Đã nhận ${receivedQuantity} sản phẩm vào kho.`,
      });
      return toResponse(result.completed, result.inventory);
    },
  };
}

module.exports = { createReplenishmentService, replenishmentService: createReplenishmentService() };
