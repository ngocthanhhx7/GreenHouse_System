const mongoose = require('mongoose');

const productReviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      immutable: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      immutable: true,
    },
    orderDetailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrderDetail',
      required: true,
      immutable: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'Review rating must be an integer from 1 to 5',
      },
    },
    content: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    publicationStatus: {
      type: String,
      enum: ['Published', 'Withdrawn'],
      default: 'Published',
      required: true,
    },
    moderationStatus: {
      type: String,
      enum: ['Allowed', 'HiddenByStaff'],
      default: 'Allowed',
      required: true,
    },
    moderationReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
    },
    // Retained until the SL-008 migration has mapped every legacy row.
    status: {
      type: String,
      enum: ['Visible', 'Hidden'],
      default: 'Visible',
    },
  },
  {
    timestamps: true,
    // Task 3 owns the preflight/migration that creates the new unique index.
    autoIndex: false,
  }
);

productReviewSchema.index(
  { customerId: 1, productId: 1 },
  { unique: true, name: 'review_customer_product_unique' },
);
productReviewSchema.index(
  {
    productId: 1,
    publicationStatus: 1,
    moderationStatus: 1,
    createdAt: -1,
    _id: -1,
  },
  { name: 'review_public_visibility_page' },
);
productReviewSchema.index(
  { customerId: 1, createdAt: -1, _id: -1 },
  { name: 'review_customer_management_page' },
);

module.exports = mongoose.model('ProductReview', productReviewSchema);
