const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetCollection: {
      type: String,
      default: '',
      trim: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    recipientEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    channel: {
      type: String,
      enum: ['Email', 'InApp'],
      default: 'Email',
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    deliveryStatus: {
      type: String,
      enum: ['Pending', 'Sent', 'Failed'],
      default: 'Pending',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    providerMessageId: {
      type: String,
      default: '',
      trim: true,
    },
    eventId: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, deletedAt: 1, createdAt: -1 });
notificationSchema.index({ deliveryStatus: 1 });
notificationSchema.index(
  { userId: 1, eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: 'string', $gt: '' } } }
);

module.exports = mongoose.model('Notification', notificationSchema);
