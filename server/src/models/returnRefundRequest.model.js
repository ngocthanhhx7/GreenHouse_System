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
      // The canonical SL-001 lifecycle is New -> Approved/Rejected/Expired ->
      // Received -> Completed.  The older states remain readable so existing
      // COD reconciliation/demo records can be migrated without silently
      // changing their meaning.
      enum: [
        'New', 'Pending', 'AwaitingCODReconciliation', 'Approved',
        'AwaitingInspection', 'Rejected', 'Expired', 'Received',
        'ReadyForRefund', 'Completed', 'CODRecoveryInProgress', 'ClosedByCODRecovery',
      ],
      default: 'New',
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    holdReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    deadlineAt: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    shipByAt: {
      type: Date,
      default: null,
    },
    handoffProofReference: {
      type: String,
      default: '',
      trim: true,
      maxlength: 256,
    },
    handoffAt: {
      type: Date,
      default: null,
    },
    handoffRecordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    receivedAt: {
      type: Date,
      default: null,
    },
    verifiedDestinationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RefundDestination',
      default: null,
    },
    refundPendingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RefundPending',
      default: null,
    },
    completionEvidenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RefundPayoutEvidence',
      default: null,
    },
    inspectionIdempotencyKey: {
      type: String,
      default: '',
      trim: true,
      maxlength: 160,
    },
    expiredAt: {
      type: Date,
      default: null,
    },
    expiryReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    recoveryRefundId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RefundPending',
      default: null,
    },
    recoveryCompletedAt: {
      type: Date,
      default: null,
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
    completionNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    completionVoidedAt: { type: Date, default: null },
    completionVoidReason: { type: String, default: '', trim: true, maxlength: 1000 },
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
    partialFilterExpression: {
      status: {
        $in: [
          'New', 'Pending', 'AwaitingCODReconciliation', 'Approved',
          'AwaitingInspection', 'Received', 'ReadyForRefund', 'CODRecoveryInProgress',
        ],
      },
    },
    name: 'return_refund_one_open_request_per_order_v2',
  }
);
returnRefundRequestSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('ReturnRefundRequest', returnRefundRequestSchema);
