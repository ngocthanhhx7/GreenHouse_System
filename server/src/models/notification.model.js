const mongoose = require('mongoose');

const {
  NOTIFICATION_TYPES,
  TARGET_COLLECTIONS,
  normalizeNotificationType,
  sanitizeDisplayValues,
} = require('../utils/notificationContract');

const SAFE_FACTS_MUTATION_ERROR = 'NOTIFICATION_SAFE_FACTS_IMMUTABLE';
const IMMUTABLE_PATHS = new Set([
  'businessEventId', 'recipientIdentity', 'userId', 'type', 'templateKey',
  'displayValues', 'channel', 'targetCollection', 'targetId',
]);
const LIFECYCLE_PATHS = new Set(['state', 'readAt', 'archivedAt']);

function safeFactsMutationError(operation) {
  const error = new Error(`Notification safe facts cannot be changed by ${operation}`);
  error.code = SAFE_FACTS_MUTATION_ERROR;
  return error;
}

function isImmutablePath(path) {
  return [...IMMUTABLE_PATHS].some((root) => path === root || path.startsWith(`${root}.`));
}

function updateTouchesImmutableFacts(update, { allowSetOnInsert = false } = {}) {
  if (Array.isArray(update)) return true;
  if (!update || typeof update !== 'object') return false;
  return Object.entries(update).some(([operatorOrPath, operand]) => {
    if (allowSetOnInsert && operatorOrPath === '$setOnInsert') return false;
    if (isImmutablePath(operatorOrPath)) return true;
    if (!operatorOrPath.startsWith('$') || !operand || typeof operand !== 'object') return false;
    return Object.keys(operand).some(isImmutablePath)
      || (operatorOrPath === '$rename' && Object.values(operand).some(isImmutablePath));
  });
}

function lifecycleMutationError() {
  const error = new Error('Notification lifecycle transition is invalid');
  error.code = 'NOTIFICATION_LIFECYCLE_INVALID';
  return error;
}

function isLifecyclePath(path) {
  return [...LIFECYCLE_PATHS].some((root) => path === root || path.startsWith(`${root}.`));
}

function lifecycleMutationEntries(update = {}) {
  if (Array.isArray(update)) return [{ operator: '$pipeline', path: 'state', value: null }];
  if (!update || typeof update !== 'object') return [];
  const entries = [];
  for (const [operatorOrPath, operand] of Object.entries(update)) {
    if (!operatorOrPath.startsWith('$')) {
      if (isLifecyclePath(operatorOrPath)) entries.push({ operator: '$direct', path: operatorOrPath, value: operand });
      continue;
    }
    if (!operand || typeof operand !== 'object') continue;
    for (const [path, value] of Object.entries(operand)) {
      if (isLifecyclePath(path)) entries.push({ operator: operatorOrPath, path, value });
      if (operatorOrPath === '$rename' && isLifecyclePath(value)) {
        entries.push({ operator: operatorOrPath, path: value, value: path });
      }
    }
  }
  return entries;
}

function validInitialLifecycle(values = {}) {
  const state = values.state;
  const readAt = values.readAt;
  const archivedAt = values.archivedAt;
  if (state === 'Unread' || state === 'NotApplicable') return !readAt && !archivedAt;
  if (state === 'Read') return readAt instanceof Date && !archivedAt;
  if (state === 'Archived') return readAt instanceof Date && archivedAt instanceof Date;
  return false;
}

function assertLifecycleUpdate(filter = {}, update = {}, { allowSetOnInsert = false } = {}) {
  const entries = lifecycleMutationEntries(update);
  if (entries.length === 0) return;
  if (allowSetOnInsert && entries.every((entry) => entry.operator === '$setOnInsert')) {
    if (validInitialLifecycle(update.$setOnInsert)) return;
    throw lifecycleMutationError();
  }
  if (entries.some((entry) => entry.operator !== '$set')) throw lifecycleMutationError();

  const lifecycleSet = Object.fromEntries(entries.map(({ path, value }) => [path, value]));
  const paths = Object.keys(lifecycleSet).sort();
  if (lifecycleSet.state === 'Read'
    && filter.state === 'Unread'
    && lifecycleSet.readAt instanceof Date
    && paths.join(',') === 'readAt,state') return;
  if (lifecycleSet.state === 'Archived'
    && filter.state === 'Read'
    && lifecycleSet.archivedAt instanceof Date
    && paths.join(',') === 'archivedAt,state') return;
  throw lifecycleMutationError();
}

const notificationSchema = new mongoose.Schema({
  businessEventId: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
  recipientIdentity: { type: String, required: true, trim: true, maxlength: 320, immutable: true },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    immutable: true,
    required() { return this.channel === 'InApp'; },
  },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true, immutable: true },
  templateKey: { type: String, enum: NOTIFICATION_TYPES, required: true, immutable: true },
  displayValues: { type: mongoose.Schema.Types.Mixed, default: () => ({}), immutable: true },
  channel: { type: String, enum: ['Email', 'InApp'], required: true, immutable: true },
  targetCollection: { type: String, enum: TARGET_COLLECTIONS, default: '', immutable: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
  state: {
    type: String,
    enum: ['Unread', 'Read', 'Archived', 'NotApplicable'],
    required: true,
    default() { return this.channel === 'InApp' ? 'Unread' : 'NotApplicable'; },
  },
  readAt: { type: Date, default: null },
  archivedAt: { type: Date, default: null },
  deliveryStatus: {
    type: String,
    enum: ['Pending', 'Queued', 'Sent', 'Failed', 'NotApplicable'],
    default() { return this.channel === 'Email' ? 'Pending' : 'NotApplicable'; },
  },
  sentAt: { type: Date, default: null },
}, {
  timestamps: true,
  autoIndex: false,
  strict: 'throw',
});

notificationSchema.virtual('isRead').get(function isRead() {
  return this.state === 'Read' || this.state === 'Archived';
});

notificationSchema.pre('validate', function validateSafeFacts() {
  const type = normalizeNotificationType(this.type);
  if (normalizeNotificationType(this.templateKey) !== type) {
    throw new Error('Notification template does not match its type');
  }
  sanitizeDisplayValues(type, this.displayValues, { rejectUnknown: true });
  if (this.channel === 'InApp' && this.state === 'NotApplicable') {
    throw new Error('In-app Notification requires an inbox lifecycle state');
  }
  if (this.channel === 'Email' && this.state !== 'NotApplicable') {
    throw new Error('Email Notification cannot enter the in-app lifecycle');
  }
  if (this.channel === 'InApp' && this.state === 'Unread' && (this.readAt || this.archivedAt)) {
    throw new Error('Unread Notification cannot have readAt or archivedAt');
  }
  if (this.channel === 'InApp' && this.state === 'Read' && (!this.readAt || this.archivedAt)) {
    throw new Error('Read Notification requires readAt and cannot have archivedAt');
  }
  if (this.channel === 'InApp' && this.state === 'Archived' && (!this.readAt || !this.archivedAt)) {
    throw new Error('Archived Notification requires readAt and archivedAt');
  }
  if (this.channel === 'Email' && (this.readAt || this.archivedAt)) {
    throw new Error('Email Notification cannot have inbox lifecycle timestamps');
  }
  if (!this.isNew && ['state', 'readAt', 'archivedAt'].some((path) => this.isModified(path))) {
    throw lifecycleMutationError();
  }
  if (!this.isNew && this.isModified('displayValues')) throw safeFactsMutationError('save');
});

notificationSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function rejectSafeFactMutation() {
  const update = this.getUpdate();
  const allowSetOnInsert = Boolean(this.getOptions().upsert);
  if (updateTouchesImmutableFacts(update, { allowSetOnInsert })) {
    throw safeFactsMutationError(this.op);
  }
  assertLifecycleUpdate(this.getFilter(), update, { allowSetOnInsert });
});

notificationSchema.pre(['replaceOne', 'findOneAndReplace'], function rejectReplacement() {
  throw safeFactsMutationError(this.op);
});

notificationSchema.pre('bulkWrite', function guardBulkWrite(next, operations) {
  try {
    for (const operation of operations || []) {
      const mutation = operation.updateOne?.update || operation.updateMany?.update;
      if (mutation && updateTouchesImmutableFacts(mutation)) throw safeFactsMutationError('bulkWrite');
      if (operation.updateOne) assertLifecycleUpdate(
        operation.updateOne.filter,
        operation.updateOne.update,
        { allowSetOnInsert: Boolean(operation.updateOne.upsert) },
      );
      if (operation.updateMany) assertLifecycleUpdate(
        operation.updateMany.filter,
        operation.updateMany.update,
        { allowSetOnInsert: Boolean(operation.updateMany.upsert) },
      );
      if (operation.replaceOne) throw safeFactsMutationError('bulkWrite.replaceOne');
      if (operation.deleteOne || operation.deleteMany) throw safeFactsMutationError('bulkWrite.delete');
    }
    next();
  } catch (error) {
    next(error);
  }
});

notificationSchema.index(
  { businessEventId: 1, recipientIdentity: 1, type: 1, channel: 1 },
  { unique: true, name: 'notification_logical_tuple_unique' }
);
notificationSchema.index(
  { userId: 1, channel: 1, state: 1, createdAt: -1, _id: -1 },
  { name: 'notification_owner_inbox_page' }
);

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
module.exports.assertLifecycleUpdate = assertLifecycleUpdate;
