const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createStaffOrderService } = require('./staffOrder.service');

function createOrderRepository() {
  const orders = [
    {
      _id: 'order-1', orderCode: 'ORD-1', customerId: 'customer-1', totalAmount: 50,
      subtotal: 45, shippingFee: 5, currency: 'VND', receiverName: 'Nguyen Van A', receiverPhone: '0900000001',
      paymentMethod: 'COD', paymentStatus: 'Unpaid', orderStatus: 'Pending', shippingAddress: 'Ha Noi', createdAt: new Date('2026-06-30T08:00:00Z'),
    },
    {
      _id: 'order-2', orderCode: 'ORD-2', customerId: 'customer-2', totalAmount: 80,
      paymentMethod: 'ONLINE', paymentStatus: 'Pending', orderStatus: 'WaitingForPayment', shippingAddress: 'Da Nang', createdAt: new Date('2026-06-30T09:00:00Z'),
    },
  ];
  const details = [
    { _id: 'detail-1', orderId: 'order-1', productId: 'p1', productNameSnapshot: 'Green Pan', productSkuSnapshot: 'PAN-01', unitSnapshot: 'piece', productImageSnapshot: 'pan.jpg', quantity: 2, priceSnapshot: 25, subtotal: 50 },
  ];
  const exports = [];
  const payments = [
    { _id: 'payment-1', orderId: 'order-1', paymentMethod: 'COD', amount: 50, currency: 'VND', paymentStatus: 'Unpaid' },
    { _id: 'payment-2', orderId: 'order-2', paymentMethod: 'ONLINE', amount: 80, currency: 'VND', paymentStatus: 'Pending' },
  ];
  const attempts = [
    { _id: 'attempt-1', orderId: 'order-1', paymentMethod: 'COD', amount: 50, currency: 'VND', paymentStatus: 'Unpaid' },
    { _id: 'attempt-2', orderId: 'order-2', paymentMethod: 'ONLINE', amount: 80, currency: 'VND', paymentStatus: 'Pending' },
  ];
  const refunds = [];
  const invoices = [];

  return {
    orders, exports, payments, attempts, refunds, invoices,
    async listOrders(query = {}) { return orders.filter((order) => !query.status || order.orderStatus === query.status); },
    async findOrderById(id) { return orders.find((order) => order._id === id) || null; },
    async listOrderDetails(orderId) { return details.filter((detail) => detail.orderId === orderId); },
    async updateOrder(id, data) { const order = orders.find((entry) => entry._id === id); Object.assign(order, data); return order; },
    async findOpenStockExportRequest(orderId) { return exports.find((entry) => entry.orderId === orderId && ['Pending', 'Approved', 'Processing'].includes(entry.status)) || null; },
    async createStockExportRequest(data) { const request = { _id: `export-${exports.length + 1}`, status: 'Pending', ...data }; exports.push(request); return request; },
    async findPaymentByOrderId(orderId) { return payments.find((payment) => payment.orderId === orderId) || null; },
    async updatePayment(id, data) { const payment = payments.find((entry) => entry._id === id); Object.assign(payment, data); return payment; },
    async findLatestPaymentAttemptByOrder(orderId) { return attempts.filter((attempt) => attempt.orderId === orderId).at(-1) || null; },
    async updatePaymentAttempt(id, data) { const attempt = attempts.find((entry) => entry._id === id); Object.assign(attempt, data); return attempt; },
    async upsertRefundPending(data) { let refund = refunds.find((entry) => entry.orderId === data.orderId); if (!refund) { refund = { _id: `refund-${refunds.length + 1}`, ...data }; refunds.push(refund); } return refund; },
    async findInvoiceByOrderId(orderId) { return invoices.find((invoice) => invoice.orderId === orderId) || null; },
    async createInvoice(data) { const invoice = { _id: `invoice-${invoices.length + 1}`, ...data }; invoices.push(invoice); return invoice; },
  };
}

function createAuditLogger() {
  const entries = [];
  return { entries, async log(entry) { entries.push(entry); } };
}

describe('staff order service', () => {
  let orderRepository;
  let auditLogger;
  let service;

  beforeEach(() => {
    orderRepository = createOrderRepository();
    auditLogger = createAuditLogger();
    service = createStaffOrderService({ orderRepository, auditLogger });
  });

  it('lists staff orders by status', async () => {
    const result = await service.listOrders({ status: 'Pending' });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].orderCode, 'ORD-1');
  });

  it('confirms a valid pending COD order and records confirmation time', async () => {
    const result = await service.confirmOrder('staff-1', 'order-1', { note: 'Reviewed' });
    assert.equal(result.orderStatus, 'Confirmed');
    assert.ok(orderRepository.orders[0].confirmedAt);
    assert.equal(auditLogger.entries[0].action, 'STAFF_ORDER_CONFIRM');
  });

  it('rejects confirming an unpaid online order', async () => {
    await assert.rejects(() => service.confirmOrder('staff-1', 'order-2', {}), /Online order must be paid before confirmation/);
  });

  it('creates one stock export request and moves order to stock export requested', async () => {
    await service.confirmOrder('staff-1', 'order-1', {});
    const result = await service.requestStockExport('staff-1', 'order-1', { note: 'Prepare shipment' });
    assert.equal(result.order.orderStatus, 'StockExportRequested');
    await assert.rejects(() => service.requestStockExport('staff-1', 'order-1', {}), /Stock export request already exists/);
  });

  it('does not allow generic status update to bypass stock export request creation', async () => {
    await service.confirmOrder('staff-1', 'order-1', {});
    await assert.rejects(
      () => service.updateStatus('staff-1', 'order-1', { nextStatus: 'StockExportRequested' }),
      /Use the stock export request action/,
    );
    assert.equal(orderRepository.exports.length, 0);
    assert.equal(orderRepository.orders[0].orderStatus, 'Confirmed');
  });

  it('does not let Staff move a stock-export-requested order to packed', async () => {
    orderRepository.orders[0].orderStatus = 'StockExportRequested';
    await assert.rejects(() => service.updateStatus('staff-1', 'order-1', { nextStatus: 'Packed' }), /Invalid order status transition/);
  });

  it('blocks COD delivery until collection and idempotently records collection before delivery', async () => {
    orderRepository.orders[0].orderStatus = 'Packed';
    await assert.rejects(() => service.updateStatus('staff-1', 'order-1', { nextStatus: 'Shipped' }).then(() => service.updateStatus('staff-1', 'order-1', { nextStatus: 'Delivered' })), /COD order must be paid before delivery/);

    orderRepository.orders[0].orderStatus = 'Packed';
    const collected = await service.markCodCollected('staff-1', 'order-1', { note: 'Collected on handoff' });
    const replay = await service.markCodCollected('staff-1', 'order-1', {});
    assert.equal(collected.paymentStatus, 'Paid');
    assert.equal(replay.idempotentReplay, true);
    assert.equal(orderRepository.payments[0].paymentStatus, 'Paid');
    assert.equal(orderRepository.attempts[0].paymentStatus, 'Paid');
    await service.updateStatus('staff-1', 'order-1', { nextStatus: 'Shipped' });
    const delivered = await service.updateStatus('staff-1', 'order-1', { nextStatus: 'Delivered' });
    assert.equal(delivered.orderStatus, 'Delivered');
  });

  it('requires a cancel reason and creates one refund hand-off for a paid cancellation', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    orderRepository.orders[0].paymentStatus = 'Paid';
    orderRepository.payments[0].paymentStatus = 'Paid';
    orderRepository.attempts[0].paymentStatus = 'Paid';
    await assert.rejects(() => service.cancelOrder('staff-1', 'order-1', {}), /Cancel reason is required/);
    const cancelled = await service.cancelOrder('staff-1', 'order-1', { cancelReason: 'Customer requested cancellation' });
    assert.equal(cancelled.orderStatus, 'Cancelled');
    assert.equal(cancelled.paymentStatus, 'RefundPending');
    assert.equal(orderRepository.refunds.length, 1);
    await assert.rejects(() => service.cancelOrder('staff-1', 'order-1', { cancelReason: 'Retry' }), /Only Pending or Confirmed orders can be cancelled/);
    assert.equal(orderRepository.refunds.length, 1);
    assert.equal(auditLogger.entries.filter((entry) => entry.action === 'STAFF_ORDER_CANCEL').length, 1);
  });

  it('creates one immutable invoice snapshot without mutating fulfillment or payment', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    const beforeOrder = structuredClone(orderRepository.orders[0]);
    const beforePayment = structuredClone(orderRepository.payments[0]);
    const first = await service.getInvoice('staff-1', 'order-1');
    const second = await service.getInvoice('staff-2', 'order-1');
    assert.equal(first.id, second.id);
    assert.equal(first.items[0].productSkuSnapshot, 'PAN-01');
    assert.deepEqual(orderRepository.orders[0], beforeOrder);
    assert.deepEqual(orderRepository.payments[0], beforePayment);
    assert.equal(orderRepository.invoices.length, 1);
  });
});
