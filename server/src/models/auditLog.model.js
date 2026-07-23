const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    eventId: {
      type: String,
      default: '',
      trim: true,
      immutable: true,
    },
    targetEntity: {
      type: String,
      required: true,
      trim: true,
    },
    targetId: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ip: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  { timestamps: false }
);

auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index(
  { eventId: 1 },
  {
    unique: true,
    name: 'audit_event_id_unique',
    partialFilterExpression: { eventId: { $type: 'string', $gt: '' } },
  }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
