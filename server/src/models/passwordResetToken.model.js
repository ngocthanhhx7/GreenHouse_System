const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  otpHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  attemptCount: { type: Number, default: 0, min: 0, max: 5 },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, usedAt: 1, createdAt: -1 });
module.exports = mongoose.model('PasswordResetToken', schema);
