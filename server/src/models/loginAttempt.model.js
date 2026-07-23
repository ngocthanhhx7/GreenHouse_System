const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true, enum: ['email', 'ip'] },
    key: { type: String, required: true, trim: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false }
);

loginAttemptSchema.index({ kind: 1, key: 1, createdAt: -1 }, { name: 'sl007_login_attempt_window' });
loginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800, name: 'sl007_login_attempt_ttl' });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
