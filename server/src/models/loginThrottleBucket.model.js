const mongoose = require('mongoose');

const loginThrottleBucketSchema = new mongoose.Schema(
  {
    _id: { type: String },
    kind: { type: String, required: true, enum: ['email', 'ip'] },
    key: { type: String, required: true, trim: true },
    attempts: [{ type: Date, required: true }],
    expiresAt: { type: Date, required: true },
    lastClaimToken: { type: String, default: null },
  },
  { versionKey: false }
);

loginThrottleBucketSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'sl007_login_throttle_bucket_ttl' }
);

module.exports = mongoose.model('LoginThrottleBucket', loginThrottleBucketSchema);
