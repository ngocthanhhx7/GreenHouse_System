const mongoose = require('mongoose');

const domainOutboxSchema = new mongoose.Schema({
  identityKey: { type: String, required: true, unique: true, trim: true, immutable: true },
  eventType: { type: String, required: true, trim: true, immutable: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['Pending', 'Processing', 'Completed', 'Failed'], default: 'Pending', index: true },
  attemptCount: { type: Number, default: 0, min: 0 },
  lastError: { type: String, default: '' },
  processingStartedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

domainOutboxSchema.index({ status: 1, processingStartedAt: 1, createdAt: 1 });

module.exports = mongoose.model('DomainOutbox', domainOutboxSchema);
