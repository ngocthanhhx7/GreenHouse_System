const mongoose = require('mongoose');

const damageReportSchema = new mongoose.Schema(
  {
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    quantity: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'quantity must be an integer' } },
    reportedQuantity: { type: Number, min: 1, validate: { validator: Number.isInteger, message: 'reportedQuantity must be a positive integer' } },
    confirmedQuantity: { type: Number, min: 0, default: null, validate: { validator: (value) => value === null || Number.isInteger(value), message: 'confirmedQuantity must be an integer' } },
    reason: { type: String, required: true, trim: true },
    decisionReason: { type: String, default: '', trim: true },
    evidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    decisionEvidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    idempotencyKey: { type: String, default: '', trim: true, maxlength: 240 },
    withdrawnBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    withdrawnAt: { type: Date, default: null },
    withdrawalReason: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: [
        'PendingWarehouseConfirmation', 'PendingReview', 'Confirming', 'Confirmed',
        'PartiallyConfirmed', 'Rejected', 'Withdrawn',
      ],
      default: 'PendingReview',
    },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

damageReportSchema.index({ status: 1, createdAt: -1 });
damageReportSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } }, name: 'damage_report_idempotency_unique' });
damageReportSchema.index({ inventoryId: 1, status: 1, createdAt: -1 });

damageReportSchema.pre('validate', function normalizeDamageFields(next) {
  if (this.reportedQuantity === undefined || this.reportedQuantity === null) this.reportedQuantity = this.quantity;
  if (this.quantity === undefined || this.quantity === null) this.quantity = this.reportedQuantity;
  if (this.status === 'PendingWarehouseConfirmation') this.status = 'PendingReview';
  next();
});

module.exports = mongoose.model('DamageReport', damageReportSchema);
