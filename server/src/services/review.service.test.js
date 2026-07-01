const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createReviewService } = require('./review.service');

function createRepository() {
  const products = [{ _id: 'product-1', name: 'Minimal Dinner Plate Set', status: 'Active' }];
  const orders = [
    { _id: 'order-1', customerId: 'customer-1', orderStatus: 'Delivered' },
    { _id: 'order-2', customerId: 'customer-1', orderStatus: 'Shipped' },
  ];
  const details = [
    { _id: 'detail-1', orderId: 'order-1', productId: 'product-1', productNameSnapshot: 'Minimal Dinner Plate Set' },
    { _id: 'detail-2', orderId: 'order-2', productId: 'product-1', productNameSnapshot: 'Minimal Dinner Plate Set' },
  ];
  const reviews = [];

  return {
    reviews,
    async findProductById(id) {
      return products.find((product) => product._id === id && product.status === 'Active') || null;
    },
    async findOrderById(id) {
      return orders.find((order) => order._id === id) || null;
    },
    async findOrderDetail(orderId, productId) {
      return details.find((detail) => detail.orderId === orderId && detail.productId === productId) || null;
    },
    async findExistingReview(customerId, orderId, productId) {
      return reviews.find((review) => review.customerId === customerId && review.orderId === orderId && review.productId === productId) || null;
    },
    async createReview(data) {
      const review = { _id: `review-${reviews.length + 1}`, status: 'Visible', createdAt: new Date(), ...data };
      reviews.push(review);
      return review;
    },
    async listReviews(productId) {
      return reviews.filter((review) => review.productId === productId && review.status === 'Visible');
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

describe('review service', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = createRepository();
    service = createReviewService({ repository, auditLogger: createAuditLogger() });
  });

  it('creates a product review for a delivered order containing the product', async () => {
    const result = await service.createCustomerReview('customer-1', 'product-1', {
      orderId: 'order-1',
      rating: 5,
      content: 'Good quality plate set.',
    });

    assert.equal(result.rating, 5);
    assert.equal(result.productName, 'Minimal Dinner Plate Set');
    assert.equal(repository.reviews.length, 1);
  });

  it('rejects review when order is not delivered', async () => {
    await assert.rejects(
      () => service.createCustomerReview('customer-1', 'product-1', { orderId: 'order-2', rating: 4, content: 'Nice' }),
      /Only delivered orders can be reviewed/
    );
  });

  it('rejects duplicate review for same order product', async () => {
    await service.createCustomerReview('customer-1', 'product-1', {
      orderId: 'order-1',
      rating: 5,
      content: 'Good quality plate set.',
    });

    await assert.rejects(
      () => service.createCustomerReview('customer-1', 'product-1', { orderId: 'order-1', rating: 4, content: 'Second review' }),
      /already reviewed/
    );
  });
});
