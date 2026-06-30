const mongoose = require('mongoose');

const returnRefundRequestSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    staffNote: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

returnRefundRequestSchema.index({ customerId: 1, createdAt: -1 });
returnRefundRequestSchema.index({ status: 1, createdAt: -1 });
returnRefundRequestSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('ReturnRefundRequest', returnRefundRequestSchema);
