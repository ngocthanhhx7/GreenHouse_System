const { createHash } = require('node:crypto');

const { resolveNotificationChannels } = require('./notificationPolicy.service');
const {
  TARGET_COLLECTIONS,
  deepFreeze,
  normalizeNotificationType,
  sanitizeDisplayValues,
} = require('../utils/notificationContract');

function normalizeRecipient(recipient = {}) {
  const email = String(recipient.email || '').trim().toLowerCase();
  const userId = recipient.userId ? String(recipient.userId) : '';
  return {
    email,
    userId,
    role: String(recipient.role || '').trim(),
    hasAccessibleAccount: Boolean(userId) && recipient.hasAccessibleAccount !== false,
  };
}

function normalizeTarget(target = {}) {
  const collection = String(target.collection || '').trim();
  const id = target.id ? String(target.id) : '';
  if (!TARGET_COLLECTIONS.includes(collection)) throw new Error('Notification target collection is not allowed');
  return collection && id ? { collection, id } : { collection: '', id: '' };
}

function emailTupleKey(tuple) {
  const digest = createHash('sha256').update(JSON.stringify(tuple)).digest('hex');
  return `NOTIFICATION_EMAIL:${digest}`;
}

function toResult(document) {
  return {
    id: String(document._id),
    businessEventId: document.businessEventId,
    recipientIdentity: document.recipientIdentity,
    type: document.type,
    channel: document.channel,
  };
}

function createNotificationEventConsumer({ notificationRepository, emailOutbox } = {}) {
  if (!notificationRepository?.createTuple) throw new Error('Notification tuple repository is required');

  async function consume(input = {}, session) {
    const businessEventId = String(input.businessEventId || '').trim();
    if (!businessEventId) throw new Error('Notification businessEventId is required');
    const type = normalizeNotificationType(input.type);
    const templateKey = normalizeNotificationType(input.templateKey || type);
    if (templateKey !== type) throw new Error('Notification template does not match its type');
    const recipient = normalizeRecipient(input.recipient);
    const target = normalizeTarget(input.target);
    const displayValues = deepFreeze(sanitizeDisplayValues(type, input.displayValues));
    const channels = resolveNotificationChannels(type, recipient);
    const created = [];

    for (const channel of channels) {
      if (channel === 'Email' && !recipient.email) throw new Error('Email notification recipient is required');
      if (channel === 'InApp' && !recipient.userId) throw new Error('In-app notification recipient is required');
      const recipientIdentity = channel === 'Email'
        ? `email:${recipient.email}`
        : `user:${recipient.userId}`;
      const tuple = deepFreeze({
        businessEventId,
        recipientIdentity,
        type,
        channel,
      });
      const safeDocument = deepFreeze({
        ...tuple,
        userId: recipient.userId || null,
        templateKey,
        displayValues,
        targetCollection: target.collection,
        targetId: target.id || null,
        state: channel === 'InApp' ? 'Unread' : 'NotApplicable',
        deliveryStatus: channel === 'Email' ? 'Pending' : 'NotApplicable',
      });
      const notification = await notificationRepository.createTuple(safeDocument, session);
      created.push(toResult(notification));

      if (channel === 'Email') {
        if (!emailOutbox?.enqueue) throw new Error('EmailOutbox enqueue boundary is required');
        await emailOutbox.enqueue({
          eventType: 'NOTIFICATION_DELIVERY_REQUESTED',
          idempotencyKey: emailTupleKey(tuple),
          recipient: recipient.email,
          payload: {
            notificationId: String(notification._id),
            businessEventId,
            notificationType: type,
            templateKey,
            ...displayValues,
            ...(target.collection ? { targetCollection: target.collection, targetId: target.id } : {}),
          },
        }, session);
      }
    }
    return created;
  }

  return { consume, resolveChannels: resolveNotificationChannels };
}

module.exports = { createNotificationEventConsumer, emailTupleKey };
