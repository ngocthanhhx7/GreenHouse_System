const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  eventType: { type: String, required: true, trim: true },
  idempotencyKey: { type: String, required: true, unique: true, trim: true },
  recipient: { type: String, required: true, trim: true, lowercase: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['Pending', 'Processing', 'Sent', 'Failed'], default: 'Pending', index: true },
  attemptCount: { type: Number, default: 0, min: 0 },
  availableAt: { type: Date, default: Date.now, index: true },
  leaseUntil: { type: Date, default: null },
  lastError: { type: String, default: '' },
  sentAt: { type: Date, default: null },
  providerMessageId: { type: String, default: '', trim: true },
  claimId: { type: String, default: '', trim: true, index: true },
}, { timestamps: true });

schema.index({ status: 1, availableAt: 1 });
module.exports = mongoose.model('EmailOutbox', schema);
