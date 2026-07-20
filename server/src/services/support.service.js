const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const SupportRequest = require('../models/supportRequest.model');
const { logAudit } = require('../utils/auditLogger');

function toResponse(request, order) {
  return {
    id: String(request._id),
    customerId: String(request.customerId),
    orderId: request.orderId ? String(request.orderId) : null,
    orderCode: order ? order.orderCode : request.orderCode,
    subject: request.subject,
    content: request.content,
    status: request.status,
    handledBy: request.handledBy ? String(request.handledBy) : null,
    response: request.response || '',
    respondedAt: request.respondedAt || null,
    closedAt: request.closedAt || null,
    createdAt: request.createdAt,
  };
}

function createModelRepository() {
  return {
    async findOrderById(id) {
      return Order.findById(id).lean();
    },
    async createRequest(data) {
      return SupportRequest.create(data);
    },
    async listRequests(query = {}) {
      const filter = {};
      if (query.customerId) filter.customerId = query.customerId;
      if (query.status) filter.status = query.status;
      return SupportRequest.find(filter).sort({ createdAt: -1 }).lean();
    },
    async findRequestById(id) {
      return SupportRequest.findById(id).lean();
    },
    async updateRequest(id, data) {
      return SupportRequest.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
  };
}

function createSupportService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  async function writeAudit(userId, action, targetId, description) {
    await auditLogger.log({
      userId,
      action,
      targetEntity: 'SupportRequest',
      targetId: String(targetId),
      description,
    });
  }

  async function resolveOrderForRequest(request) {
    return request.orderId ? repository.findOrderById(request.orderId) : null;
  }

  return {
    async createCustomerRequest(customerId, input = {}) {
      if (!String(input.subject || '').trim()) throw new ApiError(400, 'Support subject is required');
      if (!String(input.content || '').trim()) throw new ApiError(400, 'Support content is required');
      let order = null;
      if (input.orderId) {
        order = await repository.findOrderById(input.orderId);
        if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      }

      const request = await repository.createRequest({
        customerId,
        orderId: input.orderId || null,
        subject: String(input.subject).trim(),
        content: String(input.content).trim(),
        status: 'New',
      });
      await writeAudit(customerId, 'SUPPORT_CREATE', request._id, `Support request created: ${request.subject}`);
      return toResponse(request, order);
    },

    async listMyRequests(customerId) {
      const requests = await repository.listRequests({ customerId });
      const items = [];
      for (const request of requests) {
        items.push(toResponse(request, await resolveOrderForRequest(request)));
      }
      return { items, total: items.length };
    },

    async listStaffRequests(query = {}) {
      const requests = await repository.listRequests(query);
      const items = [];
      for (const request of requests) {
        items.push(toResponse(request, await resolveOrderForRequest(request)));
      }
      return { items, total: items.length };
    },

    async getStaffRequest(id) {
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Support request not found');
      return toResponse(request, await resolveOrderForRequest(request));
    },

    async respondToRequest(staffId, id, input = {}) {
      const request = await repository.findRequestById(id);
      if (!request) throw new ApiError(404, 'Support request not found');
      if (!String(input.response || '').trim()) throw new ApiError(400, 'Support response is required');
      const currentStatus = request.status === 'Open' ? 'New' : request.status;
      const allowedStatuses = currentStatus === 'New' ? ['InProgress'] : currentStatus === 'InProgress' ? ['Resolved'] : [];
      if (!allowedStatuses.includes(input.status)) throw new ApiError(409, 'Invalid support status transition');
      const updated = await repository.updateRequest(id, {
        status: input.status,
        response: String(input.response).trim(),
        handledBy: staffId,
        respondedAt: new Date(),
        closedAt: input.status === 'Resolved' ? new Date() : null,
      });
      await writeAudit(staffId, 'SUPPORT_RESPOND', id, `Support request ${input.status}`);
      return toResponse(updated, await resolveOrderForRequest(updated));
    },
  };
}

module.exports = {
  createSupportService,
  supportService: createSupportService(),
};
