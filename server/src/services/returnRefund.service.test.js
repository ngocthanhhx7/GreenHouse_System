const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createReturnRefundService } = require('./returnRefund.service');

function createRepository() {
  const orders = [
    { _id: 'order-1', orderCode: 'GH-DEMO-2001', customerId: 'customer-1', totalAmount: 120, currency: 'VND', paymentStatus: 'Paid', orderStatus: 'Delivered' },
    { _id: 'order-2', orderCode: 'GH-DEMO-2002', customerId: 'customer-1', totalAmount: 80, currency: 'VND', paymentStatus: 'Paid', orderStatus: 'Shipped' },
  ];
  const details = [
    { _id: 'detail-1', orderId: 'order-1', productId: 'product-1', productNameSnapshot: 'Bamboo Cutting Board', quantity: 1, priceSnapshot: 120, subtotal: 120 },
  ];
  const payments = [{ _id: 'payment-1', orderId: 'order-1', amount: 120, paymentStatus: 'Paid' }];
  const attempts = [{ _id: 'attempt-1', orderId: 'order-1', amount: 120, currency: 'VND', paymentStatus: 'Paid' }];
  const requests = [];
  const returnItems = [];
  const refunds = [];

  return {
    orders, payments, attempts, requests, returnItems, refunds,
    async findOrderById(id) { return orders.find((order) => order._id === id) || null; },
    async listOrderDetails(orderId) { return details.filter((detail) => detail.orderId === orderId); },
    async findOpenRequestByOrderId(orderId) { return requests.find((request) => request.orderId === orderId && ['Pending', 'AwaitingInspection', 'ReadyForRefund'].includes(request.status)) || null; },
    async createRequest(data) { const request = { _id: `refund-${requests.length + 1}`, status: 'Pending', createdAt: new Date(), ...data }; requests.push(request); return request; },
    async listRequests(query = {}) { return requests.filter((request) => (!query.customerId || request.customerId === query.customerId) && (!query.status || request.status === query.status)); },
    async findRequestById(id) { return requests.find((request) => request._id === id) || null; },
    async updateRequest(id, data) { const request = requests.find((entry) => entry._id === id); Object.assign(request, data); return request; },
    async updateOrder(id, data) { const order = orders.find((entry) => entry._id === id); Object.assign(order, data); return order; },
    async findPaymentByOrderId(orderId) { return payments.find((payment) => payment.orderId === orderId) || null; },
    async updatePayment(id, data) { const payment = payments.find((entry) => entry._id === id); Object.assign(payment, data); return payment; },
    async findLatestPaymentAttemptByOrder(orderId) { return attempts.filter((attempt) => attempt.orderId === orderId).at(-1) || null; },
    async updatePaymentAttempt(id, data) { const attempt = attempts.find((entry) => entry._id === id); Object.assign(attempt, data); return attempt; },
    async upsertRefundPending(data) { let pending = refunds.find((entry) => entry.orderId === data.orderId); if (!pending) { pending = { _id: `pending-${refunds.length + 1}`, ...data }; refunds.push(pending); } return pending; },
    async listReturnItems(requestId) { return returnItems.filter((item) => item.returnRefundRequestId === requestId); },
    async createReturnItems(items) { const created = items.map((item) => ({ _id: `return-item-${returnItems.length + 1}`, ...item })); returnItems.push(...created); return created; },
  };
}

function createAuditLogger() {
  return { entries: [], async log(entry) { this.entries.push(entry); } };
}

describe('return/refund service', () => {
  let repository;
  let auditLogger;
  let service;

  beforeEach(() => {
    repository = createRepository();
    auditLogger = createAuditLogger();
    service = createReturnRefundService({
      repository,
      auditLogger,
      transactionManager: { async withTransaction(work) { return work(); } },
    });
  });

  async function createPendingRequest() {
    return service.createCustomerRequest('customer-1', { orderId: 'order-1', reason: 'Product arrived damaged' });
  }

  async function approveAndInspect() {
    const request = await createPendingRequest();
    await service.decideRequest('staff-1', request.id, { status: 'Approved', refundAmount: 120, staffNote: 'Evidence accepted' });
    return service.inspectRequest('warehouse-1', request.id, {
      warehouseNote: 'One item checked at receiving desk',
      items: [{ orderDetailId: 'detail-1', receivedQuantity: 1, sellableQuantity: 0, damagedQuantity: 1, evidenceImages: ['damage.jpg'] }],
    });
  }

  it('creates a customer return/refund request for a delivered order', async () => {
    const result = await createPendingRequest();
    assert.equal(result.status, 'Pending');
    assert.equal(result.orderCode, 'GH-DEMO-2001');
    assert.equal(result.details.length, 1);
  });

  it('rejects a return/refund request when the order is not delivered', async () => {
    await assert.rejects(() => service.createCustomerRequest('customer-1', { orderId: 'order-2', reason: 'Need return' }), /Only Delivered orders can be returned/);
  });

  it('requires a staff note and sends approval to inspection without refunding or mutating the order', async () => {
    const request = await createPendingRequest();
    const beforeOrder = structuredClone(repository.orders[0]);
    const beforePayment = structuredClone(repository.payments[0]);
    await assert.rejects(() => service.decideRequest('staff-1', request.id, { status: 'Approved', refundAmount: 120 }), /Staff note is required/);

    const result = await service.decideRequest('staff-1', request.id, { status: 'Approved', refundAmount: 120, staffNote: 'Evidence accepted' });
    assert.equal(result.status, 'AwaitingInspection');
    assert.deepEqual(repository.orders[0], beforeOrder);
    assert.deepEqual(repository.payments[0], beforePayment);
    assert.equal(repository.refunds.length, 0);
  });

  it('requires a staff note when rejecting a return request', async () => {
    const request = await createPendingRequest();
    await assert.rejects(() => service.decideRequest('staff-1', request.id, { status: 'Rejected' }), /Staff note is required/);
    const result = await service.decideRequest('staff-1', request.id, { status: 'Rejected', staffNote: 'Evidence is insufficient' });
    assert.equal(result.status, 'Rejected');
  });

  it('requires warehouse inspection before refund completion and validates item quantities', async () => {
    const request = await createPendingRequest();
    await service.decideRequest('staff-1', request.id, { status: 'Approved', refundAmount: 120, staffNote: 'Evidence accepted' });
    await assert.rejects(() => service.completeRefund('staff-1', request.id, { note: 'Too early' }), /Only ReadyForRefund requests can be completed/);
    await assert.rejects(() => service.inspectRequest('warehouse-1', request.id, { items: [{ orderDetailId: 'detail-1', receivedQuantity: 2, sellableQuantity: 0, damagedQuantity: 2 }] }), /cannot exceed ordered quantity/);
  });

  it('moves only an inspected request to ready-for-refund and creates one idempotent hand-off', async () => {
    const inspected = await approveAndInspect();
    assert.equal(inspected.status, 'ReadyForRefund');
    assert.equal(repository.returnItems.length, 1);
    assert.equal(repository.refunds.length, 1);
    await assert.rejects(() => service.inspectRequest('warehouse-1', inspected.id, { items: [] }), /Only AwaitingInspection requests can be inspected/);
    assert.equal(repository.refunds.length, 1);
  });

  it('completes a refund exactly once after inspection and updates only the payment reconciliation records then', async () => {
    const inspected = await approveAndInspect();
    const completed = await service.completeRefund('staff-1', inspected.id, { note: 'Refund settled by payment operations' });
    assert.equal(completed.status, 'Completed');
    assert.equal(repository.orders[0].orderStatus, 'Returned');
    assert.equal(repository.orders[0].paymentStatus, 'Refunded');
    assert.equal(repository.payments[0].paymentStatus, 'Refunded');
    assert.equal(repository.attempts[0].paymentStatus, 'Refunded');
    await assert.rejects(() => service.completeRefund('staff-1', inspected.id, { note: 'Duplicate' }), /Only ReadyForRefund requests can be completed/);
    assert.equal(repository.refunds.length, 1);
  });
});
