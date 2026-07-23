const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const SupportRequest = require('../models/supportRequest.model');
const { logAudit } = require('../utils/auditLogger');
const {
  assignmentCoordinator: defaultAssignmentCoordinator,
} = require('./assignmentCoordination.service');

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
    async findOrderById(id, session) {
      return withOptionalSession(Order.findById(id), session).lean();
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
    async findRequestById(id, session) {
      return withOptionalSession(SupportRequest.findById(id), session).lean();
    },
    async updateRequest(id, data, session) {
      return withOptionalSession(
        SupportRequest.findByIdAndUpdate(id, data, { new: true, runValidators: true }),
        session,
      ).lean();
    },
  };
}

function createSupportService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
  transactionManager = createModelTransactionManager(),
  assignmentCoordinator = defaultAssignmentCoordinator,
} = {}) {
  async function writeAudit(userId, action, targetId, description, session = null) {
    await auditLogger.log({
      userId,
      action,
      targetEntity: 'SupportRequest',
      targetId: String(targetId),
      description,
    }, session);
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
      if (!String(input.response || '').trim()) throw new ApiError(400, 'Support response is required');
      const updated = await transactionManager.withTransaction(async (session) => {
        await assignmentCoordinator.coordinate({
          userId: staffId,
          expectedRole: 'Staff',
          session,
        });
        const request = await repository.findRequestById(id, session);
        if (!request) throw new ApiError(404, 'Support request not found');
        const currentStatus = request.status === 'Open' ? 'New' : request.status;
        const allowedStatuses = currentStatus === 'New'
          ? ['InProgress']
          : currentStatus === 'InProgress' ? ['Resolved'] : [];
        if (!allowedStatuses.includes(input.status)) {
          throw new ApiError(409, 'Invalid support status transition');
        }
        const result = await repository.updateRequest(id, {
          status: input.status,
          response: String(input.response).trim(),
          handledBy: staffId,
          respondedAt: new Date(),
          closedAt: input.status === 'Resolved' ? new Date() : null,
        }, session);
        await writeAudit(
          staffId,
          'SUPPORT_RESPOND',
          id,
          `Support request ${input.status}`,
          session,
        );
        return result;
      });
      return toResponse(updated, await resolveOrderForRequest(updated));
    },
  };
}

module.exports = {
  createSupportService,
  supportService: createSupportService(),
};
