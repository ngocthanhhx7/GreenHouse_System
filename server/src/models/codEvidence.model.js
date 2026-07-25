const mongoose = require('mongoose');

// Append-only evidence supplied by either the optional Carrier integration or
// authorized Staff manual reconciliation. Collection money and Carrier
// remittance are deliberately different event types and projections.
const codEvidenceSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    eventId: { type: String, required: true, trim: true, maxlength: 160 },
    eventType: { type: String, enum: ['COLLECTION', 'SETTLEMENT'], required: true },
    source: { type: String, enum: ['CARRIER', 'STAFF_EVIDENCE', 'STAFF_RECONCILIATION'], default: 'CARRIER', required: true },
    customerCollectedAmount: {
      type: Number,
      min: 0,
      default: null,
      required() { return this.eventType === 'COLLECTION'; },
    },
    carrierSettlementAmount: {
      type: Number,
      min: 0,
      default: null,
      required() { return this.eventType === 'SETTLEMENT'; },
    },
    collectionTiming: { type: String, enum: ['AT_DELIVERY', 'AFTER_DELIVERY', null], default: null },
    occurredAt: { type: Date, required: true },
    evidenceReference: { type: String, required: true, trim: true, maxlength: 256 },
    providerMessageId: { type: String, default: '', trim: true, maxlength: 160 },
  },
  { timestamps: true, strict: true }
);

codEvidenceSchema.index({ orderId: 1, eventType: 1, occurredAt: 1 });
codEvidenceSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { eventType: 'COLLECTION' }, name: 'cod_evidence_one_collection_per_order' }
);
codEvidenceSchema.index({ eventId: 1 }, { unique: true, name: 'cod_evidence_event_id' });

module.exports = mongoose.model('CodEvidence', codEvidenceSchema);
