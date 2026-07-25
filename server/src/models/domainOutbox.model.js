const mongoose = require('mongoose');
const {
  TARGET_COLLECTIONS,
  normalizeNotificationType,
  sanitizeDisplayValues,
} = require('../utils/notificationContract');

const CANONICAL_PAYLOAD_KEYS = new Set([
  'businessEventId',
  'type',
  'recipient',
  'recipientRole',
  'recipientId',
  'recipientEmail',
  'userId',
  'target',
  'targetCollection',
  'targetId',
  'displayValues',
]);

function boundedText(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function sanitizeRecipient(recipient) {
  if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient)) {
    throw new Error('Canonical DomainOutbox recipient must be an object');
  }
  const unknown = Object.keys(recipient).filter((key) => !['userId', 'email', 'role'].includes(key));
  if (unknown.length) throw new Error(`Canonical DomainOutbox recipient field is not allowed: ${unknown[0]}`);
  return {
    userId: boundedText(recipient.userId, 200),
    email: boundedText(recipient.email, 254).toLowerCase(),
    role: boundedText(recipient.role, 80),
  };
}

function sanitizeTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new Error('Canonical DomainOutbox target must be an object');
  }
  const unknown = Object.keys(target).filter((key) => !['collection', 'id'].includes(key));
  if (unknown.length) throw new Error(`Canonical DomainOutbox target field is not allowed: ${unknown[0]}`);
  const collection = boundedText(target.collection, 120);
  const id = boundedText(target.id, 200);
  if (!TARGET_COLLECTIONS.includes(collection)) {
    throw new Error('Canonical DomainOutbox target collection is not allowed');
  }
  return { collection, id };
}

function sanitizeCanonicalPayload(eventType, value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const unknown = Object.keys(source).filter((key) => !CANONICAL_PAYLOAD_KEYS.has(key));
  if (unknown.length) {
    throw new Error(`Canonical DomainOutbox payload field is not allowed: ${unknown[0]}`);
  }
  const type = normalizeNotificationType(source.type || eventType);
  if (type !== normalizeNotificationType(eventType)) {
    throw new Error('Canonical DomainOutbox event type does not match payload type');
  }
  const payload = {
    businessEventId: boundedText(source.businessEventId, 240),
    type,
    displayValues: sanitizeDisplayValues(type, source.displayValues, { rejectUnknown: true }),
  };
  if (source.recipient) payload.recipient = sanitizeRecipient(source.recipient);
  for (const [key, maxLength] of [
    ['recipientRole', 80],
    ['recipientId', 200],
    ['recipientEmail', 254],
    ['userId', 200],
    ['targetCollection', 120],
    ['targetId', 200],
  ]) {
    if (Object.hasOwn(source, key)) payload[key] = boundedText(source[key], maxLength);
  }
  if (source.recipientEmail) payload.recipientEmail = payload.recipientEmail.toLowerCase();
  if (source.target) payload.target = sanitizeTarget(source.target);
  if (payload.targetCollection && !TARGET_COLLECTIONS.includes(payload.targetCollection)) {
    throw new Error('Canonical DomainOutbox target collection is not allowed');
  }
  return payload;
}

function canonicalPayloadSetter(value) {
  if (Number(this.payloadSchemaVersion || 0) !== 1) return value;
  try {
    return sanitizeCanonicalPayload(this.eventType, value);
  } catch (error) {
    return {
      __invalidCanonicalPayload: true,
      errorCode: 'DOMAIN_OUTBOX_PAYLOAD_INVALID',
    };
  }
}

const domainOutboxSchema = new mongoose.Schema({
  identityKey: { type: String, required: true, unique: true, trim: true, immutable: true },
  businessEventId: {
    type: String,
    trim: true,
    immutable: true,
    maxlength: 240,
    required() { return Number(this.payloadSchemaVersion || 0) === 1; },
  },
  eventType: { type: String, required: true, trim: true, immutable: true },
  aggregateType: {
    type: String,
    trim: true,
    immutable: true,
    maxlength: 120,
    required() { return Number(this.payloadSchemaVersion || 0) === 1; },
  },
  aggregateId: {
    type: String,
    trim: true,
    immutable: true,
    maxlength: 200,
    required() { return Number(this.payloadSchemaVersion || 0) === 1; },
  },
  aggregateVersion: { type: Number, min: 0, default: null, immutable: true },
  occurredAt: {
    type: Date,
    immutable: true,
    required() { return Number(this.payloadSchemaVersion || 0) === 1; },
  },
  payloadSchemaVersion: { type: Number, enum: [1], default: undefined, immutable: true },
  eventHash: {
    type: String,
    trim: true,
    immutable: true,
    match: /^[a-f0-9]{64}$/i,
    required() { return Number(this.payloadSchemaVersion || 0) === 1; },
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    immutable: true,
    set: canonicalPayloadSetter,
    validate: {
      validator(value) {
        return !value?.__invalidCanonicalPayload;
      },
      message: 'Canonical DomainOutbox payload is invalid',
      type: 'domainOutboxPayload',
    },
  },
  status: { type: String, enum: ['Pending', 'Processing', 'Completed', 'Failed'], default: 'Pending', index: true },
  attemptCount: { type: Number, default: 0, min: 0 },
  lastError: { type: String, default: '' },
  processingStartedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

domainOutboxSchema.index({ status: 1, processingStartedAt: 1, createdAt: 1 });
domainOutboxSchema.index({ businessEventId: 1, eventType: 1 });

module.exports = mongoose.model('DomainOutbox', domainOutboxSchema);
