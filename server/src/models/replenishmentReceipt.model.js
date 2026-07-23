const mongoose = require('mongoose');

const replenishmentReceiptSchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true },
);

replenishmentReceiptSchema.index({ replenishmentRequestId: 1, createdAt: 1 });
replenishmentReceiptSchema.index({ idempotencyKey: 1 }, { unique: true, name: 'replenishment_receipt_idempotency_unique' });

replenishmentReceiptSchema.pre('validate', function validateReceiptTotals(next) {
  if (Number(this.deliveredQuantity) !== Number(this.acceptedSellableQuantity) + Number(this.rejectedQuantity)) {
    this.invalidate('deliveredQuantity', 'deliveredQuantity must equal acceptedSellableQuantity plus rejectedQuantity');
  }
  next();
});

module.exports = mongoose.model('ReplenishmentReceipt', replenishmentReceiptSchema);
