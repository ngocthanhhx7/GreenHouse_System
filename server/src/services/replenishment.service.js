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
  const requestedQuantity = Number(request.requestedQuantity ?? request.quantity);
  const approvedQuantity = request.approvedQuantity === undefined || request.approvedQuantity === null
    ? (request.status === 'Approved' || request.status === 'PartiallyReceived' || request.status === 'Completed' ? requestedQuantity : null)
    : Number(request.approvedQuantity);
  return {
    id: String(request._id),
    productId: String(request.productId),
    inventoryId: String(request.inventoryId),
    productName: inventory ? getProductName(inventory) : request.productName,
    requestedBy: String(request.requestedBy),
    approvedBy: request.approvedBy ? String(request.approvedBy) : null,
    receivedBy: request.receivedBy ? String(request.receivedBy) : null,
    quantity: requestedQuantity,
    requestedQuantity,
    approvedQuantity,
    receivedQuantity: Number(request.receivedQuantity || 0),
    netAcceptedQuantity: Number(request.netAcceptedQuantity ?? request.receivedQuantity ?? 0),
    status: normalizeStatus(request.status),
    reason: request.reason,
    evidence: request.evidence || [],
    idempotencyKey: request.idempotencyKey || '',
    adminNote: request.adminNote || '',
    decisionReason: request.decisionReason || request.adminNote || '',
    receipts: request.receipts || [],
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
    async findRequestByIdempotencyKey(idempotencyKey, session) {
      return withOptionalSession(ReplenishmentRequest.findOne({ idempotencyKey }), session).lean();
    },
    async findActiveRequestByProductId(productId, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOne({ productId, status: { $in: ['PendingApproval', 'Approved', 'PartiallyReceived', 'ShortClosurePending'] } }),
        session,
      ).lean();
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
    async appendReceipt(id, receipt, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          { _id: id, status: { $in: ['Approved', 'PartiallyReceived'] }, 'receipts.idempotencyKey': { $ne: receipt.idempotencyKey } },
          { $push: { receipts: receipt } },
          { new: true, runValidators: true },
        ),
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
    async claimDecisionV2(id, patch, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          { _id: id, status: 'PendingApproval' },
          { $set: patch },
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
      const quantity = Number(input.requestedQuantity ?? input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, 'Replenishment quantity must be a positive integer');
      }
      if (!String(input.reason || '').trim()) throw new ApiError(400, 'Replenishment reason is required');

      const inventory = input.inventoryId
        ? await repository.findInventoryById(input.inventoryId)
        : (repository.findInventoryByProductId ? await repository.findInventoryByProductId(input.productId) : null);
      if (!inventory) throw new ApiError(404, 'Inventory record not found');
      const isNewContract = input.evidence !== undefined || input.idempotencyKey !== undefined;
      if (isNewContract) {
        if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new ApiError(400, 'Replenishment evidence is required');
        const idempotencyKey = String(input.idempotencyKey || '').trim();
        if (!idempotencyKey) throw new ApiError(400, 'Replenishment request idempotencyKey is required');
        if (repository.findRequestByIdempotencyKey) {
          const existing = await repository.findRequestByIdempotencyKey(idempotencyKey);
          if (existing) return { ...toResponse(existing, inventory), replay: true };
        }
        if (repository.findActiveRequestByProductId) {
          const active = await repository.findActiveRequestByProductId(getProductId(inventory));
          if (active) throw new ApiError(409, 'An active replenishment request already exists for this Product');
        }
        const request = await repository.createRequest({
          productId: getProductId(inventory),
          inventoryId: inventory._id,
          requestedBy: userId,
          quantity,
          requestedQuantity: quantity,
          approvedQuantity: null,
          netAcceptedQuantity: 0,
          status: 'PendingApproval',
          reason: String(input.reason).trim(),
          evidence: input.evidence,
          idempotencyKey,
          receipts: [],
        });
        await writeAudit(userId, 'REPLENISHMENT_CREATE', request._id, `Requested replenishment for ${getProductName(inventory)}`);
        await emitEvent({
          idempotencyKey: `replenishment-request:${idempotencyKey}`,
          recipientId: request.requestedBy,
          type: 'REPLENISHMENT_REQUESTED',
          subject: 'Replenishment request created',
          content: `Request ${request._id} is pending Admin approval.`,
        });
        return toResponse(request, inventory);
      }
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
    async withdrawRequest(userId, id, input = {}) {
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Replenishment withdrawal reason is required');
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      if (String(request.requestedBy) !== String(userId)) throw new ApiError(403, 'Only the requesting Warehouse actor can withdraw this request');
      if (normalizeStatus(request.status) !== 'PendingApproval') throw new ApiError(409, 'Only PendingApproval requests can be withdrawn');
      const updated = await repository.updateRequest(id, { status: 'Withdrawn', withdrawalReason: reason, withdrawnBy: userId, withdrawnAt: new Date() });
      if (!updated) throw new ApiError(409, 'Replenishment request changed while withdrawing');
      await writeAudit(userId, 'REPLENISHMENT_WITHDRAW', id, reason);
      return toResponse(updated, await repository.findInventoryById(updated.inventoryId));
    },
    async requestShortClosure(userId, id, input = {}) {
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Short closure reason is required');
      if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new ApiError(400, 'Short closure evidence is required');
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      if (!['Approved', 'PartiallyReceived'].includes(request.status)) throw new ApiError(409, 'Only open approved requests can request short closure');
      const updated = await repository.updateRequest(id, {
        status: 'ShortClosurePending',
        shortClosureReason: reason,
        shortClosureEvidence: input.evidence,
        shortClosureRequestedBy: userId,
      });
      if (!updated) throw new ApiError(409, 'Replenishment request changed while requesting short closure');
      await writeAudit(userId, 'REPLENISHMENT_SHORT_CLOSURE_REQUEST', id, reason);
      return toResponse(updated, await repository.findInventoryById(updated.inventoryId));
    },
    async decideShortClosure(adminId, id, input = {}) {
      const reason = String(input.reason || input.note || '').trim();
      if (!reason) throw new ApiError(400, 'Short closure decision reason is required');
      if (!['Approved', 'Rejected'].includes(input.status)) throw new ApiError(400, 'Invalid short closure decision');
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      if (request.status !== 'ShortClosurePending') throw new ApiError(409, 'Short closure is not pending');
      const fallbackStatus = Number(request.netAcceptedQuantity || request.receivedQuantity || 0) > 0 ? 'PartiallyReceived' : 'Approved';
      const updated = await repository.updateRequest(id, {
        status: input.status === 'Approved' ? 'ClosedShort' : fallbackStatus,
        shortClosureDecidedBy: adminId,
        shortClosureDecisionReason: reason,
      });
      if (!updated) throw new ApiError(409, 'Short closure changed while deciding');
      await writeAudit(adminId, `REPLENISHMENT_SHORT_CLOSURE_${input.status.toUpperCase()}`, id, reason);
      return toResponse(updated, await repository.findInventoryById(updated.inventoryId));
    },
    async correctReceipt(userId, id, input = {}) {
      const correctionQuantity = Number(input.acceptedQuantityCorrection);
      if (!Number.isInteger(correctionQuantity) || correctionQuantity === 0) throw new ApiError(400, 'acceptedQuantityCorrection must be a non-zero integer');
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Receipt correction reason is required');
      if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new ApiError(400, 'Receipt correction evidence is required');
      const idempotencyKey = String(input.idempotencyKey || '').trim();
      if (!idempotencyKey) throw new ApiError(400, 'Receipt correction idempotencyKey is required');
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      const currentNet = Number(request.netAcceptedQuantity ?? request.receivedQuantity ?? 0);
      const nextNet = currentNet + correctionQuantity;
      const approved = Number(request.approvedQuantity ?? request.requestedQuantity ?? request.quantity);
      if (nextNet < 0 || nextNet > approved) throw new ApiError(400, 'Receipt correction would make net accepted quantity invalid');
      const inventory = await repository.findInventoryById(request.inventoryId);
      const beforeSellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
      const updatedInventory = await repository.updateInventory(request.inventoryId, {
        stockQuantity: beforeSellable + correctionQuantity,
        sellableQuantity: beforeSellable + correctionQuantity,
        lastUpdatedBy: userId,
      });
      if (!updatedInventory) throw new ApiError(409, 'Inventory changed while correcting receipt');
      const updated = await repository.updateRequest(id, {
        netAcceptedQuantity: nextNet,
        receivedQuantity: nextNet,
        status: nextNet === approved ? 'Completed' : (nextNet > 0 ? 'PartiallyReceived' : 'Approved'),
      });
      await repository.createTransaction({
        productId: request.productId,
        relatedCollection: 'ReplenishmentRequest',
        relatedId: request._id,
        performedBy: userId,
        transactionType: 'REPLENISHMENT_RECEIVE_CORRECTION',
        quantity: correctionQuantity,
        beforeQuantity: beforeSellable,
        afterQuantity: beforeSellable + correctionQuantity,
        reason,
        evidence: input.evidence,
        idempotencyKey: `replenishment-correction:${idempotencyKey}`,
      });
      await writeAudit(userId, 'REPLENISHMENT_RECEIPT_CORRECTION', id, reason);
      return toResponse(updated, updatedInventory);
    },

    async updateRequestStatus(adminId, id, input = {}) {
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      if (!['Approved', 'Rejected'].includes(input.status)) {
        throw new ApiError(400, 'Invalid replenishment decision');
      }
      const isNewContract = request.requestedQuantity !== undefined || Array.isArray(request.evidence);
      const decisionReason = String(input.note ?? input.decisionReason ?? '').trim();
      if (isNewContract && !decisionReason) throw new ApiError(400, 'Replenishment decision reason is required');

      const currentStatus = normalizeStatus(request.status);
      let updated;
      if (isNewContract) {
        if (currentStatus !== 'PendingApproval') throw new ApiError(409, 'Only PendingApproval replenishment requests can be decided');
        updated = repository.claimDecisionV2
          ? await repository.claimDecisionV2(id, {
            status: input.status,
            approvedBy: adminId,
            approvedQuantity: input.status === 'Approved' ? Number(request.requestedQuantity ?? request.quantity) : null,
            adminNote: decisionReason,
            decisionReason,
            decidedAt: new Date(),
          })
          : await repository.updateRequest(id, {
            status: input.status,
            approvedBy: adminId,
            approvedQuantity: input.status === 'Approved' ? Number(request.requestedQuantity ?? request.quantity) : null,
            adminNote: decisionReason,
            decisionReason,
            decidedAt: new Date(),
          });
      } else {
        updated = repository.claimDecision
          ? await repository.claimDecision(id, input.status, adminId, decisionReason)
          : currentStatus === 'PendingApproval'
            ? await repository.updateRequest(id, {
                status: input.status,
                approvedBy: adminId,
                adminNote: decisionReason,
              })
            : null;
      }
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
      const isNewReceipt = input.deliveredQuantity !== undefined
        || input.acceptedSellableQuantity !== undefined
        || input.acceptedQuantity !== undefined
        || input.rejectedQuantity !== undefined
        || input.idempotencyKey !== undefined
        || input.supplierReference !== undefined;
      if (isNewReceipt) {
        const request = await repository.findRequestById(id);
        if (!request) throw new ApiError(404, 'Replenishment request not found');
        if (!['Approved', 'PartiallyReceived'].includes(request.status)) {
          throw new ApiError(409, 'Only Approved or PartiallyReceived replenishment requests can be received');
        }
        if (request.status === 'ShortClosurePending') throw new ApiError(409, 'Receipt is blocked while short closure is pending');
        const deliveredQuantity = Number(input.deliveredQuantity);
        const acceptedSellableQuantity = Number(input.acceptedSellableQuantity ?? input.acceptedQuantity);
        const rejectedQuantity = Number(input.rejectedQuantity);
        if (![deliveredQuantity, acceptedSellableQuantity, rejectedQuantity].every((value) => Number.isInteger(value) && value >= 0)) {
          throw new ApiError(400, 'Delivered, accepted, and rejected quantities must be non-negative integers');
        }
        if (deliveredQuantity !== acceptedSellableQuantity + rejectedQuantity) {
          throw new ApiError(400, 'Delivered quantity must equal accepted plus rejected quantity');
        }
        if (!String(input.deliveryReference || input.supplierReference || '').trim()) throw new ApiError(400, 'Supplier or delivery reference is required');
        if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new ApiError(400, 'Receipt evidence is required');
        const idempotencyKey = String(input.idempotencyKey || '').trim();
        if (!idempotencyKey) throw new ApiError(400, 'Receipt idempotencyKey is required');
        const receipts = Array.isArray(request.receipts) ? request.receipts : [];
        const existingReceipt = receipts.find((receipt) => receipt.idempotencyKey === idempotencyKey);
        if (existingReceipt) return { ...toResponse(request, await repository.findInventoryById(request.inventoryId)), receipt: existingReceipt, replay: true };
        const approvedQuantity = Number(request.approvedQuantity ?? request.requestedQuantity ?? request.quantity);
        const netAcceptedQuantity = Number(request.netAcceptedQuantity ?? request.receivedQuantity ?? 0);
        if (netAcceptedQuantity + acceptedSellableQuantity > approvedQuantity) {
          throw new ApiError(400, 'Accepted quantity exceeds remaining approved quantity');
        }
        const result = await transactionManager.withTransaction(async (session) => {
          const currentRequest = await repository.findRequestById(id, session);
          if (!currentRequest || !['Approved', 'PartiallyReceived'].includes(currentRequest.status)) throw new ApiError(409, 'Replenishment request changed while receiving');
          const inventory = await repository.findInventoryById(currentRequest.inventoryId, session);
          if (!inventory) throw new ApiError(404, 'Inventory record not found');
          const beforeSellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
          const updatedInventory = await repository.updateInventory(currentRequest.inventoryId, {
            stockQuantity: beforeSellable + acceptedSellableQuantity,
            sellableQuantity: beforeSellable + acceptedSellableQuantity,
            lastUpdatedBy: userId,
          }, session);
          if (!updatedInventory) throw new ApiError(409, 'Inventory changed while receiving replenishment');
          const receipt = {
            idempotencyKey,
            supplierReference: String(input.supplierReference || ''),
            deliveryReference: String(input.deliveryReference || ''),
            deliveredQuantity,
            acceptedSellableQuantity,
            rejectedQuantity,
            rejectedReason: String(input.rejectedReason || ''),
            evidence: input.evidence,
            inspectedBy: userId,
            inspectedAt: new Date(),
          };
          let updatedRequest;
          if (repository.appendReceipt) {
            updatedRequest = await repository.appendReceipt(id, receipt, session);
            if (!updatedRequest) throw new ApiError(409, 'Receipt idempotency key was already recorded or request is no longer receivable');
          } else {
            currentRequest.receipts = Array.isArray(currentRequest.receipts) ? currentRequest.receipts : [];
            currentRequest.receipts.push(receipt);
            updatedRequest = currentRequest;
          }
          const netAccepted = netAcceptedQuantity + acceptedSellableQuantity;
          const status = netAccepted === approvedQuantity ? 'Completed' : 'PartiallyReceived';
          updatedRequest = repository.updateRequest
            ? await repository.updateRequest(id, { netAcceptedQuantity: netAccepted, receivedQuantity: netAccepted, status }, session)
            : Object.assign(updatedRequest, { netAcceptedQuantity: netAccepted, receivedQuantity: netAccepted, status });
          const transaction = await repository.createTransaction({
            productId: currentRequest.productId,
            orderId: null,
            relatedCollection: 'ReplenishmentRequest',
            relatedId: currentRequest._id,
            performedBy: userId,
            transactionType: 'REPLENISHMENT_RECEIVE',
            quantity: acceptedSellableQuantity,
            beforeQuantity: beforeSellable,
            afterQuantity: beforeSellable + acceptedSellableQuantity,
            beforeSellableQuantity: beforeSellable,
            afterSellableQuantity: beforeSellable + acceptedSellableQuantity,
            dimension: 'sellable',
            reason: `Receipt ${id}`,
            evidence: input.evidence,
            idempotencyKey: `replenishment-receive:${idempotencyKey}`,
          }, session);
          return { updatedRequest, updatedInventory, receipt, transaction };
        });
        await writeAudit(userId, 'REPLENISHMENT_RECEIVE', id, `Accepted ${acceptedSellableQuantity} replenishment units`);
        await emitEvent({
          idempotencyKey: `replenishment-receipt:${idempotencyKey}`,
          recipientId: result.updatedRequest.requestedBy,
          type: 'REPLENISHMENT_RECEIVED',
          subject: 'Replenishment receipt recorded',
          content: `Accepted ${acceptedSellableQuantity} unit(s).`,
        });
        return { ...toResponse(result.updatedRequest, result.updatedInventory), receipt: result.receipt, transaction: result.transaction };
      }
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
