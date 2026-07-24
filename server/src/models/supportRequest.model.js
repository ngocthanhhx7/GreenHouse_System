const mongoose = require('mongoose');

const supportRequestSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ticketCode: { type: String, required: true, unique: true, trim: true },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    requestType: {
      type: String,
      enum: ['Order', 'Product', 'Payment', 'ReturnRefund', 'Exchange', 'Account', 'Other'],
      default: 'Order',
    },
    type: {
      type: String,
      enum: ['Order', 'Product', 'Payment', 'ReturnRefund', 'Exchange', 'Account', 'Other'],
      default: 'Order',
    },
    priority: {
      type: String,
      enum: ['Low', 'Normal', 'High', 'Urgent'],
      default: 'Normal',
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    version: { type: Number, required: true, default: 1, min: 1 },
    status: { type: String, enum: ['New', 'InProgress', 'Resolved', 'Withdrawn'], default: 'New' },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    response: {
      type: String,
      default: '',
      trim: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    reopenDeadlineAt: { type: Date, default: null },
  },
  { timestamps: true }
);

supportRequestSchema.index({ customerId: 1, createdAt: -1 });
supportRequestSchema.index({ status: 1, createdAt: -1 });
supportRequestSchema.index({ assigneeId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('SupportRequest', supportRequestSchema);
