const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    idempotencyKey: {
      type: String,
      default: '',
      trim: true,
      maxlength: 128,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'VND',
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ['COD', 'ONLINE'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Pending', 'Paid', 'Failed', 'Cancelled', 'RefundPending', 'Refunded'],
      default: 'Pending',
    },
    orderStatus: {
      type: String,
      enum: ['Pending', 'WaitingForPayment', 'Confirmed', 'StockExportRequested', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Expired', 'Returned'],
      default: 'Pending',
    },
    shippingAddress: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    receiverName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    receiverPhone: {
      type: String,
      default: '',
      trim: true,
      maxlength: 20,
    },
    customerNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    cancelReason: {
      type: String,
      default: '',
      trim: true,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    packedAt: {
      type: Date,
      default: null,
    },
    shippedAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, paymentStatus: 1 });
orderSchema.index(
  { customerId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } },
    name: 'order_checkout_idempotency_key',
  }
);

module.exports = mongoose.model('Order', orderSchema);
