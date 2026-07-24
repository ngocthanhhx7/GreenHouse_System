const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const Category = require('../models/category.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Product = require('../models/product.model');
const ProductReview = require('../models/productReview.model');
const User = require('../models/user.model');
const {
  createModelRepository,
} = require('./review.persistence');
const {
  createReviewService,
} = require('./review.service');

function replaceMethods(replacements) {
  const originals = replacements.map(([target, method]) => [
    target,
    method,
    target[method],
  ]);
  for (const [target, method, replacement] of replacements) {
    target[method] = replacement;
  }
  return () => {
    for (const [target, method, original] of originals) {
      target[method] = original;
    }
  };
}

describe('Review production persistence adapter', () => {
  it('returns catalog eligibility, page, count, rating, and safe names from one snapshot operation', async () => {
    const productId = '507f1f77bcf86cd799439011';
    const categoryId = '507f191e810c19729de860ea';
    const customerId = '507f191e810c19729de860eb';
    const reviews = [
      {
        _id: '507f191e810c19729de860ec',
        customerId,
        productId,
        customerDisplayName: 'Nguyen Van An',
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
        customerDisplayName: 'Nguyen Van An',
        rating: 4,
        content: 'Good',
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
        version: 1,
        createdAt: new Date('2026-07-23T08:00:00.000Z'),
      },
    ];
    let aggregateCalls = 0;
    let aggregatePipeline;
    const forbidSeparateRead = () => {
      throw new Error('public Review reads must use one Product snapshot aggregation');
    };
    const restore = replaceMethods([
      [Product, 'aggregate', async (pipeline) => {
        aggregateCalls += 1;
        aggregatePipeline = pipeline;
        return [{ items: reviews, total: 2, ratingSum: 9 }];
      }],
      [Product, 'findById', forbidSeparateRead],
      [Category, 'findById', forbidSeparateRead],
      [ProductReview, 'find', forbidSeparateRead],
      [ProductReview, 'countDocuments', forbidSeparateRead],
      [ProductReview, 'aggregate', forbidSeparateRead],
      [User, 'findById', forbidSeparateRead],
    ]);

    try {
      const service = createReviewService({
        repository: createModelRepository(),
      });

      const page = await service.listPublic(productId, { page: 1, pageSize: 20 });

      assert.equal(aggregateCalls, 1);
      assert.equal(
        aggregatePipeline[0].$match._id instanceof mongoose.Types.ObjectId,
        true,
      );
      assert.equal(String(aggregatePipeline[0].$match._id), productId);
      assert.match(JSON.stringify(aggregatePipeline), /\$facet/u);
      assert.match(JSON.stringify(aggregatePipeline), /publicationStatus/u);
      assert.match(JSON.stringify(aggregatePipeline), /moderationStatus/u);
      assert.match(JSON.stringify(aggregatePipeline), new RegExp(User.collection.name, 'u'));
      assert.equal(page.total, 2);
      assert.equal(page.averageRating, 4.5);
      assert.equal(page.items[0].displayName, 'An N.');
      assert.deepEqual(Object.keys(page.items[0]).sort(), [
        'content',
        'createdAt',
        'displayName',
        'rating',
        'updatedAt',
        'verifiedPurchase',
      ]);
    } finally {
      restore();
    }
  });

  it('finds one owned delivered fallback detail with a bounded stable aggregation', async () => {
    const customerId = '507f191e810c19729de860eb';
    const productId = '507f1f77bcf86cd799439011';
    const detail = {
      _id: new mongoose.Types.ObjectId('507f191e810c19729de860ec'),
      orderId: new mongoose.Types.ObjectId('507f191e810c19729de860ed'),
      productId: new mongoose.Types.ObjectId(productId),
      order: {
        _id: new mongoose.Types.ObjectId('507f191e810c19729de860ed'),
        customerId: new mongoose.Types.ObjectId(customerId),
        deliveredAt: new Date('2026-07-24T08:00:00.000Z'),
      },
    };
    let aggregateCalls = 0;
    let aggregatePipeline;
    const restore = replaceMethods([
      [OrderDetail, 'aggregate', async (pipeline) => {
        aggregateCalls += 1;
        aggregatePipeline = pipeline;
        return [detail];
      }],
      [OrderDetail, 'find', () => {
        throw new Error('fallback eligibility must not scan OrderDetail rows');
      }],
      [Order, 'find', () => {
        throw new Error('fallback eligibility must not scan lifetime Orders');
      }],
    ]);

    try {
      const repository = createModelRepository();
      const result = await repository.findOwnedDeliveredOrderDetail(
        customerId,
        productId,
      );

      assert.equal(aggregateCalls, 1);
      assert.equal(
        aggregatePipeline[0].$match.productId instanceof mongoose.Types.ObjectId,
        true,
      );
      assert.equal(String(aggregatePipeline[0].$match.productId), productId);
      const orderLookup = aggregatePipeline.find((stage) => stage.$lookup);
      assert.equal(orderLookup.$lookup.from, Order.collection.name);
      assert.match(JSON.stringify(orderLookup), new RegExp(customerId, 'u'));
      assert.match(JSON.stringify(orderLookup), /deliveredAt/u);
      assert.deepEqual(
        aggregatePipeline.find((stage) => stage.$sort).$sort,
        { 'order.deliveredAt': -1, _id: -1 },
      );
      assert.equal(aggregatePipeline.find((stage) => stage.$limit).$limit, 1);
      assert.equal(result, detail);
    } finally {
      restore();
    }
  });
});
