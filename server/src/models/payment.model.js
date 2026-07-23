const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      immutable: true,
    },
    transactionId: {
      type: String,
      default: '',
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ['COD', 'ONLINE'],
      required: true,
      immutable: true,
    },
    paymentProvider: {
      type: String,
      default: '',
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    currency: {
      type: String,
      default: 'VND',
      trim: true,
      immutable: true,
    },
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Pending', 'Paid', 'Failed', 'Cancelled'],
      default: 'Pending',
    },
    paidAt: {
      type: Date,
      default: null,
    },
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    gatewayResponseCode: {
      type: String,
      default: '',
      trim: true,
    },
    gatewayMessage: {
      type: String,
      default: '',
      trim: true,
    },
    providerMessageId: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ orderId: 1 });
paymentSchema.index({ transactionId: 1 }, { sparse: true });

module.exports = mongoose.model('Payment', paymentSchema);
