const mongoose = require('mongoose');

const damageReportSchema = new mongoose.Schema(
  {
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    quantity: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'quantity must be an integer' } },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['PendingWarehouseConfirmation', 'Confirming', 'Confirmed', 'Rejected'], default: 'PendingWarehouseConfirmation' },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

damageReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('DamageReport', damageReportSchema);
