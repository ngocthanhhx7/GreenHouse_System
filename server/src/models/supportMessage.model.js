const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportRequest', required: true, immutable: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  actorRole: { type: String, enum: ['Customer', 'Staff', 'System'], required: true, immutable: true },
  content: { type: String, required: true, trim: true, maxlength: 2000, immutable: true },
  commandId: { type: String, required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

supportMessageSchema.index({ ticketId: 1, createdAt: 1, _id: 1 });
supportMessageSchema.index({ ticketId: 1, commandId: 1 }, { unique: true });

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
