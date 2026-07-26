const mongoose = require('mongoose');
const AuditLog = require('../models/auditLog.model');
const Category = require('../models/category.model');
const DomainOutbox = require('../models/domainOutbox.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Product = require('../models/product.model');
const ProductReview = require('../models/productReview.model');
const CustomerDeliveryReceipt = require('../models/customerDeliveryReceipt.model');
const ReviewCommand = require('../models/reviewCommand.model');
const ReviewContentHistory = require('../models/reviewContentHistory.model');
const ReviewModerationHistory = require('../models/reviewModerationHistory.model');
const ReviewPublicationHistory = require('../models/reviewPublicationHistory.model');
const User = require('../models/user.model');
const { canonicalEnvelope } = require('./domainEventProducer.service');

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function withOptionalAggregateSession(aggregate, session) {
  return session ? aggregate.session(session) : aggregate;
}

function toPlain(value) {
  if (!value) return value;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function createOne(Model, data, session) {
  if (session) {
    const [created] = await Model.create([data], { session });
    return toPlain(created);
  }
  return toPlain(await Model.create(data));
}

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function createModelRepository() {
  return {
    async findProductById(id, session) {
      return withOptionalSession(Product.findById(id), session).lean();
    },

    async findCategoryById(id, session) {
      return withOptionalSession(Category.findById(id), session).lean();
    },

    async findUserById(id, session) {
      return withOptionalSession(User.findById(id).select('_id fullName status'), session).lean();
    },

    async findOrderById(id, session) {
      return withOptionalSession(Order.findById(id), session).lean();
    },

    async findOrderDetailById(id, session) {
      return withOptionalSession(OrderDetail.findById(id), session).lean();
    },

    async findOrderDetail(orderId, productId, session) {
      return withOptionalSession(
        OrderDetail.findOne({ orderId, productId }),
        session,
      ).lean();
    },

    async findOwnedDeliveredOrderDetail(customerId, productId, session) {
      if (
        !mongoose.isObjectIdOrHexString(String(customerId))
        || !mongoose.isObjectIdOrHexString(String(productId))
      ) {
        return null;
      }
      const customerObjectId = new mongoose.Types.ObjectId(String(customerId));
      const productObjectId = new mongoose.Types.ObjectId(String(productId));
      const aggregate = OrderDetail.aggregate([
        { $match: { productId: productObjectId } },
        {
          $lookup: {
            from: Order.collection.name,
            let: { orderId: '$orderId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$orderId'] },
                      { $eq: ['$customerId', customerObjectId] },
                      { $ne: ['$deliveredAt', null] },
                    ],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  customerId: 1,
                  deliveredAt: 1,
                  orderStatus: 1,
                },
              },
            ],
            as: 'ownedDeliveredOrder',
          },
        },
        { $unwind: '$ownedDeliveredOrder' },
        { $set: { order: '$ownedDeliveredOrder' } },
        { $unset: 'ownedDeliveredOrder' },
        { $sort: { 'order.deliveredAt': -1, _id: -1 } },
        { $limit: 1 },
      ]);
      const rows = await withOptionalAggregateSession(aggregate, session);
      return rows[0] || null;
    },

    async findOwnedReceivedOrderDetail(customerId, productId, session) {
      if (
        !mongoose.isObjectIdOrHexString(String(customerId))
        || !mongoose.isObjectIdOrHexString(String(productId))
      ) {
        return null;
      }
      const customerObjectId = new mongoose.Types.ObjectId(String(customerId));
      const productObjectId = new mongoose.Types.ObjectId(String(productId));
      const aggregate = OrderDetail.aggregate([
        { $match: { productId: productObjectId } },
        {
          $lookup: {
            from: Order.collection.name,
            let: { orderId: '$orderId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$orderId'] },
                      { $eq: ['$customerId', customerObjectId] },
                      { $ne: ['$deliveredAt', null] },
                    ],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  customerId: 1,
                  deliveredAt: 1,
                  orderStatus: 1,
                },
              },
            ],
            as: 'ownedDeliveredOrder',
          },
        },
        { $unwind: '$ownedDeliveredOrder' },
        {
          $lookup: {
            from: CustomerDeliveryReceipt.collection.name,
            let: { orderId: '$orderId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$orderId', '$$orderId'],
                  },
                },
              },
              { $sort: { createdAt: -1, _id: -1 } },
              { $limit: 1 },
            ],
            as: 'latestDeliveryReceipt',
          },
        },
        {
          $match: {
            'latestDeliveryReceipt.0.outcome': 'RECEIVED',
            'latestDeliveryReceipt.0.customerId': customerObjectId,
          },
        },
        {
          $set: {
            order: '$ownedDeliveredOrder',
            deliveryReceipt: { $arrayElemAt: ['$latestDeliveryReceipt', 0] },
          },
        },
        { $unset: ['ownedDeliveredOrder', 'latestDeliveryReceipt'] },
        { $sort: { 'order.deliveredAt': -1, _id: -1 } },
        { $limit: 1 },
      ]);
      const rows = await withOptionalAggregateSession(aggregate, session);
      return rows[0] || null;
    },

    async findReviewByIdentity(customerId, productId, session) {
      return withOptionalSession(
        ProductReview.findOne({ customerId, productId }),
        session,
      ).lean();
    },

    async findExistingReview(customerId, _orderId, productId, session) {
      return this.findReviewByIdentity(customerId, productId, session);
    },

    async findReviewById(id, session) {
      return withOptionalSession(ProductReview.findById(id), session).lean();
    },

    async insertReview(data, session) {
      return createOne(ProductReview, data, session);
    },

    async createReview(data, session) {
      return this.insertReview(data, session);
    },

    async updateReviewByVersion(id, expectedVersion, changes, session) {
      const query = ProductReview.findOneAndUpdate(
        { _id: id, version: expectedVersion },
        { $set: changes, $inc: { version: 1 } },
        { new: true, runValidators: true },
      );
      return withOptionalSession(query, session).lean();
    },

    async appendContentHistory(entry, session) {
      return createOne(ReviewContentHistory, entry, session);
    },

    async appendPublicationHistory(entry, session) {
      return createOne(ReviewPublicationHistory, entry, session);
    },

    async appendModerationHistory(entry, session) {
      return createOne(ReviewModerationHistory, entry, session);
    },

    async findCommand(identity, session) {
      return withOptionalSession(
        ReviewCommand.findOne({
          actorId: String(identity.actorId),
          idempotencyKey: identity.idempotencyKey,
        }),
        session,
      ).lean();
    },

    async recordCommand(command, session) {
      return createOne(ReviewCommand, command, session);
    },

    async queryPublicSnapshot(productId, { skip = 0, limit = 20 } = {}, session) {
      if (!mongoose.isObjectIdOrHexString(String(productId))) {
        return { items: [], total: 0, ratingSum: 0 };
      }
      const productObjectId = new mongoose.Types.ObjectId(String(productId));
      const aggregate = Product.aggregate([
        { $match: { _id: productObjectId, status: 'Active' } },
        {
          $lookup: {
            from: Category.collection.name,
            let: { categoryId: '$categoryId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$categoryId'] },
                      { $eq: ['$status', 'Active'] },
                    ],
                  },
                },
              },
              { $project: { _id: 1 } },
            ],
            as: 'activeCategory',
          },
        },
        { $match: { 'activeCategory.0': { $exists: true } } },
        {
          $lookup: {
            from: ProductReview.collection.name,
            let: { productId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$productId', '$$productId'] },
                      { $eq: ['$publicationStatus', 'Published'] },
                      { $eq: ['$moderationStatus', 'Allowed'] },
                    ],
                  },
                },
              },
              {
                $facet: {
                  items: [
                    { $sort: { createdAt: -1, _id: -1 } },
                    { $skip: skip },
                    { $limit: limit },
                    {
                      $lookup: {
                        from: User.collection.name,
                        let: { customerId: '$customerId' },
                        pipeline: [
                          {
                            $match: {
                              $expr: { $eq: ['$_id', '$$customerId'] },
                            },
                          },
                          { $project: { _id: 0, displayName: 1, fullName: 1 } },
                        ],
                        as: 'safeCustomer',
                      },
                    },
                    {
                      $set: {
                        customerDisplayName: {
                          $ifNull: [
                            {
                              $let: {
                                vars: {
                                  customer: { $arrayElemAt: ['$safeCustomer', 0] },
                                },
                                in: {
                                  $ifNull: [
                                    '$$customer.displayName',
                                    '$$customer.fullName',
                                  ],
                                },
                              },
                            },
                            '',
                          ],
                        },
                      },
                    },
                    { $unset: 'safeCustomer' },
                  ],
                  summary: [
                    {
                      $group: {
                        _id: null,
                        total: { $sum: 1 },
                        ratingSum: { $sum: '$rating' },
                      },
                    },
                  ],
                },
              },
            ],
            as: 'reviewSnapshot',
          },
        },
        {
          $set: {
            snapshot: { $arrayElemAt: ['$reviewSnapshot', 0] },
          },
        },
        {
          $project: {
            _id: 0,
            items: { $ifNull: ['$snapshot.items', []] },
            total: {
              $ifNull: [
                { $arrayElemAt: ['$snapshot.summary.total', 0] },
                0,
              ],
            },
            ratingSum: {
              $ifNull: [
                { $arrayElemAt: ['$snapshot.summary.ratingSum', 0] },
                0,
              ],
            },
          },
        },
      ]);
      const rows = await withOptionalAggregateSession(aggregate, session);
      return rows[0] || { items: [], total: 0, ratingSum: 0 };
    },

    async queryReviews(
      filter = {},
      { skip = 0, limit = 20 } = {},
      session,
    ) {
      const allowed = [
        'customerId',
        'productId',
        'publicationStatus',
        'moderationStatus',
      ];
      const query = Object.fromEntries(
        allowed
          .filter((key) => filter[key] !== undefined)
          .map((key) => [key, filter[key]]),
      );
      const itemsQuery = ProductReview.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit);
      const countQuery = ProductReview.countDocuments(query);
      const [items, total] = await Promise.all([
        withOptionalSession(itemsQuery, session).lean(),
        withOptionalSession(countQuery, session),
      ]);
      return { items, total };
    },

    async summarizeReviewHistories(reviewIds, session) {
      if (reviewIds.length === 0) return {};
      const ids = reviewIds.map((id) => new mongoose.Types.ObjectId(String(id)));
      const aggregate = (Model) => withOptionalSession(
        Model.aggregate([
          { $match: { reviewId: { $in: ids } } },
          { $group: { _id: '$reviewId', count: { $sum: 1 } } },
        ]),
        session,
      );
      const [content, publication, moderation] = await Promise.all([
        aggregate(ReviewContentHistory),
        aggregate(ReviewPublicationHistory),
        aggregate(ReviewModerationHistory),
      ]);
      const summaries = Object.fromEntries(reviewIds.map((id) => [
        String(id),
        { contentEntries: 0, publicationEntries: 0, moderationEntries: 0 },
      ]));
      for (const row of content) summaries[String(row._id)].contentEntries = row.count;
      for (const row of publication) summaries[String(row._id)].publicationEntries = row.count;
      for (const row of moderation) summaries[String(row._id)].moderationEntries = row.count;
      return summaries;
    },
  };
}

function createModelAuditLogger() {
  return {
    async log(entry, session) {
      return createOne(AuditLog, {
        userId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        eventId: [
          entry.aggregateType,
          entry.aggregateId,
          entry.version,
          entry.idempotencyKey,
        ].join(':'),
        targetEntity: entry.targetEntity,
        targetId: entry.targetId,
        description: '',
        after: {
          aggregateType: entry.aggregateType,
          aggregateId: entry.aggregateId,
          version: entry.version,
          occurredAt: entry.occurredAt,
          idempotencyKey: entry.idempotencyKey,
          metadata: entry.metadata,
        },
      }, session);
    },
  };
}

function createModelOutboxRepository() {
  return {
    async enqueue(entry, session, context = {}) {
      const identityKey = [
        entry.aggregateType,
        entry.aggregateId,
        entry.version,
        entry.eventType,
      ].join(':');
      if (entry.eventType === 'REVIEW_MODERATION_CHANGED') {
        if (!context.recipientId) {
          throw new Error('Review moderation Notification recipient is required');
        }
        return createOne(DomainOutbox, canonicalEnvelope({
          identityKey,
          businessEventId: identityKey,
          eventType: entry.eventType,
          aggregateType: entry.aggregateType,
          aggregateId: entry.aggregateId,
          aggregateVersion: entry.version,
          occurredAt: entry.occurredAt,
          recipientId: context.recipientId,
          targetCollection: 'ProductReview',
          targetId: entry.aggregateId,
          displayValues: {},
        }), session);
      }
      return createOne(DomainOutbox, {
        identityKey,
        eventType: entry.eventType,
        payload: {
          aggregateType: entry.aggregateType,
          aggregateId: entry.aggregateId,
          version: entry.version,
          occurredAt: entry.occurredAt,
          idempotencyKey: entry.idempotencyKey,
          ...entry.payload,
        },
      }, session);
    },
  };
}

module.exports = {
  createModelAuditLogger,
  createModelOutboxRepository,
  createModelRepository,
  createModelTransactionManager,
};
