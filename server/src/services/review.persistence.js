const mongoose = require('mongoose');
const AuditLog = require('../models/auditLog.model');
const Category = require('../models/category.model');
const DomainOutbox = require('../models/domainOutbox.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Product = require('../models/product.model');
const ProductReview = require('../models/productReview.model');
const ReviewCommand = require('../models/reviewCommand.model');
const ReviewContentHistory = require('../models/reviewContentHistory.model');
const ReviewModerationHistory = require('../models/reviewModerationHistory.model');
const ReviewPublicationHistory = require('../models/reviewPublicationHistory.model');
const User = require('../models/user.model');

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
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

    async listOwnedDeliveredOrderDetails(customerId, productId, session) {
      const orders = await withOptionalSession(
        Order.find({ customerId, deliveredAt: { $ne: null } })
          .select('_id customerId deliveredAt orderStatus'),
        session,
      ).lean();
      if (orders.length === 0) return [];
      const byId = new Map(orders.map((order) => [String(order._id), order]));
      const details = await withOptionalSession(
        OrderDetail.find({ orderId: { $in: [...byId.keys()] }, productId }),
        session,
      ).lean();
      return details.map((detail) => ({
        ...detail,
        order: byId.get(String(detail.orderId)),
      }));
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

    async listPublicReviews(productId, session) {
      return withOptionalSession(
        ProductReview.find({ productId }),
        session,
      ).lean();
    },

    async listReviews(filter = {}, session) {
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
      return withOptionalSession(ProductReview.find(query), session).lean();
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
    async enqueue(entry, session) {
      return createOne(DomainOutbox, {
        identityKey: [
          entry.aggregateType,
          entry.aggregateId,
          entry.version,
          entry.eventType,
        ].join(':'),
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
