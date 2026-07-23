const mongoose = require('mongoose');

const exchangeConversionSchema = new mongoose.Schema(
  {
    exchangeCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeCase', required: true, immutable: true },
    returnRefundRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRefundRequest', required: true, immutable: true },
    conversionKey: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
    originalRequestedAt: { type: Date, required: true, immutable: true },
    inventoryMovementKeys: { type: [String], default: [], immutable: true },
    convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    convertedAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { timestamps: true }
);

exchangeConversionSchema.index(
  { exchangeCaseId: 1 },
  { unique: true, name: 'exchange_conversion_once' }
);
exchangeConversionSchema.index(
  { conversionKey: 1 },
  { unique: true, name: 'exchange_conversion_key_unique' }
);
exchangeConversionSchema.index({ returnRefundRequestId: 1 }, { unique: true });

module.exports = mongoose.model('ExchangeConversion', exchangeConversionSchema);
