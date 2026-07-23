const mongoose = require('mongoose');

const integer = {
  type: Number,
  min: 0,
  validate: { validator: Number.isInteger, message: 'quantity must be an integer' },
};

const exchangeInspectionSchema = new mongoose.Schema(
  {
    inspectionKey: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
    exchangeCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeCase', required: true, immutable: true },
    exchangeLineId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeLine', required: true, immutable: true },
    version: { type: Number, required: true, min: 1, default: 1, immutable: true },
    receivedQuantity: { ...integer, required: true },
    acceptedSellableQuantity: { ...integer, required: true },
    acceptedDamagedQuantity: { ...integer, required: true },
    rejectedQuantity: { ...integer, required: true },
    inspectionReason: { type: String, required: true, trim: true, maxlength: 1000, immutable: true },
    rejectionReason: { type: String, default: '', trim: true, maxlength: 1000, immutable: true },
    evidenceImages: { type: [String], default: [], immutable: true },
    inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    inspectedAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { timestamps: true }
);

exchangeInspectionSchema.index(
  { inspectionKey: 1 },
  { unique: true, name: 'exchange_inspection_key_unique' }
);
exchangeInspectionSchema.index({ exchangeCaseId: 1, exchangeLineId: 1, version: -1 });

module.exports = mongoose.model('ExchangeInspection', exchangeInspectionSchema);
