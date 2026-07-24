const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const mongoose = require('mongoose');

const { createModelRepository, createSupportService } = require('./support.service');

function createRepository() {
  const orders = [{ _id: 'order-1', customerId: 'customer-1', orderCode: 'GH-DEMO-1004' }];
  const requests = [];

  return {
    requests,
    async findOrderById(id) {
      return orders.find((order) => order._id === id) || null;
    },
    async createRequest(data) {
      const request = { _id: `support-${requests.length + 1}`, status: 'New', createdAt: new Date(), ...data };
      requests.push(request);
      return request;
    },
    async listRequests(query = {}) {
      return requests.filter((request) => {
        if (query.customerId && request.customerId !== query.customerId) return false;
        if (query.status && request.status !== query.status) return false;
        return true;
      });
    },
    async findRequestById(id) {
      return requests.find((request) => request._id === id) || null;
    },
    async updateRequest(id, data) {
      const request = requests.find((entry) => entry._id === id);
      Object.assign(request, data);
      return request;
    },
  };
}

function createAuditLogger() {
  return {
    entries: [],
    async log(entry) {
      this.entries.push(entry);
    },
  };
}

describe('support service', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = createRepository();
    service = createSupportService({
      repository,
      auditLogger: createAuditLogger(),
      transactionManager: { async withTransaction(work) { return work({ id: 'support-tx' }); } },
      assignmentCoordinator: { async coordinate() {} },
    });
  });

  it('creates a customer support request linked to the customer order', async () => {
    const result = await service.createCustomerRequest('customer-1', {
      orderId: 'order-1',
      subject: 'Delivery issue',
      content: 'The box arrived open.',
    });

    assert.equal(result.status, 'New');
    assert.equal(result.orderCode, 'GH-DEMO-1004');
    assert.equal(repository.requests.length, 1);
  });

  it('rejects support request for another customer order', async () => {
    await assert.rejects(
      () => service.createCustomerRequest('customer-2', { orderId: 'order-1', subject: 'Wrong order', content: 'Need help' }),
      /Order not found/
    );
  });

  it('requires New/Open -> InProgress -> Resolved support progression and only closes on resolution', async () => {
    const request = await service.createCustomerRequest('customer-1', {
      orderId: 'order-1',
      subject: 'Delivery issue',
      content: 'The box arrived open.',
    });

    await assert.rejects(
      () => service.respondToRequest('staff-1', request.id, { response: 'We will arrange a replacement.', status: 'Resolved' }),
      /Invalid support status transition/
    );
    const inProgress = await service.respondToRequest('staff-1', request.id, {
      response: 'We will arrange a replacement.',
      status: 'InProgress',
    });
    assert.equal(inProgress.status, 'InProgress');
    assert.equal(inProgress.closedAt, null);
    const result = await service.respondToRequest('staff-1', request.id, {
      response: 'Replacement has been arranged.',
      status: 'Resolved',
    });
    assert.equal(result.status, 'Resolved');
    assert.ok(result.closedAt);
    assert.equal(result.handledBy, 'staff-1');
  });

  it('does not assign Support after a passed Staff request loses its role', async () => {
    const request = await service.createCustomerRequest('customer-1', {
      orderId: 'order-1',
      subject: 'Delivery issue',
      content: 'The box arrived open.',
    });
    const guarded = createSupportService({
      repository,
      auditLogger: createAuditLogger(),
      transactionManager: { async withTransaction(work) { return work({ id: 'support-race-tx' }); } },
      assignmentCoordinator: {
        async coordinate({ userId, expectedRole, session }) {
          assert.deepEqual(
            { userId, expectedRole, session },
            { userId: 'staff-1', expectedRole: 'Staff', session: { id: 'support-race-tx' } },
          );
          const error = new Error('role changed after middleware');
          error.errorCode = 'ASSIGNMENT_ACTOR_STALE';
          throw error;
        },
      },
    });

    await assert.rejects(
      () => guarded.respondToRequest('staff-1', request.id, {
        response: 'We will investigate.',
        status: 'InProgress',
      }),
      (error) => error.errorCode === 'ASSIGNMENT_ACTOR_STALE',
    );
    assert.equal(repository.requests[0].handledBy, undefined);
    assert.equal(repository.requests[0].status, 'New');
  });
});

describe('SL-008 Support detail projection', () => {
  it('adds Active transfer targets only for Staff and reduces every history item to safe keys', async () => {
    const ticket = {
      _id: 'ticket-1',
      ticketCode: 'SUP-0001',
      customerId: 'customer-1',
      type: 'Order',
      subject: 'Delivery issue',
      status: 'InProgress',
      priority: 'High',
      assigneeId: 'staff-a',
      version: 4,
      createdAt: new Date('2026-07-25T01:00:00.000Z'),
      updatedAt: new Date('2026-07-25T02:00:00.000Z'),
    };
    const histories = {
      Assignment: [{
        ticketId: 'ticket-1',
        actorId: 'staff-a',
        actorRole: 'Staff',
        version: 2,
        beforeAssigneeId: null,
        afterAssigneeId: 'staff-a',
        reason: 'CLAIMED',
        createdAt: new Date('2026-07-25T01:10:00.000Z'),
      }],
      Priority: [{
        ticketId: 'ticket-1',
        actorId: 'staff-a',
        actorRole: 'Staff',
        version: 3,
        beforePriority: 'Normal',
        afterPriority: 'High',
        reason: 'Customer impact',
        createdAt: new Date('2026-07-25T01:20:00.000Z'),
      }],
      Resolution: [{
        ticketId: 'ticket-1',
        actorId: 'staff-a',
        actorRole: 'Staff',
        version: 4,
        transition: 'Resolved',
        reopenDeadline: new Date('2026-07-28T01:30:00.000Z'),
        createdAt: new Date('2026-07-25T01:30:00.000Z'),
      }],
    };
    const service = createSupportService({
      repository: {
        async findTicketById() { return ticket; },
        async listMessages() { return []; },
        async listHistory(_filter, kind) { return histories[kind]; },
        async listActiveStaff() {
          return [
            { _id: 'staff-a', fullName: 'Assigned Staff', status: 'Active' },
            { _id: 'staff-b', displayName: 'Support Specialist', status: 'Active' },
            { _id: 'staff-disabled', displayName: 'Disabled Staff', status: 'Disabled' },
          ];
        },
      },
      auditLogger: createAuditLogger(),
      transactionManager: { async withTransaction(work) { return work({ id: 'support-read-tx' }); } },
      assignmentCoordinator: { async coordinate() {} },
    });

    const staffDetail = await service.getDetail(
      { id: 'staff-a', role: 'Staff', status: 'Active' },
      'ticket-1',
      { page: 1, pageSize: 20 },
    );
    const customerDetail = await service.getDetail(
      { id: 'customer-1', role: 'Customer', status: 'Active' },
      'ticket-1',
      { page: 1, pageSize: 20 },
    );

    assert.deepEqual(staffDetail.transferTargets, [
      { id: 'staff-a', displayName: 'Assigned Staff', status: 'Active' },
      { id: 'staff-b', displayName: 'Support Specialist', status: 'Active' },
    ]);
    assert.equal(customerDetail.transferTargets, undefined);
    assert.deepEqual(Object.keys(staffDetail.assignmentHistory[0]).sort(), [
      'actorRole', 'afterAssigneeId', 'beforeAssigneeId', 'createdAt', 'reason',
    ].sort());
    assert.deepEqual(Object.keys(staffDetail.priorityHistory[0]).sort(), [
      'actorRole', 'afterPriority', 'beforePriority', 'createdAt', 'reason',
    ].sort());
    assert.deepEqual(Object.keys(staffDetail.resolutionHistory[0]).sort(), [
      'actorRole', 'createdAt', 'reopenDeadline', 'transition',
    ].sort());
    assert.doesNotMatch(JSON.stringify(staffDetail), /staff-disabled|actorId|ticketId|"version":2/);
  });
});

describe('SL-008 Support production paging repository', () => {
  function aggregateModel(result, calls, modelName) {
    return {
      aggregate(pipeline) {
        const call = { modelName, pipeline, session: null };
        calls.push(call);
        const query = {
          session(session) {
            call.session = session;
            return query;
          },
          then(resolve) {
            resolve([structuredClone(result)]);
          },
        };
        return query;
      },
    };
  }

  it('uses one bounded facet snapshot for ticket and message page plus count', async () => {
    const calls = [];
    const session = { id: 'read-snapshot' };
    const staffId = '507f1f77bcf86cd799439011';
    const ticketId = '507f191e810c19729de860ea';
    const repository = createModelRepository({
      SupportRequestModel: aggregateModel({
        items: [{ _id: 'ticket-2' }],
        metadata: [{ total: 5 }],
      }, calls, 'request'),
      SupportMessageModel: aggregateModel({
        items: [{ _id: 'message-3' }],
        metadata: [{ total: 7 }],
      }, calls, 'message'),
    });

    const tickets = await repository.queryTickets(
      { status: 'InProgress', assigneeId: staffId },
      { page: 2, pageSize: 2 },
      session,
    );
    const messages = await repository.queryMessages(
      ticketId,
      { page: 3, pageSize: 1 },
      session,
    );

    assert.deepEqual(tickets, {
      items: [{ _id: 'ticket-2' }], total: 5, page: 2, pageSize: 2, totalPages: 3,
    });
    assert.deepEqual(messages, {
      items: [{ _id: 'message-3' }], total: 7, page: 3, pageSize: 1, totalPages: 7,
    });
    assert.equal(calls[0].modelName, 'request');
    assert.equal(calls[0].session, session);
    assert.equal(calls[0].pipeline[0].$match.status, 'InProgress');
    assert.deepEqual(calls[0].pipeline.slice(1), [
        { $sort: { createdAt: -1, _id: -1 } },
        { $facet: { items: [{ $skip: 2 }, { $limit: 2 }], metadata: [{ $count: 'total' }] } },
    ]);
    assert.equal(calls[1].modelName, 'message');
    assert.equal(calls[1].session, session);
    assert.deepEqual(calls[1].pipeline.slice(1), [
        { $sort: { createdAt: 1, _id: 1 } },
        { $facet: { items: [{ $skip: 2 }, { $limit: 1 }], metadata: [{ $count: 'total' }] } },
    ]);
    assert.equal(String(calls[0].pipeline[0].$match.assigneeId), staffId);
    assert.notEqual(typeof calls[0].pipeline[0].$match.assigneeId, 'string');
    assert.equal(String(calls[1].pipeline[0].$match.ticketId), ticketId);
    assert.notEqual(typeof calls[1].pipeline[0].$match.ticketId, 'string');
  });
});

describe('SL-008 account-disable transaction integration', () => {
  it('clears the assignee and writes every Support effect in the caller Mongo session', async () => {
    const session = { id: 'sl007-disable-transaction' };
    const sessions = [];
    const staffId = '507f1f77bcf86cd799439011';
    const staffObjectId = new mongoose.Types.ObjectId(staffId);
    const ticket = {
      _id: 'ticket-1', ticketCode: 'SUP-0001', customerId: 'customer-1',
      type: 'Account', subject: 'Account support', status: 'InProgress',
      priority: 'Normal', assigneeId: staffObjectId, handledBy: staffObjectId, version: 2,
      createdAt: new Date('2026-07-25T01:00:00.000Z'),
      updatedAt: new Date('2026-07-25T01:10:00.000Z'),
    };
    const repository = {
      async findCommand(_identity, activeSession) { sessions.push(activeSession); return null; },
      async listTickets(filter, activeSession) {
        sessions.push(activeSession);
        return (String(filter.assigneeId || filter.handledBy || '') === staffId) ? [ticket] : [];
      },
      async findTicketById(_id, activeSession) { sessions.push(activeSession); return ticket; },
      async updateTicketByVersion(_id, expectedVersion, changes, activeSession) {
        sessions.push(activeSession);
        assert.equal(expectedVersion, 2);
        Object.assign(ticket, changes, { version: 3 });
        return { ...ticket };
      },
      async appendAssignmentHistory(_entry, activeSession) { sessions.push(activeSession); },
      async recordCommand(_entry, activeSession) { sessions.push(activeSession); },
    };
    const service = createSupportService({
      repository,
      auditLogger: { async log(_entry, activeSession) { sessions.push(activeSession); } },
      outboxRepository: { async enqueue(_entry, activeSession) { sessions.push(activeSession); } },
      transactionManager: {
        async withTransaction() { throw new Error('nested transaction must not run'); },
      },
    });

    const result = await service.clearDisabledAssignee(staffId, {}, {
      idempotencyKey: 'sl007-support-clear-disable-1',
      mongoSession: session,
    });

    assert.equal(result.assigneeId, null);
    assert.equal(result.version, 3);
    assert.ok(sessions.length >= 7);
    assert.equal(sessions.every((activeSession) => activeSession === session), true);
  });
});
