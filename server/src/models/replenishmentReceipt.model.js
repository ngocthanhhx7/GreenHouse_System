const mongoose = require('mongoose');

const replenishmentReceiptSchema = new mongoose.Schema(
  {
    recordType: {
      type: String,
      enum: ['Receipt', 'Correction'],
      default: 'Receipt',
      required: true,
      immutable: true,
    },
    replenishmentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReplenishmentRequest', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    supplierReference: { type: String, required: true, trim: true },
    deliveryReference: { type: String, required: true, trim: true },
    deliveredQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: [
        { validator: Number.isInteger, message: 'deliveredQuantity must be a non-negative integer' },
        {
          validator(value) {
            return Number(value) === Number(this.acceptedSellableQuantity || 0) + Number(this.rejectedQuantity || 0);
          },
          message: 'deliveredQuantity must equal acceptedSellableQuantity plus rejectedQuantity',
        },
      ],
    },
    acceptedSellableQuantity: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'acceptedSellableQuantity must be a non-negative integer' } },
    rejectedQuantity: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'rejectedQuantity must be a non-negative integer' } },
    rejectedReason: { type: String, default: '', trim: true },
    evidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    inspectedAt: { type: Date, default: Date.now },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 240 },
    correctionOf: { type: mongoose.Schema.Types.ObjectId, ref: 'ReplenishmentReceipt', default: null },
    acceptedQuantityCorrection: {
      type: Number,
      default: 0,
      validate: { validator: Number.isInteger, message: 'acceptedQuantityCorrection must be an integer' },
    },
    reason: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

replenishmentReceiptSchema.index({ replenishmentRequestId: 1, createdAt: 1 });
replenishmentReceiptSchema.index({ idempotencyKey: 1 }, { unique: true, name: 'replenishment_receipt_idempotency_unique' });

replenishmentReceiptSchema.pre('validate', function validateReceiptTotals(next) {
  if (Number(this.deliveredQuantity) !== Number(this.acceptedSellableQuantity) + Number(this.rejectedQuantity)) {
    this.invalidate('deliveredQuantity', 'deliveredQuantity must equal acceptedSellableQuantity plus rejectedQuantity');
  }
  if (this.recordType === 'Correction') {
    if (!this.correctionOf) this.invalidate('correctionOf', 'Correction must reference the original receipt');
    if (!Number.isInteger(this.acceptedQuantityCorrection) || this.acceptedQuantityCorrection === 0) {
      this.invalidate('acceptedQuantityCorrection', 'Correction quantity must be a non-zero integer');
    }
    if (!String(this.reason || '').trim()) this.invalidate('reason', 'Correction reason is required');
    if (!Array.isArray(this.evidence) || this.evidence.length === 0) {
      this.invalidate('evidence', 'Correction evidence is required');
    }
  } else if (Number(this.acceptedQuantityCorrection || 0) !== 0) {
    this.invalidate('acceptedQuantityCorrection', 'Receipt correction quantity must be zero');
  }
  next();
});

module.exports = mongoose.model('ReplenishmentReceipt', replenishmentReceiptSchema);
