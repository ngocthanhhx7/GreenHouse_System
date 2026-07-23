const mongoose = require('mongoose');

const refundPayoutIncidentSchema = new mongoose.Schema(
  {
    returnRefundRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRefundRequest', required: true, immutable: true },
    refundPendingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundPending', required: true, immutable: true },
    payoutEvidenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundPayoutEvidence', required: true, immutable: true },
    destinationId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundDestination', required: true, immutable: true },
    incidentKey: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    cause: {
      type: String,
      enum: ['CUSTOMER_CONFIRMED_DESTINATION', 'STAFF_SYSTEM_PROVIDER_MISMATCH'],
      required: true,
      immutable: true,
    },
    responsibility: { type: String, enum: ['Customer', 'ShopOrProvider'], required: true, immutable: true },
    status: { type: String, enum: ['Open', 'Resolved'], default: 'Open' },
    reportReason: { type: String, required: true, trim: true, maxlength: 1000, immutable: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    openedAt: { type: Date, required: true, immutable: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: '', trim: true, maxlength: 1000 },
    resolutionEvidenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundPayoutEvidence', default: null },
  },
  { timestamps: true }
);

refundPayoutIncidentSchema.index({ incidentKey: 1 }, { unique: true, name: 'refund_payout_incident_key' });
refundPayoutIncidentSchema.index(
  { payoutEvidenceId: 1, cause: 1 },
  { unique: true, name: 'refund_payout_incident_evidence_cause' }
);
refundPayoutIncidentSchema.index({ returnRefundRequestId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RefundPayoutIncident', refundPayoutIncidentSchema);
