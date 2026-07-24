const mongoose = require('mongoose');

// A narrow hand-off record: Nhat's return/refund workflow owns the later decision and execution.
const refundPendingSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    paymentAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    returnRefundRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRefundRequest', default: null },
    amount: { type: Number, required: true, min: 0 },
    obligationType: {
      type: String,
      enum: ['PAYMENT_REVERSAL', 'NORMAL_RETURN', 'COD_RECOVERY', 'EXCESS_PAYMENT', 'FAILED_DELIVERY', 'LEGACY'],
      default: 'PAYMENT_REVERSAL',
    },
    obligationKey: { type: String, default: '', trim: true, maxlength: 200 },
    sourceCollectionEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodEvidence', default: null },
    currency: { type: String, default: 'VND', trim: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['RefundPending', 'HandedOff', 'Refunded'], default: 'RefundPending' },
    payoutStatus: { type: String, enum: ['NotStarted', 'Processing', 'Succeeded', 'Failed', 'Unknown'], default: 'NotStarted' },
    destinationId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundDestination', default: null },
    payoutEvidenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundPayoutEvidence', default: null },
    payoutOperationKey: { type: String, default: '', trim: true, maxlength: 160 },
    payoutProviderReference: { type: String, default: '', trim: true, maxlength: 256 },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

refundPendingSchema.index({ status: 1, createdAt: 1 });
refundPendingSchema.index({ orderId: 1, obligationType: 1 }, { name: 'refund_pending_obligations_by_order_type' });
refundPendingSchema.index({ returnRefundRequestId: 1, obligationType: 1 }, { name: 'refund_pending_by_return_request_type' });
refundPendingSchema.index(
  { obligationKey: 1 },
  { unique: true, partialFilterExpression: { obligationKey: { $type: 'string', $gt: '' } }, name: 'refund_pending_obligation_key' }
);

module.exports = mongoose.model('RefundPending', refundPendingSchema);
