const mongoose = require('mongoose');

const reviewContentHistorySchema = new mongoose.Schema({
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
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    immutable: true,
    validate: {
      validator: Number.isInteger,
      message: 'Review rating must be an integer from 1 to 5',
    },
  },
  content: {
    type: String,
    default: '',
    maxlength: 1000,
    immutable: true,
  },
  createdAt: { type: Date, required: true, immutable: true },
}, { versionKey: false, autoIndex: false });

reviewContentHistorySchema.index(
  { reviewId: 1, version: 1 },
  { unique: true, name: 'review_content_history_version_unique' },
);

module.exports = mongoose.model('ReviewContentHistory', reviewContentHistorySchema);
