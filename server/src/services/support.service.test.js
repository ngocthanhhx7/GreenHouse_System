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
      const request = { _id: `support-${requests.length + 1}`, status: 'Open', createdAt: new Date(), ...data };
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
    service = createSupportService({ repository, auditLogger: createAuditLogger() });
  });

  it('creates a customer support request linked to the customer order', async () => {
    const result = await service.createCustomerRequest('customer-1', {
      orderId: 'order-1',
      subject: 'Delivery issue',
      content: 'The box arrived open.',
    });

    assert.equal(result.status, 'Open');
    assert.equal(result.orderCode, 'GH-DEMO-1004');
    assert.equal(repository.requests.length, 1);
  });

  it('rejects support request for another customer order', async () => {
    await assert.rejects(
      () => service.createCustomerRequest('customer-2', { orderId: 'order-1', subject: 'Wrong order', content: 'Need help' }),
      /Order not found/
    );
  });

  it('lets staff respond and resolves the support request', async () => {
    const request = await service.createCustomerRequest('customer-1', {
      orderId: 'order-1',
      subject: 'Delivery issue',
      content: 'The box arrived open.',
    });

    const result = await service.respondToRequest('staff-1', request.id, {
      response: 'We will arrange a replacement.',
      status: 'Resolved',
    });

    assert.equal(result.status, 'Resolved');
    assert.equal(result.response, 'We will arrange a replacement.');
    assert.equal(result.handledBy, 'staff-1');
  });
});
