const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createReportService } = require('./report.service');

function createRepository() {
  const orders = [
    { _id: 'order-1', totalAmount: 100, paymentStatus: 'Paid', orderStatus: 'Delivered', deliveredAt: new Date('2026-07-10') },
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
    { _id: 'r1', rating: 5 },
    { _id: 'r2', rating: 3 },
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

  it('does not infer refunds from returned orders without a completed refund request', async () => {
    const repository = createRepository();
    repository.listCompletedRefunds = async () => [];
    const result = await createReportService({ repository }).getAdminOverview();

    assert.equal(result.revenue.refunded, 0);
    assert.equal(result.revenue.netSales, result.revenue.grossSales);
  });
});
