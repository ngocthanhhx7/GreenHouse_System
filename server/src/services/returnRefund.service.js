const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const RefundPending = require('../models/refundPending.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const ReturnItem = require('../models/returnItem.model');
const { logAudit } = require('../utils/auditLogger');

const OPEN_STATUSES = ['Pending', 'AwaitingInspection', 'ReadyForRefund'];

function generateRequestCode() {
  return `RET-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function toResponse(request, order, details = [], items = []) {
  return {
    id: String(request._id), orderId: String(request.orderId), orderCode: order ? order.orderCode : request.orderCode,
    requestCode: request.requestCode || '', customerId: String(request.customerId), reason: request.reason,
    evidenceImages: request.evidenceImages || [], status: request.status, refundAmount: Number(request.refundAmount || 0),
    paymentId: request.paymentId ? String(request.paymentId) : null, resolvedBy: request.resolvedBy ? String(request.resolvedBy) : null,
    resolvedAt: request.resolvedAt || null, requestedAt: request.requestedAt || request.createdAt, handledAt: request.handledAt || null,
    staffNote: request.staffNote || '', inspectionNote: request.inspectionNote || '', completedBy: request.completedBy ? String(request.completedBy) : null,
    completedAt: request.completedAt || null,
    order: order ? { id: String(order._id), orderCode: order.orderCode, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, totalAmount: order.totalAmount, currency: order.currency || 'VND' } : null,
    details, items, createdAt: request.createdAt,
  };
}

function createModelRepository() {
  return {
    async findOrderById(id, session) { return withOptionalSession(Order.findById(id), session).lean(); },
    async listOrderDetails(orderId, session) { return withOptionalSession(OrderDetail.find({ orderId }), session).lean(); },
    async findPaymentByOrderId(orderId, session) { return withOptionalSession(Payment.findOne({ orderId }), session).lean(); },
    async findLatestPaymentAttemptByOrder(orderId, session) { return withOptionalSession(PaymentAttempt.findOne({ orderId }).sort({ createdAt: -1 }), session).lean(); },
    async findOpenRequestByOrderId(orderId) { return ReturnRefundRequest.findOne({ orderId, status: { $in: OPEN_STATUSES } }).lean(); },
    async createRequest(data) { return ReturnRefundRequest.create(data); },
    async listRequests(query = {}) {
      const filter = {};
      if (query.customerId) filter.customerId = query.customerId;
      if (query.status) filter.status = query.status;
      return ReturnRefundRequest.find(filter).sort({ createdAt: -1 }).lean();
    },
    async findRequestById(id) { return ReturnRefundRequest.findById(id).lean(); },
    async updateRequest(id, data, session) { return withOptionalSession(ReturnRefundRequest.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async claimInspection(id, data, session) { return withOptionalSession(ReturnRefundRequest.findOneAndUpdate({ _id: id, status: 'AwaitingInspection' }, data, { new: true, runValidators: true }), session).lean(); },
    async claimReadyForRefund(id, data, session) { return withOptionalSession(ReturnRefundRequest.findOneAndUpdate({ _id: id, status: 'ReadyForRefund' }, data, { new: true, runValidators: true }), session).lean(); },
    async updateOrder(id, data, session) { return withOptionalSession(Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async updatePayment(id, data, session) { return withOptionalSession(Payment.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async updatePaymentAttempt(id, data, session) { return withOptionalSession(PaymentAttempt.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async upsertRefundPending(data, session) { return withOptionalSession(RefundPending.findOneAndUpdate({ orderId: data.orderId }, { $setOnInsert: data }, { new: true, upsert: true, runValidators: true }), session).lean(); },
    async listReturnItems(requestId, session) { return withOptionalSession(ReturnItem.find({ returnRefundRequestId: requestId }).sort({ createdAt: 1 }), session).lean(); },
    async createReturnItems(items, session) { return ReturnItem.insertMany(items, session ? { session } : undefined); },
  };
}

function createReturnRefundService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
  transactionManager = createModelTransactionManager(),
} = {}) {
  async function loadRequest(id) {
    const request = await repository.findRequestById(id);
    if (!request) throw new ApiError(404, 'Return/refund request not found');
    const [order, details, items] = await Promise.all([
      repository.findOrderById(request.orderId), repository.listOrderDetails(request.orderId), repository.listReturnItems(request._id),
    ]);
    if (!order) throw new ApiError(404, 'Related order not found');
    return { request, order, details, items };
  }

  async function writeAudit(userId, action, targetId, description) {
    await auditLogger.log({ userId, action, targetEntity: 'ReturnRefundRequest', targetId: String(targetId), description });
  }

  async function createRefundHandoff(order, reason, session) {
    const attempt = await repository.findLatestPaymentAttemptByOrder(order._id, session);
    if (!attempt) throw new ApiError(409, 'A payment attempt is required before a refund can be handed off');
    return repository.upsertRefundPending({
      orderId: order._id, paymentAttemptId: attempt._id, customerId: order.customerId,
      amount: order.totalAmount, currency: order.currency || attempt.currency || 'VND', reason, status: 'RefundPending',
    }, session);
  }

  return {
    async createCustomerRequest(customerId, input = {}) {
      if (!input.orderId) throw new ApiError(400, 'Order is required');
      if (!String(input.reason || '').trim()) throw new ApiError(400, 'Return/refund reason is required');
      const order = await repository.findOrderById(input.orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      if (order.orderStatus !== 'Delivered') throw new ApiError(409, 'Only Delivered orders can be returned');
      const existing = await repository.findOpenRequestByOrderId(order._id);
      if (existing) throw new ApiError(409, 'This order already has an open return/refund request');
      const payment = await repository.findPaymentByOrderId(order._id);
      let request;
      try {
        request = await repository.createRequest({
          orderId: order._id, requestCode: generateRequestCode(), customerId, paymentId: payment?._id || null,
          reason: String(input.reason).trim(), evidenceImages: Array.isArray(input.evidenceImages) ? input.evidenceImages.map((image) => String(image).trim()).filter(Boolean) : [],
          status: 'Pending', requestedAt: new Date(),
        });
      } catch (error) {
        if (error && error.code === 11000) throw new ApiError(409, 'This order already has an open return/refund request');
        throw error;
      }
      const details = await repository.listOrderDetails(order._id);
      await writeAudit(customerId, 'RETURN_REFUND_CREATE', request._id, `Return/refund requested for ${order.orderCode}`);
      return toResponse(request, order, details);
    },

    async listMyRequests(customerId) {
      const requests = await repository.listRequests({ customerId });
      const items = [];
      for (const request of requests) {
        const loaded = await loadRequest(request._id);
        items.push(toResponse(loaded.request, loaded.order, loaded.details, loaded.items));
      }
      return { items, total: items.length };
    },

    async listStaffRequests(query = {}) {
      const requests = await repository.listRequests(query);
      const items = [];
      for (const request of requests) {
        const loaded = await loadRequest(request._id);
        items.push(toResponse(loaded.request, loaded.order, loaded.details, loaded.items));
      }
      return { items, total: items.length };
    },

    async listWarehouseRequests(query = {}) {
      return this.listStaffRequests(query);
    },

    async getStaffRequest(id) {
      const loaded = await loadRequest(id);
      return toResponse(loaded.request, loaded.order, loaded.details, loaded.items);
    },

    async decideRequest(staffId, id, input = {}) {
      const { request, order, details, items } = await loadRequest(id);
      if (request.status !== 'Pending') throw new ApiError(409, 'Only Pending return/refund requests can be decided');
      if (!['Approved', 'Rejected'].includes(input.status)) throw new ApiError(400, 'Invalid return/refund decision');
      const staffNote = String(input.staffNote || '').trim();
      if (!staffNote) throw new ApiError(400, 'Staff note is required');
      const approved = input.status === 'Approved';
      const refundAmount = approved ? Number(input.refundAmount) : 0;
      if (approved && (!Number.isFinite(refundAmount) || refundAmount <= 0)) throw new ApiError(400, 'Refund amount must be greater than 0');
      if (approved && refundAmount > Number(order.totalAmount || 0)) throw new ApiError(400, 'Refund amount cannot exceed order total');
      const updated = await repository.updateRequest(id, {
        status: approved ? 'AwaitingInspection' : 'Rejected', refundAmount, resolvedBy: staffId,
        resolvedAt: new Date(), handledAt: new Date(), staffNote,
      });
      await writeAudit(staffId, approved ? 'RETURN_REFUND_APPROVED_FOR_INSPECTION' : 'RETURN_REFUND_REJECTED', id, `${input.status} return/refund for ${order.orderCode}`);
      return toResponse(updated, order, details, items);
    },

    async inspectRequest(warehouseId, id, input = {}) {
      const { request, order, details } = await loadRequest(id);
      if (request.status !== 'AwaitingInspection') throw new ApiError(409, 'Only AwaitingInspection requests can be inspected');
      if (!Array.isArray(input.items) || input.items.length === 0) throw new ApiError(400, 'At least one inspected return item is required');
      const detailById = new Map(details.map((detail) => [String(detail._id), detail]));
      const seen = new Set();
      const inspectedAt = new Date();
      const items = input.items.map((item) => {
        const detail = detailById.get(String(item.orderDetailId));
        if (!detail) throw new ApiError(400, 'Return item does not belong to the order');
        if (seen.has(String(detail._id))) throw new ApiError(400, 'Each order item can only be inspected once');
        seen.add(String(detail._id));
        const receivedQuantity = Number(item.receivedQuantity);
        const sellableQuantity = Number(item.sellableQuantity);
        const damagedQuantity = Number(item.damagedQuantity);
        if (![receivedQuantity, sellableQuantity, damagedQuantity].every((quantity) => Number.isInteger(quantity) && quantity >= 0)) {
          throw new ApiError(400, 'Inspection quantities must be non-negative integers');
        }
        if (receivedQuantity > Number(detail.quantity)) throw new ApiError(400, 'Received quantity cannot exceed ordered quantity');
        if (sellableQuantity + damagedQuantity !== receivedQuantity) throw new ApiError(400, 'Sellable and damaged quantities must equal received quantity');
        return {
          returnRefundRequestId: request._id, orderDetailId: detail._id, productId: detail.productId, requestedQuantity: detail.quantity,
          receivedQuantity, sellableQuantity, damagedQuantity, evidenceImages: Array.isArray(item.evidenceImages) ? item.evidenceImages.map((image) => String(image).trim()).filter(Boolean) : [],
          warehouseNote: String(item.warehouseNote || input.warehouseNote || '').trim(), inspectedBy: warehouseId, inspectedAt,
        };
      });
      const { createdItems, updated } = await transactionManager.withTransaction(async (session) => {
        const claimed = repository.claimInspection
          ? await repository.claimInspection(id, { status: 'ReadyForRefund', inspectionNote: String(input.warehouseNote || '').trim(), handledAt: inspectedAt }, session)
          : await repository.updateRequest(id, { status: 'ReadyForRefund', inspectionNote: String(input.warehouseNote || '').trim(), handledAt: inspectedAt }, session);
        if (!claimed) throw new ApiError(409, 'Only AwaitingInspection requests can be inspected');
        const created = await repository.createReturnItems(items, session);
        await createRefundHandoff(order, `Warehouse inspection completed for ${request.requestCode || order.orderCode}`, session);
        return { createdItems: created, updated: claimed };
      });
      await writeAudit(warehouseId, 'RETURN_REFUND_INSPECTED', id, `Warehouse inspected return/refund for ${order.orderCode}`);
      return toResponse(updated, order, details, createdItems);
    },

    async completeRefund(staffId, id, input = {}) {
      const { request, order, details, items } = await loadRequest(id);
      if (request.status !== 'ReadyForRefund') throw new ApiError(409, 'Only ReadyForRefund requests can be completed');
      const note = String(input.note || '').trim();
      if (!note) throw new ApiError(400, 'Refund completion note is required');
      const completedAt = new Date();
      const { completed, updatedOrder } = await transactionManager.withTransaction(async (session) => {
        const claimed = repository.claimReadyForRefund
          ? await repository.claimReadyForRefund(id, { status: 'Completed', completedBy: staffId, completedAt, handledAt: completedAt }, session)
          : await repository.updateRequest(id, { status: 'Completed', completedBy: staffId, completedAt, handledAt: completedAt }, session);
        if (!claimed) throw new ApiError(409, 'Only ReadyForRefund requests can be completed');
        const payment = await repository.findPaymentByOrderId(order._id, session);
        const attempt = await repository.findLatestPaymentAttemptByOrder(order._id, session);
        if (payment) await repository.updatePayment(payment._id, { paymentStatus: 'Refunded' }, session);
        if (attempt) await repository.updatePaymentAttempt(attempt._id, { paymentStatus: 'Refunded' }, session);
        const updated = await repository.updateOrder(order._id, { orderStatus: 'Returned', paymentStatus: 'Refunded' }, session);
        return { completed: claimed, updatedOrder: updated };
      });
      await writeAudit(staffId, 'RETURN_REFUND_COMPLETED', id, `Staff completed refund for ${order.orderCode}: ${note}`);
      return toResponse(completed, updatedOrder, details, items);
    },
  };
}

module.exports = { createReturnRefundService, returnRefundService: createReturnRefundService() };
