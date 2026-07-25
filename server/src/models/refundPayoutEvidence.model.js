const mongoose = require('mongoose');

const refundPayoutEvidenceSchema = new mongoose.Schema(
  {
    returnRefundRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRefundRequest', required: true, immutable: true },
    refundPendingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundPending', required: true, immutable: true },
    destinationId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundDestination', required: true, immutable: true },
    amount: { type: Number, required: true, min: 0, immutable: true },
    currency: { type: String, required: true, trim: true, uppercase: true, immutable: true },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    evidenceKind: {
      type: String,
      enum: ['PAYOUT_EXECUTION', 'OPERATION_RECONCILIATION'],
      default: 'PAYOUT_EXECUTION',
      required: true,
      immutable: true,
    },
    reconcilesOperationKey: { type: String, default: '', trim: true, maxlength: 160, immutable: true },
    method: { type: String, enum: ['PAYOS', 'MANUAL'], required: true, immutable: true },
    providerReference: { type: String, required: true, trim: true, maxlength: 256, immutable: true },
    status: { type: String, enum: ['Processing', 'Succeeded', 'Failed', 'Unknown'], required: true, immutable: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    reconciliationNote: { type: String, default: '', trim: true, maxlength: 1000, immutable: true },
    failureReason: { type: String, default: '', trim: true, maxlength: 500, immutable: true },
    destinationSnapshotHash: { type: String, required: true, trim: true, maxlength: 128, immutable: true },
  },
  { timestamps: true }
);

refundPayoutEvidenceSchema.index({ idempotencyKey: 1 }, { unique: true, name: 'refund_payout_idempotency_unique' });
refundPayoutEvidenceSchema.index({ returnRefundRequestId: 1, createdAt: -1 });
refundPayoutEvidenceSchema.index({ refundPendingId: 1, status: 1, createdAt: -1 });
refundPayoutEvidenceSchema.index(
  { refundPendingId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Succeeded' },
    name: 'refund_payout_one_success_per_obligation',
  }
);

module.exports = mongoose.model('RefundPayoutEvidence', refundPayoutEvidenceSchema);
