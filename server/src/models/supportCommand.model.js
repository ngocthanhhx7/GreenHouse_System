const mongoose = require('mongoose');

const supportCommandSchema = new mongoose.Schema({
  actorId: { type: String, required: true, immutable: true },
  aggregateId: { type: String, required: true, immutable: true },
  aggregateType: { type: String, required: true, immutable: true },
  operation: { type: String, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true },
  currentResultId: { type: String, required: true },
  currentResultVersion: { type: Number, required: true },
  result: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

supportCommandSchema.index({ actorId: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model('SupportCommand', supportCommandSchema);
