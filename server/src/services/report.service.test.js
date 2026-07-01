const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createReportService } = require('./report.service');

function createRepository() {
  const orders = [
    { _id: 'order-1', totalAmount: 100, paymentStatus: 'Paid', orderStatus: 'Delivered' },
    { _id: 'order-2', totalAmount: 50, paymentStatus: 'Pending', orderStatus: 'Pending' },
    { _id: 'order-3', totalAmount: 40, paymentStatus: 'Refunded', orderStatus: 'Returned' },
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

  return {
    async listOrders() {
      return orders;
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

    assert.equal(result.orders.total, 3);
    assert.equal(result.orders.delivered, 1);
    assert.equal(result.revenue.paid, 100);
    assert.equal(result.revenue.refunded, 40);
    assert.equal(result.products.total, 2);
    assert.equal(result.inventory.lowStock, 1);
    assert.equal(result.support.open, 1);
    assert.equal(result.reviews.averageRating, 4);
  });
});
