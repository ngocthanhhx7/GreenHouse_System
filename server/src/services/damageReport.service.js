const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const DamageReport = require('../models/damageReport.model');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const { logAudit } = require('../utils/auditLogger');
const { notificationService } = require('./notification.service');

const DAMAGE_REPORT_STATUSES = new Set([
  'PendingWarehouseConfirmation',
  'PendingReview', 'Confirming', 'Confirmed', 'PartiallyConfirmed', 'Rejected', 'Withdrawn',
]);

function withOptionalSession(query, session) { return session ? query.session(session) : query; }
function createModelTransactionManager() { return { async withTransaction(work) { const session = await mongoose.startSession(); try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; } finally { await session.endSession(); } } }; }
function toResponse(report) {
  const reportedQuantity = Number(report.reportedQuantity ?? report.quantity);
  return {
    id: String(report._id),
    inventoryId: String(report.inventoryId),
    productId: String(report.productId),
    quantity: reportedQuantity,
    reportedQuantity,
    confirmedQuantity: report.confirmedQuantity === null || report.confirmedQuantity === undefined ? null : Number(report.confirmedQuantity),
    reason: report.reason,
    decisionReason: report.decisionReason || '',
    evidence: report.evidence || [],
    decisionEvidence: report.decisionEvidence || [],
    idempotencyKey: report.idempotencyKey || '',
    status: report.status,
    reportedBy: String(report.reportedBy),
    confirmedBy: report.confirmedBy ? String(report.confirmedBy) : null,
    confirmedAt: report.confirmedAt || null,
    withdrawnBy: report.withdrawnBy ? String(report.withdrawnBy) : null,
    withdrawnAt: report.withdrawnAt || null,
    createdAt: report.createdAt,
  };
}
function createModelRepository() { return {
  async listReports(query = {}) {
    const filter = query.status ? { status: query.status } : {};
    return DamageReport.find(filter).sort({ createdAt: -1 }).lean();
  },
  async createReport(data, session) { const [report] = await DamageReport.create([data], session ? { session } : undefined); return report.toObject(); },
  async findReportByIdempotencyKey(idempotencyKey, session) { return withOptionalSession(DamageReport.findOne({ idempotencyKey }), session).lean(); },
  async updateReport(id, data, session) { return withOptionalSession(DamageReport.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
  async claimDamageReport(id, patch, session) {
    return withOptionalSession(
      DamageReport.findOneAndUpdate({ _id: id, status: { $in: ['PendingReview', 'PendingWarehouseConfirmation'] } }, { $set: patch }, { new: true, runValidators: true }),
      session,
    ).lean();
  },
  async findReportById(id, session) { return withOptionalSession(DamageReport.findById(id), session).lean(); },
  async claimConfirmation(id, warehouseId, session) { return withOptionalSession(DamageReport.findOneAndUpdate({ _id: id, status: 'PendingWarehouseConfirmation' }, { $set: { status: 'Confirming', confirmedBy: warehouseId } }, { new: true, runValidators: true }), session).lean(); },
  async completeConfirmation(id, session) { return withOptionalSession(DamageReport.findOneAndUpdate({ _id: id, status: 'Confirming' }, { $set: { status: 'Confirmed', confirmedAt: new Date() } }, { new: true, runValidators: true }), session).lean(); },
  async findInventoryById(id, session) { return withOptionalSession(Inventory.findById(id), session).lean(); },
  async findInventoryByProductId(productId, session) { return withOptionalSession(Inventory.findOne({ productId }), session).lean(); },
  async updateInventory(id, patch, session) { return withOptionalSession(Inventory.findByIdAndUpdate(id, patch, { new: true, runValidators: true }), session).lean(); },
  async quarantineInventory(id, reportedQuantity, actorId, session) {
    return withOptionalSession(Inventory.findOneAndUpdate(
      {
        _id: id,
        $expr: { $gte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, reportedQuantity] },
      },
      {
        $inc: { stockQuantity: -reportedQuantity, sellableQuantity: -reportedQuantity, quarantinedQuantity: reportedQuantity },
        $set: { lastUpdatedBy: actorId },
      },
      { new: true, runValidators: false },
    ), session).lean();
  },
  async applyDamage(id, quantity, warehouseId, session) { return withOptionalSession(Inventory.findOneAndUpdate({ _id: id, $expr: { $gte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, quantity] } }, { $inc: { stockQuantity: -quantity, damagedQuantity: quantity }, $set: { lastUpdatedBy: warehouseId } }, { new: true, runValidators: true }), session).lean(); },
  async createTransaction(data, session) { const [transaction] = await InventoryTransaction.create([data], session ? { session } : undefined); return transaction.toObject(); },
  async findTransactionByIdempotencyKey(key, session) { return withOptionalSession(InventoryTransaction.findOne({ idempotencyKey: key }), session).lean(); },
}; }
function createDamageReportService({
  repository = createModelRepository(),
  transactionManager = createModelTransactionManager(),
  auditLogger = { log: logAudit },
  eventPublisher = null,
} = {}) {
  async function emitEvent(event) {
    try {
      if (eventPublisher?.createInAppNotification && event.recipientId) {
        await eventPublisher.createInAppNotification({
          userId: event.recipientId,
          type: event.type,
          subject: event.subject,
          content: event.content,
          eventId: event.idempotencyKey,
        });
      }
    } catch (_) { /* Notifications never roll back committed inventory facts. */ }
  }
  const api = {
    async listWarehouseReports(query = {}) {
      const status = String(query.status || '').trim();
      if (status && !DAMAGE_REPORT_STATUSES.has(status)) {
        throw new ApiError(400, 'Invalid damage report status');
      }
      const reports = await repository.listReports(status ? { status } : {});
      return { items: reports.map(toResponse), total: reports.length };
    },
    async getWarehouseReport(id) {
      const report = await repository.findReportById(id);
      if (!report) throw new ApiError(404, 'Damage report not found');
      return toResponse(report);
    },
    async getStaffReport(staffId, id) {
      const report = await repository.findReportById(id);
      if (!report) throw new ApiError(404, 'Damage report not found');
      if (String(report.reportedBy) !== String(staffId)) throw new ApiError(403, 'Damage report is not owned by this Staff actor');
      return toResponse(report);
    },
    async createStaffReport(staffId, input = {}) {
      const quantity = Number(input.reportedQuantity ?? input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError(400, 'Damage quantity must be a positive integer');
      if (!String(input.reason || '').trim()) throw new ApiError(400, 'Damage reason is required');
      const inventory = input.inventoryId
        ? await repository.findInventoryById(input.inventoryId)
        : (repository.findInventoryByProductId ? await repository.findInventoryByProductId(input.productId) : null);
      if (!inventory) throw new ApiError(404, 'Inventory record not found');
      const isNewContract = input.evidence !== undefined || input.idempotencyKey !== undefined;
      if (isNewContract) {
        if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new ApiError(400, 'Damage evidence is required');
        const idempotencyKey = String(input.idempotencyKey || '').trim();
        if (!idempotencyKey) throw new ApiError(400, 'Damage report idempotencyKey is required');
        if (repository.findReportByIdempotencyKey) {
          const existing = await repository.findReportByIdempotencyKey(idempotencyKey);
          if (existing) return { ...toResponse(existing), replay: true };
        }
        const sellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
        if (quantity > sellable) throw new ApiError(400, 'Damage quantity exceeds sellable inventory');
        const result = await transactionManager.withTransaction(async (session) => {
          const current = await repository.findInventoryById(input.inventoryId, session);
          if (!current) throw new ApiError(404, 'Inventory record not found');
          const currentSellable = Number(current.sellableQuantity ?? current.stockQuantity ?? 0);
          if (quantity > currentSellable) throw new ApiError(409, 'Damage quantity exceeds sellable inventory');
          const updated = repository.quarantineInventory
            ? await repository.quarantineInventory(input.inventoryId, quantity, staffId, session)
            : await repository.updateInventory(input.inventoryId, {
              stockQuantity: currentSellable - quantity,
              sellableQuantity: currentSellable - quantity,
              quarantinedQuantity: Number(current.quarantinedQuantity || 0) + quantity,
              lastUpdatedBy: staffId,
              inventoryHealth: (currentSellable - quantity) < Number(current.reservedQuantity || 0) ? 'ReconciliationRequired' : (current.inventoryHealth || 'Normal'),
            }, session);
          if (!updated) throw new ApiError(409, 'Inventory changed while reporting damage');
          if (repository.updateInventory && repository.quarantineInventory) {
            await repository.updateInventory(input.inventoryId, {
              inventoryHealth: (currentSellable - quantity) < Number(current.reservedQuantity || 0) ? 'ReconciliationRequired' : (current.inventoryHealth || 'Normal'),
            }, session);
          }
          const report = await repository.createReport({
            inventoryId: current._id,
            productId: current.productId,
            reportedBy: staffId,
            quantity,
            reportedQuantity: quantity,
            reason: String(input.reason).trim(),
            evidence: input.evidence,
            idempotencyKey,
            status: 'PendingReview',
          }, session);
          const transaction = await repository.createTransaction({
            productId: current.productId,
            orderId: null,
            relatedCollection: 'DamageReport',
            relatedId: report._id,
            performedBy: staffId,
            transactionType: 'DAMAGE_QUARANTINED',
            quantity: -quantity,
            beforeQuantity: currentSellable,
            afterQuantity: currentSellable - quantity,
            beforeSellableQuantity: currentSellable,
            afterSellableQuantity: currentSellable - quantity,
            beforeQuarantinedQuantity: Number(current.quarantinedQuantity || 0),
            afterQuarantinedQuantity: Number(current.quarantinedQuantity || 0) + quantity,
            dimension: 'quarantined',
            reason: String(input.reason).trim(),
            evidence: input.evidence,
            idempotencyKey: `damage-quarantine:${idempotencyKey}`,
          }, session);
          return { report, updated, transaction };
        });
        await auditLogger.log({ userId: staffId, action: 'DAMAGE_REPORT_CREATE', targetEntity: 'DamageReport', targetId: String(result.report._id), description: `Quarantined ${quantity} item(s)` });
        await emitEvent({
          idempotencyKey: `damage-report:${idempotencyKey}`,
          recipientId: staffId,
          type: 'DAMAGE_REPORTED',
          subject: 'Damage report submitted',
          content: `Damage report ${result.report._id} is pending Warehouse review.`,
        });
        return toResponse(result.report);
      }
      const report = await repository.createReport({ inventoryId: inventory._id, productId: inventory.productId, reportedBy: staffId, quantity, reason: String(input.reason).trim(), status: 'PendingWarehouseConfirmation' });
      await auditLogger.log({ userId: staffId, action: 'DAMAGE_REPORT_CREATE', targetEntity: 'DamageReport', targetId: String(report._id), description: `Reported ${quantity} damaged item(s)` });
      return toResponse(report);
    },
    async resolveWarehouseReport(warehouseId, id, input = {}) {
      const confirmedQuantity = Number(input.confirmedQuantity);
      if (!Number.isInteger(confirmedQuantity) || confirmedQuantity < 0) throw new ApiError(400, 'confirmedQuantity must be a non-negative integer');
      const decisionReason = String(input.decisionReason || '').trim();
      if (!decisionReason) throw new ApiError(400, 'Damage decision reason is required');
      if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new ApiError(400, 'Damage decision evidence is required');

      const result = await transactionManager.withTransaction(async (session) => {
        const current = await repository.findReportById(id, session);
        if (!current) throw new ApiError(404, 'Damage report not found');
        const status = current.status === 'PendingWarehouseConfirmation' ? 'PendingReview' : current.status;
        if (status !== 'PendingReview') throw new ApiError(409, 'Only PendingReview damage reports can be decided');
        const reportedQuantity = Number(current.reportedQuantity ?? current.quantity);
        if (confirmedQuantity > reportedQuantity) throw new ApiError(400, 'confirmedQuantity cannot exceed reportedQuantity');
        const claimed = repository.claimDamageReport
          ? await repository.claimDamageReport(id, { status: 'Confirming', confirmedBy: warehouseId }, session)
          : current;
        if (!claimed) throw new ApiError(409, 'Damage report was already decided');
        const inventory = await repository.findInventoryById(current.inventoryId, session);
        if (!inventory) throw new ApiError(404, 'Inventory record not found');
        const sellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
        const quarantined = Number(inventory.quarantinedQuantity || 0);
        if (quarantined < reportedQuantity) throw new ApiError(409, 'Damage report quarantine is inconsistent');
        const updated = await repository.updateInventory(current.inventoryId, {
          stockQuantity: sellable + (reportedQuantity - confirmedQuantity),
          sellableQuantity: sellable + (reportedQuantity - confirmedQuantity),
          quarantinedQuantity: quarantined - reportedQuantity,
          damagedQuantity: Number(inventory.damagedQuantity || 0) + confirmedQuantity,
          lastUpdatedBy: warehouseId,
          inventoryHealth: (sellable + (reportedQuantity - confirmedQuantity)) < Number(inventory.reservedQuantity || 0)
            ? 'ReconciliationRequired'
            : 'Normal',
        }, session);
        if (!updated) throw new ApiError(409, 'Inventory changed while deciding damage');
        const terminalStatus = confirmedQuantity === 0
          ? 'Rejected'
          : confirmedQuantity === reportedQuantity ? 'Confirmed' : 'PartiallyConfirmed';
        const completed = repository.updateReport
          ? await repository.updateReport(id, {
            status: terminalStatus,
            confirmedBy: warehouseId,
            confirmedQuantity,
            decisionReason,
            decisionEvidence: input.evidence,
            confirmedAt: new Date(),
          }, session)
          : Object.assign(claimed, {
            status: terminalStatus,
            confirmedBy: warehouseId,
            confirmedQuantity,
            decisionReason,
            decisionEvidence: input.evidence,
            confirmedAt: new Date(),
          });
        const transaction = await repository.createTransaction({
          productId: current.productId,
          orderId: null,
          relatedCollection: 'DamageReport',
          relatedId: current._id,
          performedBy: warehouseId,
          transactionType: terminalStatus === 'Rejected' ? 'DAMAGE_REJECTED' : 'DAMAGE_CONFIRMED',
          quantity: confirmedQuantity,
          beforeQuantity: sellable,
          afterQuantity: Number(updated.sellableQuantity ?? updated.stockQuantity ?? sellable),
          beforeSellableQuantity: sellable,
          afterSellableQuantity: Number(updated.sellableQuantity ?? updated.stockQuantity ?? sellable),
          beforeQuarantinedQuantity: quarantined,
          afterQuarantinedQuantity: Number(updated.quarantinedQuantity || 0),
          beforeDamagedQuantity: Number(inventory.damagedQuantity || 0),
          afterDamagedQuantity: Number(updated.damagedQuantity || 0),
          dimension: confirmedQuantity ? 'damaged' : 'sellable',
          reason: decisionReason,
          evidence: input.evidence,
          idempotencyKey: String(input.idempotencyKey || `damage-decision:${id}`),
        }, session);
        return { completed, transaction };
      });
      await auditLogger.log({ userId: warehouseId, action: 'DAMAGE_REPORT_DECIDE', targetEntity: 'DamageReport', targetId: String(id), description: result.completed.status });
      await emitEvent({
        idempotencyKey: `damage-decision:${id}`,
        recipientId: result.completed.reportedBy,
        type: 'DAMAGE_DECIDED',
        subject: 'Damage report decided',
        content: `Damage report ${id} is ${result.completed.status}.`,
      });
      return { ...toResponse(result.completed), transaction: result.transaction };
    },
    async withdrawStaffReport(staffId, id, input = {}) {
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Damage withdrawal reason is required');
      const result = await transactionManager.withTransaction(async (session) => {
        const report = await repository.findReportById(id, session);
        if (!report) throw new ApiError(404, 'Damage report not found');
        const status = report.status === 'PendingWarehouseConfirmation' ? 'PendingReview' : report.status;
        if (status !== 'PendingReview') throw new ApiError(409, 'Only PendingReview damage reports can be withdrawn');
        if (String(report.reportedBy) !== String(staffId)) throw new ApiError(403, 'Only the reporting Staff member can withdraw this report');
        const inventory = await repository.findInventoryById(report.inventoryId, session);
        if (!inventory) throw new ApiError(404, 'Inventory record not found');
        const quantity = Number(report.reportedQuantity ?? report.quantity);
        const sellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
        const quarantined = Number(inventory.quarantinedQuantity || 0);
        if (quarantined < quantity) throw new ApiError(409, 'Damage report quarantine is inconsistent');
        const updated = await repository.updateInventory(report.inventoryId, {
          stockQuantity: sellable + quantity,
          sellableQuantity: sellable + quantity,
          quarantinedQuantity: quarantined - quantity,
          lastUpdatedBy: staffId,
        }, session);
        if (!updated) throw new ApiError(409, 'Inventory changed while withdrawing damage report');
        const withdrawn = repository.updateReport
          ? await repository.updateReport(id, { status: 'Withdrawn', withdrawnBy: staffId, withdrawnAt: new Date(), withdrawalReason: reason }, session)
          : Object.assign(report, { status: 'Withdrawn', withdrawnBy: staffId, withdrawnAt: new Date(), withdrawalReason: reason });
        await repository.createTransaction({
          productId: report.productId,
          relatedCollection: 'DamageReport',
          relatedId: report._id,
          performedBy: staffId,
          transactionType: 'DAMAGE_WITHDRAWN',
          quantity,
          beforeQuantity: sellable,
          afterQuantity: sellable + quantity,
          beforeSellableQuantity: sellable,
          afterSellableQuantity: sellable + quantity,
          beforeQuarantinedQuantity: quarantined,
          afterQuarantinedQuantity: quarantined - quantity,
          dimension: 'sellable',
          reason,
        }, session);
        return withdrawn;
      });
      await auditLogger.log({ userId: staffId, action: 'DAMAGE_REPORT_WITHDRAW', targetEntity: 'DamageReport', targetId: String(id), description: reason });
      return toResponse(result);
    },
    async disposeConfirmedDamage(warehouseId, inventoryId, input = {}) {
      const quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError(400, 'Disposition quantity must be a positive integer');
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Disposition reason is required');
      if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new ApiError(400, 'Disposition evidence is required');
      const action = input.action === 'RETURN_TO_SUPPLIER' ? 'DAMAGE_RETURNED_TO_SUPPLIER' : 'DAMAGE_DISPOSED';
      const key = String(input.idempotencyKey || '').trim();
      if (!key) throw new ApiError(400, 'Disposition idempotencyKey is required');
      if (repository.findTransactionByIdempotencyKey) {
        const existing = await repository.findTransactionByIdempotencyKey(key);
        if (existing) return { transaction: existing, replay: true };
      }
      const result = await transactionManager.withTransaction(async (session) => {
        const inventory = await repository.findInventoryById(inventoryId, session);
        if (!inventory) throw new ApiError(404, 'Inventory record not found');
        const damaged = Number(inventory.damagedQuantity || 0);
        if (quantity > damaged) throw new ApiError(400, 'Disposition quantity exceeds damaged inventory');
        const updated = await repository.updateInventory(inventoryId, {
          damagedQuantity: damaged - quantity,
          lastUpdatedBy: warehouseId,
        }, session);
        if (!updated) throw new ApiError(409, 'Inventory changed while recording damage disposition');
        const transaction = await repository.createTransaction({
          productId: inventory.productId,
          relatedCollection: 'Inventory',
          relatedId: inventoryId,
          performedBy: warehouseId,
          transactionType: action,
          quantity: -quantity,
          beforeQuantity: damaged,
          afterQuantity: damaged - quantity,
          beforeDamagedQuantity: damaged,
          afterDamagedQuantity: damaged - quantity,
          dimension: 'damaged',
          reason,
          evidence: input.evidence,
          idempotencyKey: key,
        }, session);
        return { updated, transaction };
      });
      await auditLogger.log({ userId: warehouseId, action, targetEntity: 'Inventory', targetId: String(inventoryId), description: reason });
      return result;
    },
    async confirmWarehouseReport(warehouseId, id, input = {}) {
      if (input && (input.confirmedQuantity !== undefined || input.decisionReason || input.evidence)) {
        return api.resolveWarehouseReport(warehouseId, id, input);
      }
      const result = await transactionManager.withTransaction(async (session) => {
        const claimed = await repository.claimConfirmation(id, warehouseId, session);
        if (!claimed) throw new ApiError(409, 'Only pending damage reports can be confirmed once');
        const inventory = await repository.findInventoryById(claimed.inventoryId, session);
        if (!inventory) throw new ApiError(404, 'Inventory record not found');
        const updated = await repository.applyDamage(inventory._id, Number(claimed.quantity), warehouseId, session);
        if (!updated) throw new ApiError(409, 'Damage confirmation would violate available inventory');
        await repository.createTransaction({ productId: inventory.productId, orderId: null, relatedCollection: 'DamageReport', relatedId: claimed._id, performedBy: warehouseId, transactionType: 'DAMAGE_CONFIRMED', quantity: -Number(claimed.quantity), beforeQuantity: Number(inventory.stockQuantity), afterQuantity: Number(updated.stockQuantity), reason: `Damage report ${claimed._id}: ${claimed.reason}` }, session);
        const completed = await repository.completeConfirmation(id, session);
        if (!completed) throw new ApiError(409, 'Damage report could not be completed');
        return completed;
      });
      await auditLogger.log({ userId: warehouseId, action: 'DAMAGE_REPORT_CONFIRM', targetEntity: 'DamageReport', targetId: String(id), description: `Confirmed damage report ${id}` });
      return toResponse(result);
    },
  };
  return api;
}

module.exports = { createDamageReportService, damageReportService: createDamageReportService({ eventPublisher: notificationService }) };
