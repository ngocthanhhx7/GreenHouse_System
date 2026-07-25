const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const ReplenishmentReceipt = require('../models/replenishmentReceipt.model');
const ReplenishmentRequest = require('../models/replenishmentRequest.model');
const { notificationService } = require('./notification.service');
const { lowStockAlertLifecycle: defaultLowStockLifecycle } = require('./lowStockAlertLifecycle.service');
const { logAudit } = require('../utils/auditLogger');
const {
  assignmentCoordinator: defaultAssignmentCoordinator,
} = require('./assignmentCoordination.service');

const ACTIVE_REQUEST_STATUSES = ['PendingApproval', 'Approved', 'PartiallyReceived', 'ShortClosurePending'];
const RECEIVABLE_STATUSES = ['Approved', 'PartiallyReceived'];
const CORRECTABLE_STATUSES = ['Approved', 'PartiallyReceived', 'Completed'];

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

function productIdOf(inventory) {
  return inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId;
}

function productNameOf(inventory) {
  return inventory.productId && inventory.productId.name ? inventory.productId.name : inventory.productName;
}

function toResponse(request, inventory) {
  const requestedQuantity = Number(request.requestedQuantity ?? request.quantity);
  const approvedQuantity = request.approvedQuantity === undefined || request.approvedQuantity === null
    ? (['Approved', 'PartiallyReceived', 'Completed', 'ClosedShort'].includes(request.status)
      ? requestedQuantity
      : null)
    : Number(request.approvedQuantity);
  return {
    id: String(request._id),
    productId: String(request.productId),
    inventoryId: String(request.inventoryId),
    productName: inventory ? productNameOf(inventory) : request.productName,
    requestedBy: String(request.requestedBy),
    approvedBy: request.approvedBy ? String(request.approvedBy) : null,
    receivedBy: request.receivedBy ? String(request.receivedBy) : null,
    quantity: requestedQuantity,
    requestedQuantity,
    approvedQuantity,
    receivedQuantity: Number(request.receivedQuantity || 0),
    netAcceptedQuantity: Number(request.netAcceptedQuantity ?? request.receivedQuantity ?? 0),
    status: request.status,
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
    async findInventoryByProductId(productId, session) {
      return withOptionalSession(Inventory.findOne({ productId }).populate('productId'), session).lean();
    },
    async updateInventory(id, data, session) {
      return withOptionalSession(
        Inventory.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('productId'),
        session,
      ).lean();
    },
    async createRequest(data, session) {
      const [created] = await ReplenishmentRequest.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async findRequestByIdempotencyKey(idempotencyKey, session) {
      return withOptionalSession(ReplenishmentRequest.findOne({ idempotencyKey }), session).lean();
    },
    async findActiveRequestByProductId(productId, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOne({ productId, status: { $in: ACTIVE_REQUEST_STATUSES } }),
        session,
      ).lean();
    },
    async listRequests(query = {}) {
      const filter = {};
      if (query.status) filter.status = query.status;
      return ReplenishmentRequest.find(filter).sort({ createdAt: -1 }).lean();
    },
    async findRequestById(id, session) {
      return withOptionalSession(ReplenishmentRequest.findById(id), session).lean();
    },
    async claimDecision(id, patch, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          { _id: id, status: 'PendingApproval' },
          { $set: patch },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async claimWithdrawal(id, requestedBy, patch, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          { _id: id, status: 'PendingApproval', requestedBy },
          { $set: patch },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async claimShortClosureRequest(id, patch, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          { _id: id, status: { $in: RECEIVABLE_STATUSES } },
          { $set: patch },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async claimShortClosureDecision(id, patch, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          { _id: id, status: 'ShortClosurePending' },
          { $set: patch },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async findReceiptById(id, session) {
      return withOptionalSession(ReplenishmentReceipt.findById(id), session).lean();
    },
    async findReceiptByIdempotencyKey(idempotencyKey, session) {
      return withOptionalSession(ReplenishmentReceipt.findOne({ idempotencyKey }), session).lean();
    },
    async createReceipt(data, session) {
      const [receipt] = await ReplenishmentReceipt.create([data], session ? { session } : undefined);
      return receipt.toObject();
    },
    async claimReceiptProjection(id, expected, patch, receipt, session) {
      return withOptionalSession(
        ReplenishmentRequest.findOneAndUpdate(
          {
            _id: id,
            status: expected.status,
            netAcceptedQuantity: expected.netAcceptedQuantity,
            'receipts.idempotencyKey': { $ne: receipt.idempotencyKey },
          },
          { $set: patch, $push: { receipts: receipt } },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async claimCorrectionProjection(id, expected, patch, receipt, session) {
      return this.claimReceiptProjection(id, expected, patch, receipt, session);
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
  lowStockLifecycle = null,
  assignmentCoordinator = defaultAssignmentCoordinator,
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
      if (eventPublisher?.publishDomainEvent) {
        await eventPublisher.publishDomainEvent(event);
      } else if (eventPublisher?.createRoleNotifications && event.recipientRole) {
        await eventPublisher.createRoleNotifications(event);
      } else if (eventPublisher?.createInAppNotification && event.recipientId) {
        await eventPublisher.createInAppNotification({
          userId: event.recipientId,
          type: event.type,
          displayValues: event.displayValues || {},
          eventId: event.idempotencyKey,
          targetCollection: event.targetCollection || '',
          targetId: event.targetId || null,
        });
      }
    } catch (_) {
      // Notification delivery never rolls back the committed warehouse command.
    }
  }

  async function listRequests(query = {}) {
    const requests = await repository.listRequests(query);
    const items = await Promise.all(
      requests.map(async (request) => toResponse(request, await repository.findInventoryById(request.inventoryId))),
    );
    return { items, total: items.length };
  }

  async function replayReceipt(id, receipt) {
    const request = await repository.findRequestById(id);
    if (!request) throw new ApiError(404, 'Replenishment request not found');
    const inventory = await repository.findInventoryById(request.inventoryId);
    if (!inventory) throw new ApiError(404, 'Inventory record not found');
    return { ...toResponse(request, inventory), receipt, replay: true };
  }

  const api = {
    async createRequest(userId, input = {}) {
      const quantity = Number(input.requestedQuantity ?? input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, 'Replenishment quantity must be a positive integer');
      }
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Replenishment reason is required');
      if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
        throw new ApiError(400, 'Replenishment evidence is required');
      }
      const idempotencyKey = String(input.idempotencyKey || '').trim();
      if (!idempotencyKey) throw new ApiError(400, 'Replenishment request idempotencyKey is required');
      const inventory = input.inventoryId
        ? await repository.findInventoryById(input.inventoryId)
        : await repository.findInventoryByProductId?.(input.productId);
      if (!inventory) throw new ApiError(404, 'Inventory record not found');
      const existing = await repository.findRequestByIdempotencyKey?.(idempotencyKey);
      if (existing) return { ...toResponse(existing, inventory), replay: true };
      const active = await repository.findActiveRequestByProductId?.(productIdOf(inventory));
      if (active) throw new ApiError(409, 'An active replenishment request already exists for this Product');

      let request;
      try {
        request = await transactionManager.withTransaction(async (session) => {
          await assignmentCoordinator.coordinate({
            userId,
            expectedRole: 'WarehouseManager',
            session,
          });
          return repository.createRequest({
            productId: productIdOf(inventory),
            inventoryId: inventory._id,
            requestedBy: userId,
            quantity,
            requestedQuantity: quantity,
            approvedQuantity: null,
            receivedQuantity: 0,
            netAcceptedQuantity: 0,
            status: 'PendingApproval',
            reason,
            evidence: input.evidence,
            idempotencyKey,
            receipts: [],
          }, session);
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const winner = await repository.findRequestByIdempotencyKey?.(idempotencyKey);
        if (winner) return { ...toResponse(winner, inventory), replay: true };
        throw new ApiError(409, 'An active replenishment request already exists for this Product');
      }

      await writeAudit(userId, 'REPLENISHMENT_CREATE', request._id, `Requested replenishment for ${productNameOf(inventory)}`);
      await emitEvent({
        idempotencyKey: `replenishment-request:${idempotencyKey}`,
        recipientRole: 'Admin',
        targetCollection: 'ReplenishmentRequest',
        targetId: request._id,
        type: 'REPLENISHMENT_REQUESTED',
        displayValues: { quantity },
      });
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
      if (String(request.requestedBy) !== String(userId)) {
        throw new ApiError(403, 'Only the requesting Warehouse actor can withdraw this request');
      }
      if (request.status !== 'PendingApproval') {
        throw new ApiError(409, 'Only PendingApproval requests can be withdrawn');
      }
      const updated = await repository.claimWithdrawal(id, userId, {
        status: 'Withdrawn',
        withdrawalReason: reason,
        withdrawnBy: userId,
        withdrawnAt: new Date(),
      });
      if (!updated) throw new ApiError(409, 'Replenishment request changed while withdrawing');
      await writeAudit(userId, 'REPLENISHMENT_WITHDRAW', id, reason);
      return toResponse(updated, await repository.findInventoryById(updated.inventoryId));
    },

    async requestShortClosure(userId, id, input = {}) {
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Short closure reason is required');
      if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
        throw new ApiError(400, 'Short closure evidence is required');
      }
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      if (!RECEIVABLE_STATUSES.includes(request.status)) {
        throw new ApiError(409, 'Only open approved requests can request short closure');
      }
      const updated = await repository.claimShortClosureRequest(id, {
        status: 'ShortClosurePending',
        shortClosureBaseStatus: request.status,
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
      if (!['Approved', 'Rejected'].includes(input.status)) {
        throw new ApiError(400, 'Invalid short closure decision');
      }
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      if (request.status !== 'ShortClosurePending') throw new ApiError(409, 'Short closure is not pending');
      const fallbackStatus = request.shortClosureBaseStatus
        || (Number(request.netAcceptedQuantity || request.receivedQuantity || 0) > 0 ? 'PartiallyReceived' : 'Approved');
      const updated = await repository.claimShortClosureDecision(id, {
        status: input.status === 'Approved' ? 'ClosedShort' : fallbackStatus,
        shortClosureDecidedBy: adminId,
        shortClosureDecisionReason: reason,
        shortClosureDecidedAt: new Date(),
      });
      if (!updated) throw new ApiError(409, 'Short closure changed while deciding');
      await writeAudit(adminId, `REPLENISHMENT_SHORT_CLOSURE_${input.status.toUpperCase()}`, id, reason);
      return toResponse(updated, await repository.findInventoryById(updated.inventoryId));
    },

    async updateRequestStatus(adminId, id, input = {}) {
      if (!['Approved', 'Rejected'].includes(input.status)) {
        throw new ApiError(400, 'Invalid replenishment decision');
      }
      const decisionReason = String(input.note ?? input.decisionReason ?? '').trim();
      if (!decisionReason) throw new ApiError(400, 'Replenishment decision reason is required');
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Replenishment request not found');
      if (request.status !== 'PendingApproval') {
        throw new ApiError(409, 'Only PendingApproval replenishment requests can be decided');
      }
      const updated = await repository.claimDecision(id, {
        status: input.status,
        approvedBy: adminId,
        approvedQuantity: input.status === 'Approved'
          ? Number(request.requestedQuantity ?? request.quantity)
          : null,
        adminNote: decisionReason,
        decisionReason,
        decidedAt: new Date(),
      });
      if (!updated) throw new ApiError(409, 'Only PendingApproval replenishment requests can be decided');
      const inventory = await repository.findInventoryById(updated.inventoryId);
      await writeAudit(adminId, `REPLENISHMENT_${input.status.toUpperCase()}`, id, `${input.status} replenishment request`);
      await emitEvent({
        idempotencyKey: `replenishment-decision:${id}:${input.status}`,
        recipientId: updated.requestedBy,
        targetCollection: 'ReplenishmentRequest',
        targetId: updated._id,
        type: `REPLENISHMENT_${input.status.toUpperCase()}`,
        displayValues: { quantity: updated.requestedQuantity },
      });
      return toResponse(updated, inventory);
    },

    async receiveRequest(userId, id, input = {}) {
      if (input.receivedQuantity !== undefined) {
        throw new ApiError(400, 'Use the evidence-backed delivery receipt contract');
      }
      const deliveredQuantity = Number(input.deliveredQuantity);
      const acceptedSellableQuantity = Number(input.acceptedSellableQuantity ?? input.acceptedQuantity);
      const rejectedQuantity = Number(input.rejectedQuantity);
      if (![deliveredQuantity, acceptedSellableQuantity, rejectedQuantity]
        .every((value) => Number.isInteger(value) && value >= 0)) {
        throw new ApiError(400, 'Delivered, accepted, and rejected quantities must be non-negative integers');
      }
      if (deliveredQuantity !== acceptedSellableQuantity + rejectedQuantity) {
        throw new ApiError(400, 'Delivered quantity must equal accepted plus rejected quantity');
      }
      const supplierReference = String(input.supplierReference || '').trim();
      const deliveryReference = String(input.deliveryReference || '').trim();
      if (!supplierReference) throw new ApiError(400, 'Supplier reference is required');
      if (!deliveryReference) throw new ApiError(400, 'Delivery reference is required');
      if (rejectedQuantity > 0 && !String(input.rejectedReason || '').trim()) {
        throw new ApiError(400, 'Rejected reason is required when delivered units are rejected');
      }
      if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
        throw new ApiError(400, 'Receipt evidence is required');
      }
      const idempotencyKey = String(input.idempotencyKey || '').trim();
      if (!idempotencyKey) throw new ApiError(400, 'Receipt idempotencyKey is required');
      const receiptKey = `replenishment-receipt:${id}:${idempotencyKey}`;
      const existing = await repository.findReceiptByIdempotencyKey?.(receiptKey);
      if (existing) return replayReceipt(id, existing);

      let result;
      try {
        result = await transactionManager.withTransaction(async (session) => {
          await assignmentCoordinator.coordinate({
            userId,
            expectedRole: 'WarehouseManager',
            session,
          });
          const request = await repository.findRequestById(id, session);
          if (!request) throw new ApiError(404, 'Replenishment request not found');
          if (!RECEIVABLE_STATUSES.includes(request.status)) {
            throw new ApiError(409, 'Only Approved or PartiallyReceived replenishment requests can be received');
          }
          const approvedQuantity = Number(request.approvedQuantity ?? request.requestedQuantity ?? request.quantity);
          const netAcceptedQuantity = Number(request.netAcceptedQuantity ?? request.receivedQuantity ?? 0);
          const nextNet = netAcceptedQuantity + acceptedSellableQuantity;
          if (nextNet > approvedQuantity) {
            throw new ApiError(400, 'Accepted quantity exceeds remaining approved quantity');
          }
          const inventory = await repository.findInventoryById(request.inventoryId, session);
          if (!inventory) throw new ApiError(404, 'Inventory record not found');
          const beforeSellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
          const receipt = await repository.createReceipt({
            recordType: 'Receipt',
            replenishmentRequestId: request._id,
            productId: request.productId,
            supplierReference,
            deliveryReference,
            deliveredQuantity,
            acceptedSellableQuantity,
            rejectedQuantity,
            rejectedReason: String(input.rejectedReason || '').trim(),
            acceptedQuantityCorrection: 0,
            reason: '',
            evidence: input.evidence,
            inspectedBy: userId,
            inspectedAt: new Date(),
            idempotencyKey: receiptKey,
            correctionOf: null,
          }, session);
          const status = nextNet === approvedQuantity
            ? 'Completed'
            : (nextNet > 0 ? 'PartiallyReceived' : 'Approved');
          const updatedRequest = await repository.claimReceiptProjection(
            id,
            { status: request.status, netAcceptedQuantity },
            {
              netAcceptedQuantity: nextNet,
              receivedQuantity: nextNet,
              status,
              receivedBy: userId,
              receivedAt: acceptedSellableQuantity > 0 ? new Date() : request.receivedAt,
            },
            receipt,
            session,
          );
          if (!updatedRequest) throw new ApiError(409, 'Replenishment request changed while receiving');

          let updatedInventory = inventory;
          let transaction = null;
          if (acceptedSellableQuantity > 0) {
            const afterSellable = beforeSellable + acceptedSellableQuantity;
            const inventoryHealth = afterSellable < Number(inventory.reservedQuantity || 0)
              ? 'ReconciliationRequired'
              : 'Normal';
            updatedInventory = await repository.updateInventory(request.inventoryId, {
              stockQuantity: afterSellable,
              sellableQuantity: afterSellable,
              inventoryHealth,
              affectedOrderIds: inventoryHealth === 'Normal' ? [] : (inventory.affectedOrderIds || []),
              lastUpdatedBy: userId,
            }, session);
            if (!updatedInventory) throw new ApiError(409, 'Inventory changed while receiving replenishment');
            transaction = await repository.createTransaction({
              productId: request.productId,
              orderId: null,
              relatedCollection: 'ReplenishmentRequest',
              relatedId: request._id,
              performedBy: userId,
              transactionType: 'REPLENISHMENT_RECEIVE',
              quantity: acceptedSellableQuantity,
              beforeQuantity: beforeSellable,
              afterQuantity: afterSellable,
              beforeSellableQuantity: beforeSellable,
              afterSellableQuantity: afterSellable,
              dimension: 'sellable',
              reason: `Receipt ${String(receipt._id)}`,
              evidence: input.evidence,
              idempotencyKey: receiptKey,
              movementKey: receiptKey,
            }, session);
          }
          return { updatedRequest, updatedInventory, receipt, transaction };
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const winner = await repository.findReceiptByIdempotencyKey?.(receiptKey);
        if (!winner) throw error;
        return replayReceipt(id, winner);
      }

      await writeAudit(userId, 'REPLENISHMENT_RECEIVE', id, `Accepted ${acceptedSellableQuantity} replenishment units`);
      await lowStockLifecycle?.evaluate(result.updatedInventory, { eventKey: receiptKey });
      await emitEvent({
        idempotencyKey: receiptKey,
        recipientId: result.updatedRequest.requestedBy,
        targetCollection: 'ReplenishmentRequest',
        targetId: result.updatedRequest._id,
        type: 'REPLENISHMENT_RECEIVED',
        displayValues: { quantity: acceptedSellableQuantity },
      });
      return {
        ...toResponse(result.updatedRequest, result.updatedInventory),
        receipt: result.receipt,
        transaction: result.transaction,
      };
    },

    async correctReceipt(userId, id, input = {}) {
      const correctionQuantity = Number(input.acceptedQuantityCorrection);
      if (!Number.isInteger(correctionQuantity) || correctionQuantity === 0) {
        throw new ApiError(400, 'acceptedQuantityCorrection must be a non-zero integer');
      }
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Receipt correction reason is required');
      if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
        throw new ApiError(400, 'Receipt correction evidence is required');
      }
      const idempotencyKey = String(input.idempotencyKey || '').trim();
      if (!idempotencyKey) throw new ApiError(400, 'Receipt correction idempotencyKey is required');
      const originalReceiptId = String(input.originalReceiptId || input.correctionOf || '').trim();
      if (!originalReceiptId) throw new ApiError(400, 'originalReceiptId is required');
      const correctionKey = `replenishment-correction:${id}:${idempotencyKey}`;
      const existing = await repository.findReceiptByIdempotencyKey?.(correctionKey);
      if (existing) return replayReceipt(id, existing);

      let result;
      try {
        result = await transactionManager.withTransaction(async (session) => {
          const request = await repository.findRequestById(id, session);
          if (!request) throw new ApiError(404, 'Replenishment request not found');
          if (!CORRECTABLE_STATUSES.includes(request.status)) {
            throw new ApiError(409, 'Only an accepted replenishment receipt can be corrected');
          }
          const original = await repository.findReceiptById(originalReceiptId, session);
          if (!original
            || String(original.replenishmentRequestId) !== String(request._id)
            || (original.recordType && original.recordType !== 'Receipt')) {
            throw new ApiError(400, 'originalReceiptId must identify an immutable receipt for this request');
          }
          const currentNet = Number(request.netAcceptedQuantity ?? request.receivedQuantity ?? 0);
          const nextNet = currentNet + correctionQuantity;
          const approvedQuantity = Number(request.approvedQuantity ?? request.requestedQuantity ?? request.quantity);
          if (nextNet < 0 || nextNet > approvedQuantity) {
            throw new ApiError(400, 'Receipt correction would make net accepted quantity invalid');
          }
          const inventory = await repository.findInventoryById(request.inventoryId, session);
          if (!inventory) throw new ApiError(404, 'Inventory record not found');
          const beforeSellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
          const afterSellable = beforeSellable + correctionQuantity;
          if (afterSellable < 0) {
            throw new ApiError(400, 'Receipt correction would make sellable quantity negative');
          }
          const correction = await repository.createReceipt({
            recordType: 'Correction',
            replenishmentRequestId: request._id,
            productId: request.productId,
            supplierReference: original.supplierReference,
            deliveryReference: original.deliveryReference,
            deliveredQuantity: 0,
            acceptedSellableQuantity: 0,
            rejectedQuantity: 0,
            rejectedReason: '',
            acceptedQuantityCorrection: correctionQuantity,
            reason,
            evidence: input.evidence,
            inspectedBy: userId,
            inspectedAt: new Date(),
            idempotencyKey: correctionKey,
            correctionOf: original._id,
          }, session);
          const status = nextNet === approvedQuantity
            ? 'Completed'
            : (nextNet > 0 ? 'PartiallyReceived' : 'Approved');
          const updatedRequest = await repository.claimCorrectionProjection(
            id,
            { status: request.status, netAcceptedQuantity: currentNet },
            { netAcceptedQuantity: nextNet, receivedQuantity: nextNet, status },
            correction,
            session,
          );
          if (!updatedRequest) {
            throw new ApiError(409, 'Replenishment request changed while correcting receipt');
          }
          const inventoryHealth = afterSellable < Number(inventory.reservedQuantity || 0)
            ? 'ReconciliationRequired'
            : 'Normal';
          const updatedInventory = await repository.updateInventory(request.inventoryId, {
            stockQuantity: afterSellable,
            sellableQuantity: afterSellable,
            inventoryHealth,
            affectedOrderIds: inventoryHealth === 'Normal' ? [] : (inventory.affectedOrderIds || []),
            lastUpdatedBy: userId,
          }, session);
          if (!updatedInventory) throw new ApiError(409, 'Inventory changed while correcting receipt');
          const transaction = await repository.createTransaction({
            productId: request.productId,
            orderId: null,
            relatedCollection: 'ReplenishmentRequest',
            relatedId: request._id,
            performedBy: userId,
            transactionType: 'REPLENISHMENT_RECEIVE_CORRECTION',
            quantity: correctionQuantity,
            beforeQuantity: beforeSellable,
            afterQuantity: afterSellable,
            beforeSellableQuantity: beforeSellable,
            afterSellableQuantity: afterSellable,
            dimension: 'sellable',
            reason,
            evidence: input.evidence,
            idempotencyKey: correctionKey,
            movementKey: correctionKey,
          }, session);
          return { updatedRequest, updatedInventory, correction, transaction };
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const winner = await repository.findReceiptByIdempotencyKey?.(correctionKey);
        if (!winner) throw error;
        return replayReceipt(id, winner);
      }

      await writeAudit(userId, 'REPLENISHMENT_RECEIPT_CORRECTION', id, reason);
      await lowStockLifecycle?.evaluate(result.updatedInventory, { eventKey: correctionKey });
      return {
        ...toResponse(result.updatedRequest, result.updatedInventory),
        receipt: result.correction,
        transaction: result.transaction,
      };
    },
  };

  return api;
}

module.exports = {
  createReplenishmentService,
  replenishmentService: createReplenishmentService({ lowStockLifecycle: defaultLowStockLifecycle }),
};
