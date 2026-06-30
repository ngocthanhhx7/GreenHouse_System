const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createStaffOrderService } = require('./staffOrder.service');

function createOrderRepository() {
  const orders = [
    {
      _id: 'order-1',
      orderCode: 'ORD-1',
      customerId: 'customer-1',
      totalAmount: 50,
      paymentMethod: 'COD',
      paymentStatus: 'Pending',
      orderStatus: 'Pending',
      shippingAddress: 'Ha Noi',
      createdAt: new Date('2026-06-30T08:00:00Z'),
    },
    {
      _id: 'order-2',
      orderCode: 'ORD-2',
      customerId: 'customer-2',
      totalAmount: 80,
      paymentMethod: 'ONLINE',
      paymentStatus: 'Pending',
      orderStatus: 'WaitingForPayment',
      shippingAddress: 'Da Nang',
      createdAt: new Date('2026-06-30T09:00:00Z'),
    },
  ];
  const details = [
    { _id: 'detail-1', orderId: 'order-1', productId: 'p1', productNameSnapshot: 'Green Pan', quantity: 2, priceSnapshot: 25, subtotal: 50 },
  ];
  const exports = [];

  return {
    orders,
    exports,
    async listOrders(query = {}) {
      return orders.filter((order) => !query.status || order.orderStatus === query.status);
    },
    async findOrderById(id) {
      return orders.find((order) => order._id === id) || null;
    },
    async listOrderDetails(orderId) {
      return details.filter((detail) => detail.orderId === orderId);
    },
    async updateOrder(id, data) {
      const order = orders.find((entry) => entry._id === id);
      Object.assign(order, data);
      return order;
    },
    async findOpenStockExportRequest(orderId) {
      return exports.find((entry) => entry.orderId === orderId && ['Pending', 'Approved', 'Processing'].includes(entry.status)) || null;
    },
    async createStockExportRequest(data) {
      const request = { _id: `export-${exports.length + 1}`, status: 'Pending', ...data };
      exports.push(request);
      return request;
    },
  };
}

function createAuditLogger() {
  const entries = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
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

  it('confirms a valid pending COD order', async () => {
    const result = await service.confirmOrder('staff-1', 'order-1', { note: 'Reviewed' });

    assert.equal(result.orderStatus, 'Confirmed');
    assert.equal(auditLogger.entries[0].action, 'STAFF_ORDER_CONFIRM');
  });

  it('rejects confirming an unpaid online order', async () => {
    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-2', {}),
      /Online order must be paid before confirmation/
    );
  });

  it('creates one stock export request and moves order to stock export requested', async () => {
    await service.confirmOrder('staff-1', 'order-1', {});

    const result = await service.requestStockExport('staff-1', 'order-1', { note: 'Prepare shipment' });

    assert.equal(result.order.orderStatus, 'StockExportRequested');
    assert.equal(result.stockExportRequest.orderId, 'order-1');
    await assert.rejects(
      () => service.requestStockExport('staff-1', 'order-1', {}),
      /Stock export request already exists/
    );
  });

  it('rejects skipped order status transitions', async () => {
    await service.confirmOrder('staff-1', 'order-1', {});

    await assert.rejects(
      () => service.updateStatus('staff-1', 'order-1', { nextStatus: 'Shipped' }),
      /Invalid order status transition/
    );
  });

  it('returns invoice data for confirmed orders', async () => {
    await service.confirmOrder('staff-1', 'order-1', {});

    const result = await service.getInvoice('order-1');

    assert.equal(result.order.orderCode, 'ORD-1');
    assert.equal(result.items[0].productNameSnapshot, 'Green Pan');
    assert.equal(result.totalAmount, 50);
  });
});
