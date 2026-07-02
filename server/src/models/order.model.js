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
      enum: ['Pending', 'Paid', 'Failed', 'Cancelled', 'Refunded'],
      default: 'Pending',
    },
    orderStatus: {
      type: String,
      enum: ['Pending', 'WaitingForPayment', 'Confirmed', 'StockExportRequested', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
      default: 'Pending',
    },
    shippingAddress: {
      type: String,
      required: true,
      trim: true,
    },
    receiverName: {
      type: String,
      default: '',
      trim: true,
    },
    receiverPhone: {
      type: String,
      default: '',
      trim: true,
    },
    customerNote: {
      type: String,
      default: '',
      trim: true,
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

module.exports = mongoose.model('Order', orderSchema);
