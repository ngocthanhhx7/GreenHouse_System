const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');

const { serializeAuditFacts } = require('../utils/auditSerializer');

const immutableString = {
  type: String,
  trim: true,
  immutable: true,
};

const auditLogSchema = new mongoose.Schema(
  {
    auditId: {
      ...immutableString,
      required: true,
      unique: true,
      default: randomUUID,
    },
    actorType: {
      ...immutableString,
      required: true,
      enum: ['User', 'System', 'payOS', 'Carrier', 'EmailService'],
      default() {
        return this.userId ? 'User' : 'System';
      },
    },
    actorId: {
      ...immutableString,
      default: null,
    },
    actorRole: {
      ...immutableString,
      default: '',
      maxlength: 80,
    },
    source: {
      ...immutableString,
      required: true,
      default: 'Application',
      maxlength: 120,
    },
    action: {
      ...immutableString,
      required: true,
      maxlength: 160,
    },
    targetType: {
      ...immutableString,
      required: true,
      maxlength: 120,
    },
    targetId: {
      ...immutableString,
      required: true,
      default: 'unknown',
      maxlength: 200,
    },
    outcome: {
      ...immutableString,
      required: true,
      enum: ['Success', 'Denied', 'Failed'],
      default: 'Success',
    },
    correlationId: {
      ...immutableString,
      required: true,
      maxlength: 240,
      default() {
        return this.businessEventId || this.eventId || this.auditId;
      },
    },
    businessEventId: {
      ...immutableString,
      required: true,
      maxlength: 240,
      default() {
        return this.eventId || this.correlationId || this.auditId;
      },
    },
    reasonCode: {
      ...immutableString,
      default: '',
      maxlength: 120,
    },
    reason: {
      ...immutableString,
      default: '',
      maxlength: 1000,
    },
    previousState: {
      ...immutableString,
      default: '',
      maxlength: 120,
    },
    newState: {
      ...immutableString,
      default: '',
      maxlength: 120,
    },
    stateVersion: {
      type: Number,
      default: null,
      min: 0,
      immutable: true,
    },
    safeFacts: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
      set: serializeAuditFacts,
      immutable: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },

    // Deprecated read/query projections retained until SL-001..008 producers migrate.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      immutable: true,
    },
    eventId: {
      ...immutableString,
      default: '',
      maxlength: 240,
    },
    targetEntity: {
      ...immutableString,
      default: '',
      maxlength: 120,
    },
    description: {
      ...immutableString,
      default: '',
      maxlength: 1000,
    },
  },
  {
    timestamps: false,
    strict: 'throw',
  }
);

function mergeLegacyFacts(document, bucket, value) {
  const current = document.safeFacts && typeof document.safeFacts === 'object'
    ? document.safeFacts
    : {};
  document.safeFacts = serializeAuditFacts({ ...current, [bucket]: value });
}

auditLogSchema.virtual('before').set(function setLegacyBefore(value) {
  mergeLegacyFacts(this, 'previous', value);
  this.previousState = String(value?.state || value?.status || value?.role || '');
});
auditLogSchema.virtual('after').set(function setLegacyAfter(value) {
  mergeLegacyFacts(this, 'next', value);
  this.newState = String(value?.state || value?.status || value?.role || '');
  if (Number.isInteger(Number(value?.version))) this.stateVersion = Number(value.version);
});
auditLogSchema.virtual('metadata').set(function setLegacyMetadata(value) {
  mergeLegacyFacts(this, 'metadata', value);
});
auditLogSchema.virtual('version').set(function setLegacyVersion(value) {
  if (Number.isInteger(Number(value))) this.stateVersion = Number(value);
});
auditLogSchema.virtual('occurredAt').set(function setLegacyOccurredAt(value) {
  if (value) this.timestamp = value;
});
auditLogSchema.virtual('actorIdLegacy').set(function setLegacyActorId(value) {
  this.actorId = value == null ? null : String(value);
});
auditLogSchema.virtual('ip').set(() => {});
auditLogSchema.virtual('userAgent').set(() => {});

auditLogSchema.pre('validate', function adaptLegacyFields(next) {
  if (!this.actorId && this.userId) this.actorId = String(this.userId);
  if (!this.userId && this.actorType === 'User' && mongoose.isValidObjectId(this.actorId)) {
    this.userId = this.actorId;
  }
  if (!this.targetType && this.targetEntity) this.targetType = this.targetEntity;
  if (!this.targetEntity && this.targetType) this.targetEntity = this.targetType;
  if (!this.reason && this.description) this.reason = this.description;
  if (!this.description && this.reason) this.description = this.reason;
  if (!this.businessEventId && this.eventId) this.businessEventId = this.eventId;
  if (!this.eventId && this.businessEventId) this.eventId = this.businessEventId;
  if (!this.correlationId) this.correlationId = this.businessEventId || this.auditId;
  if (!this.businessEventId) this.businessEventId = this.correlationId || this.auditId;
  next();
});

auditLogSchema.index({ timestamp: -1, _id: -1 });
auditLogSchema.index({ actorType: 1, actorId: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ actorRole: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ action: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ targetId: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ outcome: 1, timestamp: -1, _id: -1 });
auditLogSchema.index(
  { eventId: 1 },
  {
    unique: true,
    name: 'audit_event_id_unique',
    partialFilterExpression: { eventId: { $type: 'string', $gt: '' } },
  }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
