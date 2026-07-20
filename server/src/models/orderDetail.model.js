const mongoose = require('mongoose');

const orderDetailSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productNameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    productImageSnapshot: {
      type: String,
      default: '',
      trim: true,
    },
    productSkuSnapshot: {
      type: String,
      default: '',
      trim: true,
    },
    unitSnapshot: {
      type: String,
      default: '',
      trim: true,
    },
    priceSnapshot: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

orderDetailSchema.index({ orderId: 1 });

module.exports = mongoose.model('OrderDetail', orderDetailSchema);
