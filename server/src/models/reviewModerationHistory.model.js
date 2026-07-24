const mongoose = require('mongoose');

const reviewModerationHistorySchema = new mongoose.Schema({
  reviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductReview',
    required: true,
    immutable: true,
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  },
  version: { type: Number, required: true, min: 1, immutable: true },
  beforeStatus: {
    type: String,
    enum: ['Allowed', 'HiddenByStaff'],
    required: true,
    immutable: true,
  },
  afterStatus: {
    type: String,
    enum: ['Allowed', 'HiddenByStaff'],
    required: true,
    immutable: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 500,
    immutable: true,
  },
  createdAt: { type: Date, required: true, immutable: true },
}, { versionKey: false, autoIndex: false });

reviewModerationHistorySchema.index(
  { reviewId: 1, version: 1 },
  { unique: true, name: 'review_moderation_history_version_unique' },
);

module.exports = mongoose.model('ReviewModerationHistory', reviewModerationHistorySchema);
