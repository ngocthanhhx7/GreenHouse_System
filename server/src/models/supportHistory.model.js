const mongoose = require('mongoose');

const supportHistorySchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportRequest', required: true, immutable: true },
  kind: { type: String, enum: ['Assignment', 'Priority', 'Resolution'], required: true, immutable: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  actorRole: { type: String, required: true, immutable: true },
  version: { type: Number, required: true, immutable: true },
  beforeAssigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
  afterAssigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
  beforePriority: { type: String, default: null, immutable: true },
  afterPriority: { type: String, default: null, immutable: true },
  beforeStatus: { type: String, default: null, immutable: true },
  afterStatus: { type: String, default: null, immutable: true },
  transition: { type: String, default: null, immutable: true },
  reason: { type: String, default: null, immutable: true },
  resolvedAt: { type: Date, default: null, immutable: true },
  reopenDeadline: { type: Date, default: null, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

supportHistorySchema.index({ ticketId: 1, kind: 1, createdAt: 1, _id: 1 });

module.exports = mongoose.model('SupportHistory', supportHistorySchema);
