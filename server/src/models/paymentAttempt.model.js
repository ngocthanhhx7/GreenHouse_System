const mongoose = require('mongoose');

const paymentAttemptSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    attemptCode: { type: String, required: true, unique: true, trim: true, immutable: true },
    paymentMethod: { type: String, enum: ['COD', 'ONLINE'], required: true, immutable: true },
    paymentProvider: { type: String, default: '', trim: true, immutable: true },
    providerOrderCode: { type: Number, default: null, immutable: true },
    paymentLinkId: { type: String, default: '', trim: true },
    checkoutUrl: { type: String, default: '', trim: true },
    qrCode: { type: String, default: '', trim: true },
    expiresAt: { type: Date, default: null },
    amount: { type: Number, required: true, min: 0, immutable: true },
    currency: { type: String, default: 'VND', trim: true, immutable: true },
    paymentStatus: {
      type: String,
      // Refund obligations are represented by RefundPending, never by a
      // mutable payment-attempt state.  An attempt only records provider
      // settlement evidence and its own lifecycle.
      enum: ['Unpaid', 'Pending', 'Paid', 'Failed', 'Cancelled', 'Expired'],
      required: true,
    },
    transactionId: { type: String, default: '', trim: true },
    providerMessageId: { type: String, default: '', trim: true },
    gatewayResponseCode: { type: String, default: '', trim: true },
    gatewayMessage: { type: String, default: '', trim: true },
    paidAt: { type: Date, default: null },
    rawResponse: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

paymentAttemptSchema.index({ orderId: 1, createdAt: -1 });
paymentAttemptSchema.index({ paymentProvider: 1, providerMessageId: 1 });
paymentAttemptSchema.index(
  { paymentProvider: 1, providerOrderCode: 1 },
  {
    unique: true,
    partialFilterExpression: { providerOrderCode: { $type: 'number' } },
    name: 'payment_attempt_provider_order_code',
  }
);
paymentAttemptSchema.index(
  { orderId: 1, paymentProvider: 1, paymentStatus: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentProvider: 'PAYOS', paymentStatus: 'Pending' },
    name: 'payment_attempt_one_pending_payos_link',
  }
);

module.exports = mongoose.model('PaymentAttempt', paymentAttemptSchema);
