const mongoose = require('mongoose');

const productReviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Visible', 'Hidden'],
      default: 'Visible',
    },
  },
  { timestamps: true }
);

productReviewSchema.index({ productId: 1, createdAt: -1 });
productReviewSchema.index({ customerId: 1, orderId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('ProductReview', productReviewSchema);
