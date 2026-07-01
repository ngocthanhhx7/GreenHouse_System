const ApiError = require('../utils/apiError');
const Product = require('../models/product.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const ProductReview = require('../models/productReview.model');
const { logAudit } = require('../utils/auditLogger');

function getProductName(product, review) {
  return product ? product.name : review.productName;
}

function toResponse(review, product) {
  return {
    id: String(review._id),
    productId: String(review.productId),
    productName: getProductName(product, review),
    customerId: String(review.customerId),
    orderId: String(review.orderId),
    rating: Number(review.rating),
    content: review.content,
    status: review.status,
    createdAt: review.createdAt,
  };
}

function createModelRepository() {
  return {
    async findProductById(id) {
      return Product.findOne({ _id: id, status: 'Active' }).lean();
    },
    async findOrderById(id) {
      return Order.findById(id).lean();
    },
    async findOrderDetail(orderId, productId) {
      return OrderDetail.findOne({ orderId, productId }).lean();
    },
    async findExistingReview(customerId, orderId, productId) {
      return ProductReview.findOne({ customerId, orderId, productId }).lean();
    },
    async createReview(data) {
      return ProductReview.create(data);
    },
    async listReviews(productId) {
      return ProductReview.find({ productId, status: 'Visible' }).sort({ createdAt: -1 }).lean();
    },
  };
}

function createReviewService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  async function writeAudit(userId, action, targetId, description) {
    await auditLogger.log({
      userId,
      action,
      targetEntity: 'ProductReview',
      targetId: String(targetId),
      description,
    });
  }

  return {
    async listProductReviews(productId) {
      const product = await repository.findProductById(productId);
      if (!product) throw new ApiError(404, 'Product not found');
      const reviews = await repository.listReviews(productId);
      const items = reviews.map((review) => toResponse(review, product));
      return {
        items,
        total: items.length,
        averageRating: items.length ? items.reduce((sum, item) => sum + item.rating, 0) / items.length : 0,
      };
    },

    async createCustomerReview(customerId, productId, input = {}) {
      const rating = Number(input.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError(400, 'Rating must be an integer from 1 to 5');
      if (!String(input.content || '').trim()) throw new ApiError(400, 'Review content is required');
      const product = await repository.findProductById(productId);
      if (!product) throw new ApiError(404, 'Product not found');
      const order = await repository.findOrderById(input.orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      if (order.orderStatus !== 'Delivered') throw new ApiError(409, 'Only delivered orders can be reviewed');
      const detail = await repository.findOrderDetail(order._id, productId);
      if (!detail) throw new ApiError(400, 'Order does not contain this product');
      const existing = await repository.findExistingReview(customerId, order._id, productId);
      if (existing) throw new ApiError(409, 'This product was already reviewed for the selected order');

      const review = await repository.createReview({
        productId,
        customerId,
        orderId: order._id,
        rating,
        content: String(input.content).trim(),
        status: 'Visible',
      });
      await writeAudit(customerId, 'PRODUCT_REVIEW_CREATE', review._id, `Review created for ${product.name}`);
      return toResponse(review, product);
    },
  };
}

module.exports = {
  createReviewService,
  reviewService: createReviewService(),
};
