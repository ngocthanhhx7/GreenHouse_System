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
    checkoutRequestHash: {
      type: String,
      default: '',
      trim: true,
    },
    cancelIdempotencyKey: {
      type: String,
      default: '',
      trim: true,
    },
    cancelRequestHash: {
      type: String,
      default: '',
      trim: true,
    },
    staffConfirmIdempotencyKey: {
      type: String,
      default: '',
      trim: true,
      maxlength: 128,
      immutable: true,
    },
    staffConfirmRequestHash: {
      type: String,
      default: '',
      trim: true,
      maxlength: 128,
      immutable: true,
    },
    staffCancelIdempotencyKey: {
      type: String,
      default: '',
      trim: true,
      maxlength: 128,
    },
    staffCancelRequestHash: {
      type: String,
      default: '',
      trim: true,
      maxlength: 128,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    // Server-derived once at checkout. Clients and Staff never choose a COD amount.
    codExpectedAmount: { type: Number, min: 0, default: null, immutable: true },
    customerCollectedAmount: { type: Number, min: 0, default: 0 },
    customerCollectedAt: { type: Date, default: null },
    customerCollectionEvidenceId: { type: String, default: '', trim: true, maxlength: 160 },
    carrierSettlementAmount: { type: Number, min: 0, default: 0 },
    carrierSettledAt: { type: Date, default: null },
    carrierSettlementEvidenceId: { type: String, default: '', trim: true, maxlength: 160 },
    codDiscrepancyStatus: { type: String, enum: ['None', 'Open', 'Resolved', 'RecoveryInProgress', 'Closed'], default: 'None' },
    codDiscrepancyOpenedAt: { type: Date, default: null },
    codRecoveryReceiptId: { type: String, default: '', trim: true, maxlength: 160 },
    codRecoveryReceivedAt: { type: Date, default: null },
    settlementReconciliationStatus: { type: String, enum: ['NotApplicable', 'Open', 'Settled'], default: 'NotApplicable' },
    completedSaleAt: { type: Date, default: null },
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
      enum: ['Unpaid', 'Pending', 'Paid', 'Failed', 'Cancelled'],
      default: 'Pending',
    },
    moneyObligationsSettled: {
      type: Boolean,
      default: true,
    },
    paymentDeadlineAt: {
      type: Date,
      default: null,
      immutable: true,
    },
    paymentTimeoutMinutesSnapshot: {
      type: Number,
      default: null,
      min: 5,
      max: 60,
      immutable: true,
    },
    paymentTimeoutSettingVersion: {
      type: Number,
      default: null,
      min: 0,
      immutable: true,
    },
    orderStatus: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'DeliveryFailed', 'Cancelled', 'Returned'],
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
    returnDeadlineAt: { type: Date, default: null },
    exchangeDeadlineAt: { type: Date, default: null },
    deliveryResolutionCommandKey: {
      type: String,
      default: '',
      trim: true,
      maxlength: 160,
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
