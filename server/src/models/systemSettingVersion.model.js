const mongoose = require('mongoose');

const valuesSchema = new mongoose.Schema({
  PAYMENT_TIMEOUT_MINUTES: { type: Number, required: true, min: 5, max: 60, immutable: true },
  LOW_STOCK_DEFAULT_THRESHOLD: { type: Number, required: true, min: 0, immutable: true },
}, { _id: false, strict: 'throw' });

const systemSettingVersionSchema = new mongoose.Schema({
  version: { type: Number, required: true, min: 1, immutable: true },
  values: { type: valuesSchema, required: true, immutable: true },
  reason: { type: String, required: true, trim: true, maxlength: 300, immutable: true },
  effectiveAt: { type: Date, required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
  requestHash: { type: String, required: true, match: /^[a-f0-9]{64}$/i, immutable: true },
}, { timestamps: true, strict: 'throw' });

systemSettingVersionSchema.index({ version: 1 }, { unique: true });
systemSettingVersionSchema.index({ idempotencyKey: 1 }, { unique: true });
systemSettingVersionSchema.index({ effectiveAt: -1, version: -1 });

module.exports = mongoose.model('SystemSettingVersion', systemSettingVersionSchema);
