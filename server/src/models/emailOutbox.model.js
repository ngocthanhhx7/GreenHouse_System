const mongoose = require('mongoose');
const { sanitizeEmailEventPayload } = require('../utils/emailPayloadSanitizer');

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
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
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
  this.payload = sanitizeEmailEventPayload(this.eventType, this.payload);
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
