const mongoose = require('mongoose');

const refundPayoutEvidenceSchema = new mongoose.Schema(
  {
    returnRefundRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRefundRequest', required: true, immutable: true },
    refundPendingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundPending', required: true, immutable: true },
    destinationId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundDestination', required: true, immutable: true },
    amount: { type: Number, required: true, min: 0, immutable: true },
    currency: { type: String, required: true, trim: true, uppercase: true, immutable: true },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    payoutOperationKey: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 160,
      match: /^[A-Za-z0-9._:-]+$/,
      immutable: true,
    },
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

function appendOnlyError(operation) {
  const error = new Error(`Refund payout evidence is append-only; ${operation} is forbidden`);
  error.code = 'REFUND_PAYOUT_EVIDENCE_APPEND_ONLY';
  return error;
}

function assertInsertOnlyBulk(operations) {
  const mutation = (operations || []).find((operation) => !operation.insertOne);
  if (mutation) throw appendOnlyError(`bulkWrite.${Object.keys(mutation)[0] || 'mutation'}`);
}

refundPayoutEvidenceSchema.pre('validate', function validateOperationBinding() {
  const reconcilesOperationKey = String(this.reconcilesOperationKey || '').trim();
  const validOperationKey = /^[A-Za-z0-9._:-]{8,160}$/;
  if (this.evidenceKind === 'PAYOUT_EXECUTION' && reconcilesOperationKey) {
    throw new Error('Payout execution evidence forbids reconcilesOperationKey');
  }
  if (this.evidenceKind === 'OPERATION_RECONCILIATION' && !validOperationKey.test(reconcilesOperationKey)) {
    throw new Error('Operation reconciliation evidence requires a valid operation key');
  }
  if (this.evidenceKind === 'OPERATION_RECONCILIATION'
    && reconcilesOperationKey !== String(this.payoutOperationKey || '').trim()) {
    throw new Error('Operation reconciliation evidence must bind to the same payout operation key');
  }
});

refundPayoutEvidenceSchema.pre('save', function rejectPersistedSave() {
  if (!this.isNew) throw appendOnlyError('save');
});

refundPayoutEvidenceSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'findOneAndDelete'],
  function rejectQueryMutation() {
    throw appendOnlyError(this.op);
  }
);
refundPayoutEvidenceSchema.pre('deleteOne', { document: true, query: true }, function rejectDeleteOne() {
  throw appendOnlyError('deleteOne');
});
refundPayoutEvidenceSchema.pre('deleteMany', function rejectDeleteMany() {
  throw appendOnlyError('deleteMany');
});
refundPayoutEvidenceSchema.pre('bulkWrite', function rejectBulkMutation(next, operations) {
  try {
    assertInsertOnlyBulk(operations);
    next();
  } catch (error) {
    next(error);
  }
});

refundPayoutEvidenceSchema.index({ idempotencyKey: 1 }, { unique: true, name: 'refund_payout_idempotency_unique' });
refundPayoutEvidenceSchema.index({ returnRefundRequestId: 1, createdAt: -1 });
refundPayoutEvidenceSchema.index({ refundPendingId: 1, status: 1, createdAt: -1 });
refundPayoutEvidenceSchema.index(
  { refundPendingId: 1, payoutOperationKey: 1, createdAt: -1 },
  { name: 'refund_payout_by_obligation_operation' }
);
refundPayoutEvidenceSchema.index(
  { refundPendingId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Succeeded' },
    name: 'refund_payout_one_success_per_obligation',
  }
);

const RefundPayoutEvidence = mongoose.model('RefundPayoutEvidence', refundPayoutEvidenceSchema);

module.exports = RefundPayoutEvidence;
module.exports.assertInsertOnlyBulk = assertInsertOnlyBulk;
