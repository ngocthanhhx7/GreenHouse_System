const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const DamageReport = require('../models/damageReport.model');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const { logAudit } = require('../utils/auditLogger');

const DAMAGE_REPORT_STATUSES = new Set([
  'PendingWarehouseConfirmation',
  'Confirming',
  'Confirmed',
  'Rejected',
]);

function withOptionalSession(query, session) { return session ? query.session(session) : query; }
function createModelTransactionManager() { return { async withTransaction(work) { const session = await mongoose.startSession(); try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; } finally { await session.endSession(); } } }; }
function toResponse(report) { return { id: String(report._id), inventoryId: String(report.inventoryId), productId: String(report.productId), quantity: Number(report.quantity), reason: report.reason, status: report.status, reportedBy: String(report.reportedBy), confirmedBy: report.confirmedBy ? String(report.confirmedBy) : null, confirmedAt: report.confirmedAt || null, createdAt: report.createdAt }; }
function createModelRepository() { return {
  async listReports(query = {}) {
    const filter = query.status ? { status: query.status } : {};
    return DamageReport.find(filter).sort({ createdAt: -1 }).lean();
  },
  async createReport(data, session) { const [report] = await DamageReport.create([data], session ? { session } : undefined); return report.toObject(); },
  async findReportById(id, session) { return withOptionalSession(DamageReport.findById(id), session).lean(); },
  async claimConfirmation(id, warehouseId, session) { return withOptionalSession(DamageReport.findOneAndUpdate({ _id: id, status: 'PendingWarehouseConfirmation' }, { $set: { status: 'Confirming', confirmedBy: warehouseId } }, { new: true, runValidators: true }), session).lean(); },
  async completeConfirmation(id, session) { return withOptionalSession(DamageReport.findOneAndUpdate({ _id: id, status: 'Confirming' }, { $set: { status: 'Confirmed', confirmedAt: new Date() } }, { new: true, runValidators: true }), session).lean(); },
  async findInventoryById(id, session) { return withOptionalSession(Inventory.findById(id), session).lean(); },
  async applyDamage(id, quantity, warehouseId, session) { return withOptionalSession(Inventory.findOneAndUpdate({ _id: id, $expr: { $gte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, quantity] } }, { $inc: { stockQuantity: -quantity, damagedQuantity: quantity }, $set: { lastUpdatedBy: warehouseId } }, { new: true, runValidators: true }), session).lean(); },
  async createTransaction(data, session) { const [transaction] = await InventoryTransaction.create([data], session ? { session } : undefined); return transaction.toObject(); },
}; }
function createDamageReportService({ repository = createModelRepository(), transactionManager = createModelTransactionManager(), auditLogger = { log: logAudit } } = {}) {
  return {
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
    async createStaffReport(staffId, input = {}) {
      const quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError(400, 'Damage quantity must be a positive integer');
      if (!String(input.reason || '').trim()) throw new ApiError(400, 'Damage reason is required');
      const inventory = await repository.findInventoryById(input.inventoryId);
      if (!inventory) throw new ApiError(404, 'Inventory record not found');
      const report = await repository.createReport({ inventoryId: inventory._id, productId: inventory.productId, reportedBy: staffId, quantity, reason: String(input.reason).trim(), status: 'PendingWarehouseConfirmation' });
      await auditLogger.log({ userId: staffId, action: 'DAMAGE_REPORT_CREATE', targetEntity: 'DamageReport', targetId: String(report._id), description: `Reported ${quantity} damaged item(s)` });
      return toResponse(report);
    },
    async confirmWarehouseReport(warehouseId, id) {
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
}

module.exports = { createDamageReportService, damageReportService: createDamageReportService() };
