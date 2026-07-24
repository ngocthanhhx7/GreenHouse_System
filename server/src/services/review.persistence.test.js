const assert = require('node:assert/strict');
const { it } = require('node:test');
const mongoose = require('mongoose');

const ProductReview = require('../models/productReview.model');
const {
  createModelRepository,
} = require('./review.persistence');
const {
  createReviewService,
} = require('./review.service');

function boundedFind(items) {
  return {
    sort() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    async lean() {
      return items;
    },
  };
}

it('casts the public rating aggregate product ID and preserves its average rating', async () => {
  const productId = '507f1f77bcf86cd799439011';
  const categoryId = '507f191e810c19729de860ea';
  const customerId = '507f191e810c19729de860eb';
  const reviews = [
    {
      _id: '507f191e810c19729de860ec',
      customerId,
      productId,
      rating: 5,
      content: 'Excellent',
      publicationStatus: 'Published',
      moderationStatus: 'Allowed',
      version: 1,
      createdAt: new Date('2026-07-24T08:00:00.000Z'),
    },
    {
      _id: '507f191e810c19729de860ed',
      customerId,
      productId,
      rating: 4,
      content: 'Good',
      publicationStatus: 'Published',
      moderationStatus: 'Allowed',
      version: 1,
      createdAt: new Date('2026-07-23T08:00:00.000Z'),
    },
  ];
  const originals = {
    aggregate: ProductReview.aggregate,
    countDocuments: ProductReview.countDocuments,
    find: ProductReview.find,
  };
  let aggregatePipeline;

  try {
    ProductReview.find = () => boundedFind(reviews);
    ProductReview.countDocuments = async () => 2;
    ProductReview.aggregate = async (pipeline) => {
      aggregatePipeline = pipeline;
      return [{ _id: null, ratingSum: 9 }];
    };

    const modelRepository = createModelRepository();
    const service = createReviewService({
      repository: {
        ...modelRepository,
        async findProductById() {
          return { _id: productId, categoryId, status: 'Active' };
        },
        async findCategoryById() {
          return { _id: categoryId, status: 'Active' };
        },
        async findUserById() {
          return { _id: customerId, fullName: 'Nguyen Van An' };
        },
      },
    });

    const page = await service.listPublic(productId, { page: 1, pageSize: 20 });

    const aggregateProductId = aggregatePipeline[0].$match.productId;
    assert.equal(aggregateProductId instanceof mongoose.Types.ObjectId, true);
    assert.equal(String(aggregateProductId), productId);
    assert.equal(page.total, 2);
    assert.equal(page.averageRating, 4.5);
  } finally {
    ProductReview.aggregate = originals.aggregate;
    ProductReview.countDocuments = originals.countDocuments;
    ProductReview.find = originals.find;
  }
});
