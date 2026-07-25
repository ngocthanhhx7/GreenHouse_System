const mongoose = require('mongoose');
const { sanitizeEmailEventPayload } = require('../utils/emailPayloadSanitizer');

const PAYLOAD_MUTATION_ERROR_CODE = 'EMAIL_OUTBOX_PAYLOAD_IMMUTABLE';

function payloadMutationError(operation) {
  const error = new Error(`EmailOutbox payload cannot be changed by ${operation}`);
  error.name = 'EmailOutboxPayloadMutationError';
  error.code = PAYLOAD_MUTATION_ERROR_CODE;
  return error;
}

function isPayloadPath(value) {
  return typeof value === 'string' && (value === 'payload' || value.startsWith('payload.'));
}

function updateTouchesPayload(update) {
  if (Array.isArray(update)) {
    return update.some((stage) => {
      if (!stage || typeof stage !== 'object') return false;
      if (Object.hasOwn(stage, '$replaceRoot') || Object.hasOwn(stage, '$replaceWith')) return true;
      return Object.entries(stage).some(([operator, operand]) => {
        if (operator === '$project') return true;
        if (!['$set', '$addFields', '$unset'].includes(operator)) return false;
        if (isPayloadPath(operand)) return true;
        if (Array.isArray(operand)) return operand.some(isPayloadPath);
        return operand && typeof operand === 'object'
          ? Object.keys(operand).some(isPayloadPath)
          : false;
      });
    });
  }
  if (!update || typeof update !== 'object') return false;
  return Object.entries(update).some(([operatorOrPath, operand]) => {
    if (isPayloadPath(operatorOrPath)) return true;
    if (!operatorOrPath.startsWith('$') || !operand || typeof operand !== 'object') return false;
    if (Object.keys(operand).some(isPayloadPath)) return true;
    return operatorOrPath === '$rename'
      && Object.values(operand).some(isPayloadPath);
  });
}

function assertPayloadUpdateAllowed(update, operation) {
  if (updateTouchesPayload(update)) throw payloadMutationError(operation);
}

const deliveryAttemptSchema = new mongoose.Schema({
  attemptNumber: { type: Number, required: true, min: 1 },
  claimId: { type: String, required: true, trim: true, maxlength: 120 },
  claimedAt: { type: Date, required: true },
  leaseUntil: { type: Date, required: true },
  completedAt: { type: Date, default: null },
  outcome: {
    type: String,
    required: true,
    enum: ['Processing', 'Sent', 'RetryScheduled', 'Failed', 'LeaseExpired'],
  },
  errorCode: { type: String, default: '', trim: true, maxlength: 80 },
  errorMessage: { type: String, default: '', trim: true, maxlength: 240 },
  providerMessageId: { type: String, default: '', trim: true, maxlength: 200 },
}, { _id: false });

const schema = new mongoose.Schema({
  eventType: { type: String, required: true, trim: true },
  idempotencyKey: { type: String, required: true, unique: true, trim: true },
  recipient: { type: String, required: true, trim: true, lowercase: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Sent', 'RetryScheduled', 'Failed'],
    default: 'Pending',
    index: true,
  },
  attemptCount: { type: Number, default: 0, min: 0 },
  attempts: { type: [deliveryAttemptSchema], default: () => [] },
  availableAt: { type: Date, default: Date.now, index: true },
  leaseUntil: { type: Date, default: null },
  lastError: { type: String, default: '', maxlength: 240 },
  sentAt: { type: Date, default: null },
  providerMessageId: { type: String, default: '', trim: true, maxlength: 200 },
  claimId: { type: String, default: '', trim: true, maxlength: 120, index: true },
}, { timestamps: true });

schema.pre('validate', function sanitizePayload() {
  if (this.isNew) {
    this.payload = sanitizeEmailEventPayload(this.eventType, this.payload);
  } else if (this.isModified('payload')) {
    throw payloadMutationError('save');
  }
});

schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function rejectPayloadQueryUpdate() {
  assertPayloadUpdateAllowed(this.getUpdate(), this.op);
});

schema.pre(['replaceOne', 'findOneAndReplace'], function rejectPayloadReplacement() {
  throw payloadMutationError(this.op);
});

schema.pre('bulkWrite', function rejectPayloadBulkMutation(next, operations) {
  try {
    for (const operation of operations || []) {
      if (operation.insertOne) {
        const document = operation.insertOne.document;
        document.payload = sanitizeEmailEventPayload(document.eventType, document.payload);
      } else if (operation.updateOne) {
        assertPayloadUpdateAllowed(operation.updateOne.update, 'bulkWrite.updateOne');
      } else if (operation.updateMany) {
        assertPayloadUpdateAllowed(operation.updateMany.update, 'bulkWrite.updateMany');
      } else if (operation.replaceOne) {
        throw payloadMutationError('bulkWrite.replaceOne');
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

schema.index(
  { status: 1, availableAt: 1, createdAt: 1 },
  { name: 'email_outbox_available_claim' }
);
schema.index(
  { status: 1, leaseUntil: 1, createdAt: 1 },
  { name: 'email_outbox_stale_lease' }
);
module.exports = mongoose.model('EmailOutbox', schema);
