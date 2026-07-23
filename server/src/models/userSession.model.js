const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    selectorHash: { type: String, required: true, immutable: true },
    csrfSecret: { type: String, required: true, select: false },
    roleAtCreation: { type: String, required: true, enum: ['Customer', 'Staff', 'WarehouseManager', 'Admin'] },
    lastSeenAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: '', trim: true, maxlength: 120 },
    ip: { type: String, default: '', trim: true },
    userAgent: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

userSessionSchema.index({ selectorHash: 1 }, { unique: true, name: 'sl007_session_selector_hash_unique' });
userSessionSchema.index({ userId: 1, revokedAt: 1, absoluteExpiresAt: 1 }, { name: 'sl007_user_active_sessions' });

module.exports = mongoose.model('UserSession', userSessionSchema);
