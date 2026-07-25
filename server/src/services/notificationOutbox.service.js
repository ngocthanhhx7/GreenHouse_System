const DomainOutbox = require('../models/domainOutbox.model');
const { notificationService } = require('./notification.service');
const {
  NOTIFICATION_TYPES,
  normalizeNotificationType,
  sanitizeDisplayValues,
} = require('../utils/notificationContract');

const MAX_NOTIFICATION_OUTBOX_ATTEMPTS = 5;
const NOTIFICATION_OUTBOX_LEASE_MS = 5 * 60 * 1000;
const NOTIFICATION_OUTBOX_BATCH_SIZE = 100;
const NOTIFICATION_OUTBOX_FAILURE_CODE = 'NOTIFICATION_DELIVERY_FAILED';
const NOTIFICATION_OUTBOX_FAILURE_MESSAGE = 'Notification delivery failed';

function safeNotificationOutboxFailure() {
  const error = new Error(NOTIFICATION_OUTBOX_FAILURE_MESSAGE);
  error.code = NOTIFICATION_OUTBOX_FAILURE_CODE;
  return error;
}

function createModelRepository() {
  return {
    async listPendingNotificationEvents(eventTypes, staleBefore, limit) {
      return DomainOutbox.find({
        eventType: { $in: eventTypes },
        attemptCount: { $lt: MAX_NOTIFICATION_OUTBOX_ATTEMPTS },
        $or: [
          { status: { $in: ['Pending', 'Failed'] } },
          { status: 'Processing', processingStartedAt: { $lte: staleBefore } },
        ],
      }).sort({ createdAt: 1, _id: 1 }).limit(limit).lean();
    },

    async claimNotificationEvent(id, staleBefore, claimedAt, maxAttempts) {
      return DomainOutbox.findOneAndUpdate(
        {
          _id: id,
          eventType: { $in: NOTIFICATION_TYPES },
          attemptCount: { $lt: maxAttempts },
          $or: [
            { status: { $in: ['Pending', 'Failed'] } },
            { status: 'Processing', processingStartedAt: { $lte: staleBefore } },
          ],
        },
        {
          $set: { status: 'Processing', processingStartedAt: claimedAt, lastError: '' },
          $inc: { attemptCount: 1 },
        },
        { new: true, runValidators: true },
      ).lean();
    },

    async completeNotificationEvent(id, processingStartedAt) {
      return DomainOutbox.findOneAndUpdate(
        { _id: id, status: 'Processing', processingStartedAt },
        {
          $set: {
            status: 'Completed', completedAt: new Date(), processingStartedAt: null, lastError: '',
          },
        },
        { new: true, runValidators: true },
      ).lean();
    },

    async failNotificationEvent(id, processingStartedAt) {
      return DomainOutbox.findOneAndUpdate(
        { _id: id, status: 'Processing', processingStartedAt },
        {
          $set: {
            status: 'Failed',
            processingStartedAt: null,
            lastError: NOTIFICATION_OUTBOX_FAILURE_CODE,
          },
        },
        { new: true, runValidators: true },
      ).lean();
    },
  };
}

function canonicalNotificationEvent(row = {}) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const type = normalizeNotificationType(row.eventType);
  if (payload.type && normalizeNotificationType(payload.type) !== type) {
    throw new Error('Canonical Notification event type does not match its DomainOutbox row');
  }
  const businessEventId = String(payload.businessEventId || row.identityKey || '').trim();
  if (!businessEventId) throw new Error('Canonical Notification businessEventId is required');

  const hasBroadcast = Boolean(payload.recipientRole);
  const hasDirect = Boolean(payload.recipient || payload.recipientId || payload.userId);
  if (hasBroadcast === hasDirect) throw new Error('Canonical Notification requires exactly one recipient selector');

  const event = {
    businessEventId,
    type,
    displayValues: sanitizeDisplayValues(type, payload.displayValues, { rejectUnknown: true }),
  };
  if (hasBroadcast) {
    event.recipientRole = String(payload.recipientRole);
  } else if (payload.recipient) {
    event.recipient = {
      userId: payload.recipient.userId ? String(payload.recipient.userId) : '',
      email: payload.recipient.email ? String(payload.recipient.email) : '',
      role: payload.recipient.role ? String(payload.recipient.role) : '',
    };
  } else {
    event.recipientId = String(payload.recipientId || payload.userId);
    if (payload.recipientEmail) event.recipientEmail = String(payload.recipientEmail);
  }

  const target = payload.target && typeof payload.target === 'object'
    ? payload.target
    : { collection: payload.targetCollection, id: payload.targetId };
  if (target.collection || target.id) {
    event.target = {
      collection: String(target.collection || ''),
      id: target.id ? String(target.id) : '',
    };
  }
  return event;
}

function createNotificationOutboxService({
  repository = createModelRepository(),
  notificationPublisher = notificationService,
  clock = () => new Date(),
  leaseMs = NOTIFICATION_OUTBOX_LEASE_MS,
  batchSize = NOTIFICATION_OUTBOX_BATCH_SIZE,
} = {}) {
  if (!notificationPublisher?.publishDomainEvent) {
    throw new Error('Canonical Notification publisher is required');
  }

  return {
    async drainPostCommitWork() {
      const now = new Date(clock());
      const staleBefore = new Date(now.getTime() - leaseMs);
      const rows = await repository.listPendingNotificationEvents(
        NOTIFICATION_TYPES,
        staleBefore,
        batchSize,
      );
      const result = { claimed: 0, completed: 0, failed: 0 };

      for (const row of rows) {
        const claimed = await repository.claimNotificationEvent(
          row._id,
          staleBefore,
          now,
          MAX_NOTIFICATION_OUTBOX_ATTEMPTS,
        );
        if (!claimed) continue;
        result.claimed += 1;
        const lease = claimed.processingStartedAt;
        try {
          await notificationPublisher.publishDomainEvent(canonicalNotificationEvent(claimed));
          await repository.completeNotificationEvent(claimed._id, lease);
          result.completed += 1;
        } catch (_error) {
          await repository.failNotificationEvent(claimed._id, lease, safeNotificationOutboxFailure());
          result.failed += 1;
        }
      }
      return result;
    },
  };
}

const notificationOutboxService = createNotificationOutboxService();

module.exports = {
  MAX_NOTIFICATION_OUTBOX_ATTEMPTS,
  NOTIFICATION_OUTBOX_FAILURE_CODE,
  NOTIFICATION_OUTBOX_FAILURE_MESSAGE,
  canonicalNotificationEvent,
  createModelRepository,
  createNotificationOutboxService,
  notificationOutboxService,
  safeNotificationOutboxFailure,
};
