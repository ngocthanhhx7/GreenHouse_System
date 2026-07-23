const mongoose = require('mongoose');

const registrationChallengeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    attemptCount: { type: Number, default: 0, min: 0, max: 5 },
    state: { type: String, enum: ['PendingVerification', 'Consumed', 'Invalidated', 'Expired'], default: 'PendingVerification' },
    createdAt: { type: Date, default: Date.now },
    usedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
    idempotencyKey: { type: String, required: true, trim: true },
    ip: { type: String, default: '', trim: true },
  },
  { versionKey: false }
);

registrationChallengeSchema.index({ email: 1, createdAt: -1 }, { name: 'sl007_registration_latest_identity' });
registrationChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'sl007_registration_expiry' });
registrationChallengeSchema.index({ email: 1, idempotencyKey: 1 }, { unique: true, name: 'sl007_registration_idempotency' });

module.exports = mongoose.model('RegistrationChallenge', registrationChallengeSchema);
