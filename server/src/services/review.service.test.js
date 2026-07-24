const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createReviewService } = require('./review.service');

function createRepository() {
  const products = [{
    _id: 'product-1',
    categoryId: 'category-1',
    name: 'Minimal Dinner Plate Set',
    status: 'Active',
  }];
  const categories = [{ _id: 'category-1', status: 'Active' }];
  const users = [{ _id: 'customer-1', fullName: 'Nguyen Van An', status: 'Active' }];
  const orders = [
    {
      _id: 'order-1',
      customerId: 'customer-1',
      orderStatus: 'Delivered',
      deliveredAt: new Date('2026-07-20T08:00:00.000Z'),
    },
    { _id: 'order-2', customerId: 'customer-1', orderStatus: 'Shipped' },
  ];
  const details = [
    { _id: 'detail-1', orderId: 'order-1', productId: 'product-1', productNameSnapshot: 'Minimal Dinner Plate Set' },
    { _id: 'detail-2', orderId: 'order-2', productId: 'product-1', productNameSnapshot: 'Minimal Dinner Plate Set' },
  ];
  const reviews = [];
  const contentHistory = [];
  const publicationHistory = [];
  const moderationHistory = [];
  const commands = [];

  return {
    reviews,
    async findProductById(id) {
      return products.find((product) => product._id === id && product.status === 'Active') || null;
    },
    async findCategoryById(id) {
      return categories.find((category) => category._id === id) || null;
    },
    async findUserById(id) {
      return users.find((user) => user._id === id) || null;
    },
    async findOrderById(id) {
      return orders.find((order) => order._id === id) || null;
    },
    async findOrderDetail(orderId, productId) {
      return details.find((detail) => detail.orderId === orderId && detail.productId === productId) || null;
    },
    async findOrderDetailById(id) {
      return details.find((detail) => detail._id === id) || null;
    },
    async listOwnedDeliveredOrderDetails(customerId, productId) {
      return details
        .filter((detail) => detail.productId === productId)
        .map((detail) => ({
          ...detail,
          order: orders.find((order) => order._id === detail.orderId),
        }))
        .filter((detail) => (
          detail.order?.customerId === customerId
          && detail.order.deliveredAt
        ));
    },
    async findExistingReview(customerId, orderId, productId) {
      return reviews.find((review) => review.customerId === customerId && review.productId === productId) || null;
    },
    async findReviewByIdentity(customerId, productId) {
      return reviews.find((review) => review.customerId === customerId && review.productId === productId) || null;
    },
    async findReviewById(id) {
      return reviews.find((review) => review._id === id) || null;
    },
    async insertReview(data) {
      const review = {
        _id: `review-${reviews.length + 1}`,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      reviews.push(review);
      return review;
    },
    async updateReviewByVersion(id, expectedVersion, changes) {
      const review = reviews.find((item) => (
        item._id === id
        && item.version === expectedVersion
      ));
      if (!review) return null;
      Object.assign(review, changes, { version: review.version + 1 });
      return { ...review };
    },
    async createReview(data) {
      return this.insertReview(data);
    },
    async appendContentHistory(entry) {
      contentHistory.push(entry);
      return entry;
    },
    async appendPublicationHistory(entry) {
      publicationHistory.push(entry);
      return entry;
    },
    async appendModerationHistory(entry) {
      moderationHistory.push(entry);
      return entry;
    },
    async findCommand(identity) {
      return commands.find((command) => (
        command.actorId === String(identity.actorId)
        && command.idempotencyKey === identity.idempotencyKey
      )) || null;
    },
    async recordCommand(command) {
      commands.push(command);
      return command;
    },
    async listPublicReviews(productId) {
      return reviews.filter((review) => review.productId === productId);
    },
    async listReviews(filter = {}) {
      if (typeof filter === 'string') {
        return reviews.filter((review) => (
          review.productId === filter
          && review.status === 'Visible'
        ));
      }
      return reviews.filter((review) => Object.entries(filter).every(
        ([key, value]) => value === undefined || review[key] === value,
      ));
    },
    async summarizeReviewHistories(reviewIds) {
      return Object.fromEntries(reviewIds.map((id) => [
        id,
        {
          contentEntries: contentHistory.filter((entry) => entry.reviewId === id).length,
          publicationEntries: publicationHistory.filter((entry) => entry.reviewId === id).length,
          moderationEntries: moderationHistory.filter((entry) => entry.reviewId === id).length,
        },
      ]));
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
    service = createReviewService({
      repository,
      auditLogger: createAuditLogger(),
      transactionManager: {
        async withTransaction(work) {
          return work({ id: 'review-legacy-test-transaction' });
        },
      },
      outbox: {
        async enqueue(entry) {
          return entry;
        },
      },
    });
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

  it('keeps legacy wrappers compatible with safe public and private reads', async () => {
    await service.createCustomerReview('customer-1', 'product-1', {
      orderId: 'order-1',
      rating: 5,
      content: 'Good quality plate set.',
    });

    const publicPage = await service.listProductReviews('product-1');
    const ownPage = await service.listOwn(
      { id: 'customer-1', role: 'Customer' },
      { page: 1, pageSize: 20 },
    );
    const moderationPage = await service.listModeration(
      { id: 'staff-1', role: 'Staff', status: 'Active' },
      { page: 1, pageSize: 20 },
    );

    assert.equal(publicPage.total, 1);
    assert.equal(publicPage.items[0].displayName, 'An N.');
    assert.equal(ownPage.total, 1);
    assert.deepEqual(ownPage.items[0].historySummary, {
      contentEntries: 1,
      publicationEntries: 0,
      moderationEntries: 0,
    });
    assert.equal(ownPage.items[0].customerId, undefined);
    assert.equal(moderationPage.total, 1);
    assert.equal(moderationPage.items[0].customerId, undefined);
  });

  it('keeps the retained legacy status aligned with derived public visibility', async () => {
    const created = await service.createCustomerReview('customer-1', 'product-1', {
      orderId: 'order-1',
      rating: 5,
      content: 'Good quality plate set.',
    });

    const hidden = await service.moderate(
      { id: 'staff-1', role: 'Staff', status: 'Active' },
      created.id,
      {
        moderationStatus: 'HiddenByStaff',
        reason: 'Policy moderation reason',
        expectedVersion: created.version,
      },
      { idempotencyKey: 'review-test-hide-0001' },
    );
    assert.equal(repository.reviews[0].status, 'Hidden');

    const withdrawn = await service.setPublication(
      { id: 'customer-1', role: 'Customer' },
      created.id,
      {
        publicationStatus: 'Withdrawn',
        expectedVersion: hidden.version,
      },
      { idempotencyKey: 'review-test-withdraw-0001' },
    );
    const allowed = await service.moderate(
      { id: 'staff-1', role: 'Staff', status: 'Active' },
      created.id,
      {
        moderationStatus: 'Allowed',
        reason: 'Policy review is complete',
        expectedVersion: withdrawn.version,
      },
      { idempotencyKey: 'review-test-allow-0001' },
    );
    assert.equal(repository.reviews[0].status, 'Hidden');

    await service.setPublication(
      { id: 'customer-1', role: 'Customer' },
      created.id,
      {
        publicationStatus: 'Published',
        expectedVersion: allowed.version,
      },
      { idempotencyKey: 'review-test-publish-0001' },
    );
    assert.equal(repository.reviews[0].status, 'Visible');
  });
});
