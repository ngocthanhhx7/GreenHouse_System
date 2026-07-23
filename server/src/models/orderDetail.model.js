const mongoose = require('mongoose');

const orderDetailSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      immutable: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      immutable: true,
    },
    productNameSnapshot: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    productImageSnapshot: {
      type: String,
      default: '',
      trim: true,
      immutable: true,
    },
    productSkuSnapshot: {
      type: String,
      default: '',
      trim: true,
      immutable: true,
    },
    unitSnapshot: {
      type: String,
      default: '',
      trim: true,
      immutable: true,
    },
    priceSnapshot: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    priceVersionSnapshot: {
      type: String,
      default: '',
      trim: true,
      maxlength: 128,
      immutable: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
  },
  { timestamps: true }
);

orderDetailSchema.index({ orderId: 1 });

module.exports = mongoose.model('OrderDetail', orderDetailSchema);
