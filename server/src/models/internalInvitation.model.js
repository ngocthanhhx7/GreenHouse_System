const mongoose = require('mongoose');

const internalInvitationSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    roleName: { type: String, required: true, enum: ['Staff', 'WarehouseManager'] },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    state: { type: String, enum: ['PendingAcceptance', 'Accepted', 'Revoked', 'Expired'], default: 'PendingAcceptance' },
    createdAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    idempotencyKey: { type: String, required: true, trim: true },
    reason: { type: String, default: '', trim: true },
  },
  { versionKey: false }
);

internalInvitationSchema.index({ email: 1, createdAt: -1 }, { name: 'sl007_invitation_latest_identity' });
internalInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'sl007_invitation_expiry' });
internalInvitationSchema.index({ email: 1, idempotencyKey: 1 }, { unique: true, name: 'sl007_invitation_idempotency' });

module.exports = mongoose.model('InternalInvitation', internalInvitationSchema);
