const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createReturnRefundService } = require('./returnRefund.service');

function createRepository() {
  const orders = [
    {
      _id: 'order-1',
      orderCode: 'GH-DEMO-2001',
      customerId: 'customer-1',
      totalAmount: 120,
      paymentStatus: 'Paid',
      orderStatus: 'Delivered',
    },
    {
      _id: 'order-2',
      orderCode: 'GH-DEMO-2002',
      customerId: 'customer-1',
      totalAmount: 80,
      paymentStatus: 'Paid',
      orderStatus: 'Shipped',
    },
  ];
  const details = [
    {
      _id: 'detail-1',
      orderId: 'order-1',
      productId: 'product-1',
      productNameSnapshot: 'Bamboo Cutting Board',
      quantity: 1,
      priceSnapshot: 120,
      subtotal: 120,
    },
  ];
  const payments = [{ _id: 'payment-1', orderId: 'order-1', amount: 120, paymentStatus: 'Paid' }];
  const requests = [];

  return {
    orders,
    payments,
    requests,
    async findOrderById(id) {
      return orders.find((order) => order._id === id) || null;
    },
    async listOrderDetails(orderId) {
      return details.filter((detail) => detail.orderId === orderId);
    },
    async findOpenRequestByOrderId(orderId) {
      return requests.find((request) => request.orderId === orderId && ['Pending', 'Approved'].includes(request.status)) || null;
    },
    async createRequest(data) {
      const request = { _id: `refund-${requests.length + 1}`, status: 'Pending', createdAt: new Date(), ...data };
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
    async updateOrder(id, data) {
      const order = orders.find((entry) => entry._id === id);
      Object.assign(order, data);
      return order;
    },
    async updatePaymentByOrderId(orderId, data) {
      const payment = payments.find((entry) => entry.orderId === orderId);
      Object.assign(payment, data);
      return payment;
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

describe('return/refund service', () => {
  let repository;
  let auditLogger;
  let service;

  beforeEach(() => {
    repository = createRepository();
    auditLogger = createAuditLogger();
    service = createReturnRefundService({ repository, auditLogger });
  });

  it('creates a customer return/refund request for a delivered order', async () => {
    const result = await service.createCustomerRequest('customer-1', {
      orderId: 'order-1',
      reason: 'Product arrived damaged',
    });

    assert.equal(result.status, 'Pending');
    assert.equal(result.orderCode, 'GH-DEMO-2001');
    assert.equal(result.details.length, 1);
    assert.equal(repository.requests.length, 1);
  });

  it('rejects a return/refund request when the order is not delivered', async () => {
    await assert.rejects(
      () => service.createCustomerRequest('customer-1', { orderId: 'order-2', reason: 'Need return' }),
      /Only Delivered orders can be returned/
    );
  });

  it('returns a conflict when a concurrent request already exists for the order', async () => {
    const duplicateRepository = createRepository();
    duplicateRepository.findOpenRequestByOrderId = async () => null;
    duplicateRepository.createRequest = async () => {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    };
    const duplicateService = createReturnRefundService({
      repository: duplicateRepository,
      auditLogger,
    });

    await assert.rejects(
      () => duplicateService.createCustomerRequest('customer-1', {
        orderId: 'order-1',
        reason: 'Product arrived damaged',
      }),
      /This order already has an open return\/refund request/
    );
  });

  it('lists only return/refund requests owned by the current customer', async () => {
    await service.createCustomerRequest('customer-1', {
      orderId: 'order-1',
      reason: 'Product arrived damaged',
    });
    repository.requests.push({
      _id: 'refund-other',
      orderId: 'order-1',
      customerId: 'customer-2',
      reason: 'Other customer request',
      status: 'Pending',
      refundAmount: 0,
      createdAt: new Date(),
    });

    const result = await service.listMyRequests('customer-1');

    assert.equal(result.total, 1);
    assert.equal(result.items[0].customerId, 'customer-1');
  });

  it('lets staff approve a pending refund and marks order/payment refunded', async () => {
    const request = await service.createCustomerRequest('customer-1', {
      orderId: 'order-1',
      reason: 'Product arrived damaged',
    });

    const result = await service.decideRequest('staff-1', request.id, {
      status: 'Approved',
      refundAmount: 120,
      staffNote: 'Approved after checking evidence',
    });

    assert.equal(result.status, 'Approved');
    assert.equal(repository.orders[0].orderStatus, 'Returned');
    assert.equal(repository.orders[0].paymentStatus, 'Refunded');
    assert.equal(repository.payments[0].paymentStatus, 'Refunded');
  });

  it('rejects refund amount greater than order total', async () => {
    const request = await service.createCustomerRequest('customer-1', {
      orderId: 'order-1',
      reason: 'Product arrived damaged',
    });

    await assert.rejects(
      () => service.decideRequest('staff-1', request.id, { status: 'Approved', refundAmount: 121, staffNote: 'Too much' }),
      /Refund amount cannot exceed order total/
    );
  });
});
