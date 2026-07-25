const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');

const { normalizeAuditReason, serializeAuditFacts } = require('../utils/auditSerializer');
const { serializeAdminCommandResult } = require('../utils/auditReplay');

const immutableString = {
  type: String,
  trim: true,
  immutable: true,
};

const replayBindingSchema = new mongoose.Schema(
  {
    commandFingerprint: {
      ...immutableString,
      match: /^[a-f0-9]{64}$/i,
      maxlength: 64,
    },
    priorTargetId: {
      ...immutableString,
      maxlength: 200,
      match: /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/,
    },
  },
  {
    _id: false,
    strict: 'throw',
  }
);

const assignmentDetailSchema = new mongoose.Schema(
  {
    entity: { ...immutableString, required: true, maxlength: 120 },
    activeStatuses: [{
      type: String,
      trim: true,
      maxlength: 120,
      immutable: true,
    }],
  },
  { _id: false, strict: 'throw' }
);

const activeAssignmentSchema = new mongoose.Schema(
  {
    sliceId: { ...immutableString, required: true, maxlength: 80 },
    detail: { type: assignmentDetailSchema, default: undefined, immutable: true },
  },
  { _id: false, strict: 'throw' }
);

const recoverySchema = new mongoose.Schema(
  {
    sliceId: { ...immutableString, required: true, maxlength: 80 },
    recovered: { type: Boolean, required: true, immutable: true },
  },
  { _id: false, strict: 'throw' }
);

const adminHandoffSchema = new mongoose.Schema(
  {
    activeAssignments: {
      type: [activeAssignmentSchema],
      default: () => [],
      immutable: true,
    },
    assignmentCheckUnavailable: {
      type: Boolean,
      required: true,
      default: false,
      immutable: true,
    },
    recoveries: {
      type: [recoverySchema],
      default: () => [],
      immutable: true,
    },
  },
  { _id: false, strict: 'throw' }
);

const adminResultUserSchema = new mongoose.Schema(
  {
    id: { ...immutableString, required: true, maxlength: 200 },
    fullName: { ...immutableString, required: true, maxlength: 120 },
    email: { ...immutableString, required: true, maxlength: 254 },
    role: {
      ...immutableString,
      required: true,
      enum: ['Customer', 'Staff', 'WarehouseManager'],
    },
    status: {
      ...immutableString,
      required: true,
      enum: ['Active', 'Disabled'],
    },
    createdAt: { type: Date, default: null, immutable: true },
    lastLoginAt: { type: Date, default: null, immutable: true },
    version: { type: Number, required: true, min: 0, immutable: true },
  },
  { _id: false, strict: 'throw' }
);

const adminCommandResultSchema = new mongoose.Schema(
  {
    user: {
      type: adminResultUserSchema,
      required: true,
      immutable: true,
    },
    revokedSessions: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    handoff: {
      type: adminHandoffSchema,
      default: undefined,
      immutable: true,
    },
  },
  { _id: false, strict: 'throw' }
);

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
      enum: ['Success', 'Denied', 'Failed', 'Unknown'],
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
      maxlength: 500,
      set: normalizeAuditReason,
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
    replayBinding: {
      type: replayBindingSchema,
      default: undefined,
      select: false,
      immutable: true,
    },
    commandResult: {
      type: adminCommandResultSchema,
      default: undefined,
      select: false,
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
      maxlength: 500,
      set: normalizeAuditReason,
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

function mergeReplayBinding(document, value) {
  const current = document.replayBinding?.toObject?.() || document.replayBinding || {};
  document.replayBinding = { ...current, ...value };
}

auditLogSchema.virtual('before').set(function setLegacyBefore(value) {
  mergeLegacyFacts(this, 'previous', value);
  const invitationId = String(value?.invitationId || '');
  if (/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/.test(invitationId)) {
    mergeReplayBinding(this, { priorTargetId: invitationId });
  }
  this.previousState = String(value?.state || value?.status || value?.role || '');
});
auditLogSchema.virtual('after').set(function setLegacyAfter(value) {
  mergeLegacyFacts(this, 'next', value);
  if (/^[a-f0-9]{64}$/i.test(String(value?.commandFingerprint || ''))) {
    mergeReplayBinding(this, { commandFingerprint: String(value.commandFingerprint) });
  }
  const commandResult = serializeAdminCommandResult(value?.result);
  if (commandResult) this.commandResult = commandResult;
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
  this.reason = normalizeAuditReason(this.reason || this.description);
  this.description = normalizeAuditReason(this.reason || this.description);
  this.safeFacts = serializeAuditFacts(this.safeFacts);
  if (this.commandResult) {
    this.commandResult = serializeAdminCommandResult(
      this.commandResult.toObject?.() || this.commandResult
    );
  }
  if (!String(this.targetId || '').trim()) this.targetId = 'unknown';
  if (!this.businessEventId && this.eventId) this.businessEventId = this.eventId;
  if (!this.eventId && this.businessEventId) this.eventId = this.businessEventId;
  if (!this.correlationId) this.correlationId = this.businessEventId || this.auditId;
  if (!this.businessEventId) this.businessEventId = this.correlationId || this.auditId;
  next();
});

auditLogSchema.pre('save', function sanitizeImmediatelyBeforePersistence(next) {
  this.reason = normalizeAuditReason(this.reason || this.description);
  this.description = this.reason;
  this.safeFacts = serializeAuditFacts(this.safeFacts);
  if (this.commandResult) {
    this.commandResult = serializeAdminCommandResult(
      this.commandResult.toObject?.() || this.commandResult
    );
  }
  next();
});

auditLogSchema.index({ timestamp: -1, _id: -1 });
auditLogSchema.index({ actorType: 1, actorId: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ actorType: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ actorRole: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ action: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ targetType: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ targetId: 1, timestamp: -1, _id: -1 });
auditLogSchema.index({ outcome: 1, timestamp: -1, _id: -1 });
auditLogSchema.index(
  { userId: 1, timestamp: -1, _id: -1 },
  {
    name: 'audit_legacy_user_cursor',
    partialFilterExpression: { userId: { $type: 'objectId' } },
  }
);
auditLogSchema.index(
  { timestamp: -1, _id: -1 },
  {
    name: 'audit_legacy_user_order_cursor',
    partialFilterExpression: {
      userId: { $type: 'objectId' },
    },
  }
);
auditLogSchema.index(
  { targetEntity: 1, timestamp: -1, _id: -1 },
  {
    name: 'audit_legacy_target_cursor',
    partialFilterExpression: {
      targetEntity: { $type: 'string', $gt: '' },
    },
  }
);
auditLogSchema.index(
  { eventId: 1 },
  {
    unique: true,
    name: 'audit_event_id_unique',
    partialFilterExpression: { eventId: { $type: 'string', $gt: '' } },
  }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
