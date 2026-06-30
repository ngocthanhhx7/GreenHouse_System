const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Payment = require('../models/payment.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const { logAudit } = require('../utils/auditLogger');

const OPEN_STATUSES = ['Pending', 'Approved'];

function toResponse(request, order, details = []) {
  return {
    id: String(request._id),
    orderId: String(request.orderId),
    orderCode: order ? order.orderCode : request.orderCode,
    customerId: String(request.customerId),
    reason: request.reason,
    status: request.status,
    refundAmount: Number(request.refundAmount || 0),
    resolvedBy: request.resolvedBy ? String(request.resolvedBy) : null,
    resolvedAt: request.resolvedAt || null,
    staffNote: request.staffNote || '',
    order: order
      ? {
          id: String(order._id),
          orderCode: order.orderCode,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount,
        }
      : null,
    details,
    createdAt: request.createdAt,
  };
}

function createModelRepository() {
  return {
    async findOrderById(id) {
      return Order.findById(id).lean();
    },
    async listOrderDetails(orderId) {
      return OrderDetail.find({ orderId }).lean();
    },
    async findOpenRequestByOrderId(orderId) {
      return ReturnRefundRequest.findOne({ orderId, status: { $in: OPEN_STATUSES } }).lean();
    },
    async createRequest(data) {
      return ReturnRefundRequest.create(data);
    },
    async listRequests(query = {}) {
      const filter = {};
      if (query.customerId) filter.customerId = query.customerId;
      if (query.status) filter.status = query.status;
      return ReturnRefundRequest.find(filter).sort({ createdAt: -1 }).lean();
    },
    async findRequestById(id) {
      return ReturnRefundRequest.findById(id).lean();
    },
    async updateRequest(id, data) {
      return ReturnRefundRequest.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
    async updateOrder(id, data) {
      return Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
    async updatePaymentByOrderId(orderId, data) {
      return Payment.findOneAndUpdate({ orderId }, data, { new: true, runValidators: true }).lean();
    },
  };
}

function createReturnRefundService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  async function loadRequest(id) {
    const request = await repository.findRequestById(id);
    if (!request) throw new ApiError(404, 'Return/refund request not found');
    const order = await repository.findOrderById(request.orderId);
    const details = await repository.listOrderDetails(request.orderId);
    return { request, order, details };
  }

  async function writeAudit(userId, action, targetId, description) {
    await auditLogger.log({
      userId,
      action,
      targetEntity: 'ReturnRefundRequest',
      targetId: String(targetId),
      description,
    });
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

      const request = await repository.createRequest({
        orderId: order._id,
        customerId,
        reason: String(input.reason).trim(),
        status: 'Pending',
      });
      const details = await repository.listOrderDetails(order._id);
      await writeAudit(customerId, 'RETURN_REFUND_CREATE', request._id, `Return/refund requested for ${order.orderCode}`);
      return toResponse(request, order, details);
    },

    async listMyRequests(customerId) {
      const requests = await repository.listRequests({ customerId });
      const items = [];
      for (const request of requests) {
        const order = await repository.findOrderById(request.orderId);
        const details = await repository.listOrderDetails(request.orderId);
        items.push(toResponse(request, order, details));
      }
      return { items, total: items.length };
    },

    async listStaffRequests(query = {}) {
      const requests = await repository.listRequests(query);
      const items = [];
      for (const request of requests) {
        const order = await repository.findOrderById(request.orderId);
        const details = await repository.listOrderDetails(request.orderId);
        items.push(toResponse(request, order, details));
      }
      return { items, total: items.length };
    },

    async getStaffRequest(id) {
      const { request, order, details } = await loadRequest(id);
      return toResponse(request, order, details);
    },

    async decideRequest(staffId, id, input = {}) {
      const { request, order, details } = await loadRequest(id);
      if (request.status !== 'Pending') throw new ApiError(409, 'Only Pending return/refund requests can be decided');
      if (!['Approved', 'Rejected'].includes(input.status)) throw new ApiError(400, 'Invalid return/refund decision');
      if (!String(input.staffNote || '').trim()) throw new ApiError(400, 'Staff note is required');

      const refundAmount = input.status === 'Approved' ? Number(input.refundAmount) : 0;
      if (input.status === 'Approved' && (!Number.isFinite(refundAmount) || refundAmount <= 0)) {
        throw new ApiError(400, 'Refund amount must be greater than 0');
      }
      if (input.status === 'Approved' && refundAmount > Number(order.totalAmount || 0)) {
        throw new ApiError(400, 'Refund amount cannot exceed order total');
      }

      const updated = await repository.updateRequest(id, {
        status: input.status,
        refundAmount,
        resolvedBy: staffId,
        resolvedAt: new Date(),
        staffNote: String(input.staffNote).trim(),
      });

      if (input.status === 'Approved') {
        await repository.updateOrder(order._id, { orderStatus: 'Returned', paymentStatus: 'Refunded' });
        await repository.updatePaymentByOrderId(order._id, { paymentStatus: 'Refunded' });
      }

      const updatedOrder = await repository.findOrderById(order._id);
      await writeAudit(staffId, `RETURN_REFUND_${input.status.toUpperCase()}`, id, `${input.status} return/refund for ${order.orderCode}`);
      return toResponse(updated, updatedOrder, details);
    },
  };
}

module.exports = {
  createReturnRefundService,
  returnRefundService: createReturnRefundService(),
};
