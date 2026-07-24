const mongoose = require('mongoose');

const reviewPublicationHistorySchema = new mongoose.Schema({
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
    enum: ['Published', 'Withdrawn'],
    required: true,
    immutable: true,
  },
  afterStatus: {
    type: String,
    enum: ['Published', 'Withdrawn'],
    required: true,
    immutable: true,
  },
  createdAt: { type: Date, required: true, immutable: true },
}, { versionKey: false, autoIndex: false });

reviewPublicationHistorySchema.index(
  { reviewId: 1, version: 1 },
  { unique: true, name: 'review_publication_history_version_unique' },
);
reviewPublicationHistorySchema.index(
  { reviewId: 1, createdAt: 1, _id: 1 },
  { name: 'review_publication_history_chronological' },
);

module.exports = mongoose.model('ReviewPublicationHistory', reviewPublicationHistorySchema);
