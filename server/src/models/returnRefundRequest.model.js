const mongoose = require('mongoose');

const returnRefundRequestSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    requestCode: {
      type: String,
      default: '',
      trim: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    evidenceImages: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['Pending', 'AwaitingInspection', 'Rejected', 'ReadyForRefund', 'Completed'],
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
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    handledAt: {
      type: Date,
      default: null,
    },
    staffNote: {
      type: String,
      default: '',
      trim: true,
    },
    inspectionNote: {
      type: String,
      default: '',
      trim: true,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

returnRefundRequestSchema.index({ customerId: 1, createdAt: -1 });
returnRefundRequestSchema.index({ status: 1, createdAt: -1 });
returnRefundRequestSchema.index(
  { requestCode: 1 },
  { unique: true, partialFilterExpression: { requestCode: { $type: 'string', $gt: '' } } }
);
returnRefundRequestSchema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['Pending', 'AwaitingInspection', 'ReadyForRefund'] } },
  }
);
returnRefundRequestSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('ReturnRefundRequest', returnRefundRequestSchema);
