const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createReportService } = require('./report.service');

function createRepository() {
  const orders = [
    { _id: 'order-1', totalAmount: 100, paymentMethod: 'ONLINE', paymentStatus: 'Paid', orderStatus: 'Delivered', deliveredAt: new Date('2026-07-10'), completedSaleAt: new Date('2026-07-10') },
    { _id: 'order-2', totalAmount: 50, paymentStatus: 'Pending', orderStatus: 'Pending', createdAt: new Date('2026-07-10') },
    { _id: 'order-3', totalAmount: 40, paymentStatus: 'Refunded', orderStatus: 'Returned', updatedAt: new Date('2026-07-10') },
    { _id: 'order-4', totalAmount: 30, paymentStatus: 'Paid', orderStatus: 'Packed', createdAt: new Date('2026-07-10') },
  ];
  const products = [{ _id: 'p1' }, { _id: 'p2' }];
  const inventory = [
    { _id: 'inv-1', stockQuantity: 3, lowStockThreshold: 5 },
    { _id: 'inv-2', stockQuantity: 20, lowStockThreshold: 5 },
  ];
  const supportRequests = [
    { _id: 's1', status: 'Open' },
    { _id: 's2', status: 'Resolved' },
  ];
  const reviews = [
    { _id: 'r1', rating: 5, createdAt: new Date('2026-07-10') },
    { _id: 'r2', rating: 3, createdAt: new Date('2026-07-10') },
  ];
  const completedRefunds = [
    { _id: 'refund-1', status: 'Completed', refundAmount: 25, completedAt: new Date('2026-07-10') },
  ];

  return {
    async listOrders() {
      return orders;
    },
    async listCompletedRefunds() {
      return completedRefunds;
    },
    async countProducts() {
      return products.length;
    },
    async listInventory() {
      return inventory;
    },
    async listSupportRequests() {
      return supportRequests;
    },
    async listReviews() {
      return reviews;
    },
  };
}

describe('report service', () => {
  let service;

  beforeEach(() => {
    service = createReportService({ repository: createRepository() });
  });

  it('builds an admin overview report from orders inventory support and reviews', async () => {
    const result = await service.getAdminOverview();

    assert.equal(result.orders.total, 4);
    assert.equal(result.orders.delivered, 1);
    assert.equal(result.revenue.grossSales, 100);
    assert.equal(result.revenue.refunded, 25);
    assert.equal(result.revenue.netSales, 75);
    assert.equal(result.products.total, 2);
    assert.equal(result.inventory.lowStock, 1);
    assert.equal(result.support.open, 1);
    assert.equal(result.reviews.averageRating, 4);
  });

  it('rejects an invalid report date range', async () => {
    await assert.rejects(
      () => service.getAdminOverview({ from: '2026-07-11', to: '2026-07-10' }),
      /date range/
    );
  });

  it('rejects malformed and impossible reporting dates', async () => {
    await assert.rejects(
      () => service.getAdminOverview({ from: '2026-02-30' }),
      /date range/
    );
    await assert.rejects(
      () => service.getAdminOverview({ to: '2026/07/10' }),
      /date range/
    );
  });

  it('does not infer refunds from returned orders without a completed refund request', async () => {
    const repository = createRepository();
    repository.listCompletedRefunds = async () => [];
    const result = await createReportService({ repository }).getAdminOverview();

    assert.equal(result.revenue.refunded, 0);
    assert.equal(result.revenue.netSales, result.revenue.grossSales);
  });

  it('derives terminal delivery failures without treating resolved Shipped orders as backlog', async () => {
    const repository = {
      async listOrders() {
        return [
          { _id: 'active-shipment', orderStatus: 'Shipped' },
          {
            _id: 'resolved-shipment',
            orderStatus: 'Shipped',
            deliveryResolutionCommandKey: 'terminal-resolution-001',
          },
          { _id: 'legacy-failed', orderStatus: 'DeliveryFailed' },
        ];
      },
      async listAuditLogs() { return []; },
    };
    const result = await createReportService({ repository }).getOrderReport({ mode: 'allTime' });

    assert.equal(result.orders.currentSnapshot.backlog, 1);
    assert.equal(result.orders.currentSnapshot.terminalDeliveryFailures, 2);
    assert.equal(result.orders.currentSnapshot.byStatus.Shipped, 2);
    assert.equal(result.orders.currentSnapshot.byStatus.DeliveryFailed, 1);
  });

  it('filters period metrics by their reporting timestamps while keeping snapshots current', async () => {
    const repository = {
      async listOrders() {
        return [
          { _id: 'created-in', orderStatus: 'Pending', paymentStatus: 'Pending', totalAmount: 10, createdAt: new Date('2026-07-10') },
          { _id: 'completed-in', paymentMethod: 'ONLINE', orderStatus: 'Delivered', paymentStatus: 'Paid', totalAmount: 100, createdAt: new Date('2026-07-01'), deliveredAt: new Date('2026-07-10'), completedSaleAt: new Date('2026-07-10') },
          { _id: 'missing-delivered-at', paymentMethod: 'ONLINE', orderStatus: 'Delivered', paymentStatus: 'Paid', totalAmount: 200, createdAt: new Date('2026-07-10'), updatedAt: new Date('2026-07-10'), completedSaleAt: new Date('2026-07-20') },
          { _id: 'created-in-completed-out', paymentMethod: 'ONLINE', orderStatus: 'Delivered', paymentStatus: 'Paid', totalAmount: 300, createdAt: new Date('2026-07-10'), deliveredAt: new Date('2026-07-20'), completedSaleAt: new Date('2026-07-20') },
          { _id: 'outside', orderStatus: 'Returned', paymentStatus: 'Refunded', totalAmount: 400, createdAt: new Date('2026-07-20') },
        ];
      },
      async listCompletedRefunds() {
        return [
          { refundAmount: 15, completedAt: new Date('2026-07-10') },
          { refundAmount: 25, createdAt: new Date('2026-07-10'), updatedAt: new Date('2026-07-10') },
          { refundAmount: 35, completedAt: new Date('2026-07-20') },
        ];
      },
      async countProducts() { return 7; },
      async listInventory() { return [{ stockQuantity: 1, lowStockThreshold: 2 }, { stockQuantity: 10, lowStockThreshold: 2 }]; },
      async listSupportRequests() {
        return [
          { status: 'New', createdAt: new Date('2026-07-10') },
          { status: 'Resolved', createdAt: new Date('2026-07-10') },
          { status: 'Open', createdAt: new Date('2026-07-20') },
        ];
      },
      async listReviews() {
        return [
          { status: 'Visible', rating: 5, createdAt: new Date('2026-07-10') },
          { status: 'Visible', rating: 1, createdAt: new Date('2026-07-20') },
        ];
      },
    };

    const result = await createReportService({ repository }).getAdminOverview({ from: '2026-07-10', to: '2026-07-10' });

    assert.equal(result.orders.total, 5);
    assert.equal(result.orders.delivered, 3);
    assert.equal(result.orders.returned, 1);
    assert.deepEqual(result.orders.byStatus, { Pending: 1, Delivered: 3, Returned: 1 });
    assert.equal(result.orders.periodEvents.created, 3);
    assert.equal(result.revenue.grossSales, 100);
    assert.equal(result.revenue.refunded, 15);
    assert.equal(result.support.total, 2);
    assert.equal(result.support.open, 2);
    assert.equal(result.support.resolved, 1);
    assert.equal(result.reviews.total, 1);
    assert.equal(result.reviews.averageRating, 5);
    assert.equal(result.products.total, 7);
    assert.equal(result.inventory.lowStock, 1);
    assert.equal(result.period.from.toISOString(), '2026-07-09T17:00:00.000Z');
    assert.equal(result.period.to.toISOString(), '2026-07-10T16:59:59.999Z');

    const allTimeResult = await createReportService({ repository })
      .getAdminOverview({ mode: 'allTime' });

    assert.equal(allTimeResult.revenue.grossSales, 600);
    assert.equal(allTimeResult.revenue.refunded, 50);
  });

  it('uses fixed Vietnam day boundaries for period metrics', async () => {
    const repository = {
      async listOrders() {
        return [
          { _id: 'before', paymentMethod: 'ONLINE', orderStatus: 'Delivered', paymentStatus: 'Paid', totalAmount: 10, createdAt: new Date('2026-07-09T16:59:59.999Z'), deliveredAt: new Date('2026-07-09T16:59:59.999Z'), completedSaleAt: new Date('2026-07-09T16:59:59.999Z') },
          { _id: 'first', paymentMethod: 'ONLINE', orderStatus: 'Delivered', paymentStatus: 'Paid', totalAmount: 20, createdAt: new Date('2026-07-09T17:00:00.000Z'), deliveredAt: new Date('2026-07-09T17:00:00.000Z'), completedSaleAt: new Date('2026-07-09T17:00:00.000Z') },
          { _id: 'last', paymentMethod: 'ONLINE', orderStatus: 'Delivered', paymentStatus: 'Paid', totalAmount: 30, createdAt: new Date('2026-07-10T16:59:59.999Z'), deliveredAt: new Date('2026-07-10T16:59:59.999Z'), completedSaleAt: new Date('2026-07-10T16:59:59.999Z') },
          { _id: 'after', paymentMethod: 'ONLINE', orderStatus: 'Delivered', paymentStatus: 'Paid', totalAmount: 40, createdAt: new Date('2026-07-10T17:00:00.000Z'), deliveredAt: new Date('2026-07-10T17:00:00.000Z'), completedSaleAt: new Date('2026-07-10T17:00:00.000Z') },
        ];
      },
      async listCompletedRefunds() {
        return [
          { refundAmount: 1, completedAt: new Date('2026-07-09T16:59:59.999Z') },
          { refundAmount: 2, completedAt: new Date('2026-07-09T17:00:00.000Z') },
          { refundAmount: 3, completedAt: new Date('2026-07-10T16:59:59.999Z') },
          { refundAmount: 4, completedAt: new Date('2026-07-10T17:00:00.000Z') },
        ];
      },
      async countProducts() { return 0; },
      async listInventory() { return []; },
      async listSupportRequests() {
        return [
          { status: 'Open', createdAt: new Date('2026-07-09T16:59:59.999Z') },
          { status: 'Open', createdAt: new Date('2026-07-09T17:00:00.000Z') },
          { status: 'Resolved', createdAt: new Date('2026-07-10T16:59:59.999Z') },
          { status: 'Open', createdAt: new Date('2026-07-10T17:00:00.000Z') },
        ];
      },
      async listReviews() {
        return [
          { rating: 1, createdAt: new Date('2026-07-09T16:59:59.999Z') },
          { rating: 4, createdAt: new Date('2026-07-09T17:00:00.000Z') },
          { rating: 5, createdAt: new Date('2026-07-10T16:59:59.999Z') },
          { rating: 1, createdAt: new Date('2026-07-10T17:00:00.000Z') },
        ];
      },
    };

    const result = await createReportService({ repository }).getAdminOverview({ from: '2026-07-10', to: '2026-07-10' });

    assert.equal(result.orders.total, 4);
    assert.equal(result.orders.periodEvents.created, 2);
    assert.equal(result.revenue.grossSales, 50);
    assert.equal(result.revenue.refunded, 5);
    assert.equal(result.support.total, 2);
    assert.equal(result.support.open, 3);
    assert.equal(result.support.resolved, 1);
    assert.equal(result.reviews.total, 2);
    assert.equal(result.reviews.averageRating, 4.5);
  });
});
