const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createSupportService } = require('./support.service');

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
