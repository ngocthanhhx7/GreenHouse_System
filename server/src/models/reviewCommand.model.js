const mongoose = require('mongoose');

const reviewCommandSchema = new mongoose.Schema({
  actorId: {
    type: String,
    required: true,
    trim: true,
    immutable: true,
  },
  aggregateType: {
    type: String,
    enum: ['Review'],
    required: true,
    immutable: true,
  },
  aggregateId: {
    type: String,
    required: true,
    trim: true,
    immutable: true,
  },
  operation: {
    type: String,
    enum: ['createReview', 'updateReview', 'setPublication', 'moderate'],
    required: true,
    immutable: true,
  },
  idempotencyKey: {
    type: String,
    required: true,
    trim: true,
    minlength: 8,
    maxlength: 128,
    immutable: true,
  },
  fingerprint: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
    immutable: true,
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    immutable: true,
  },
  currentResultId: {
    type: String,
    required: true,
    trim: true,
    immutable: true,
  },
  currentResultVersion: {
    type: Number,
    required: true,
    min: 1,
    immutable: true,
  },
  createdAt: { type: Date, required: true, immutable: true },
}, { versionKey: false, autoIndex: false });

reviewCommandSchema.index(
  { actorId: 1, idempotencyKey: 1 },
  { unique: true, name: 'review_command_actor_key_unique' },
);

module.exports = mongoose.model('ReviewCommand', reviewCommandSchema);
