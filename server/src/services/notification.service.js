const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');

const Notification = require('../models/notification.model');
const Role = require('../models/role.model');
const User = require('../models/user.model');
const ApiError = require('../utils/apiError');
const {
  normalizeNotificationType,
  renderNotification,
  sanitizeDisplayValues,
} = require('../utils/notificationContract');
const { createNotificationEventConsumer } = require('./notificationEventConsumer.service');
const { assertNotificationRecipientSelector } = require('./notificationPolicy.service');
const { createNotificationTargetResolver } = require('./notificationTargetResolver.service');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const VALID_STATUSES = new Set(['active', 'unread', 'archived']);

function toPlainNotification(notification) {
  const safeValues = sanitizeDisplayValues(notification.type, notification.displayValues, { rejectUnknown: true });
  const copy = renderNotification(notification.type, notification.templateKey, safeValues);
  const state = notification.state || (notification.isRead ? 'Read' : 'Unread');
  return {
    id: String(notification._id),
    type: notification.type,
    channel: notification.channel || 'InApp',
    templateKey: notification.templateKey || notification.type,
    displayValues: safeValues,
    subject: copy.subject,
    content: copy.content,
    state,
    isRead: state !== 'Unread',
    readAt: notification.readAt || null,
    archivedAt: notification.archivedAt || null,
    createdAt: notification.createdAt,
  };
}

function encodeCursor(notification) {
  if (!notification) return null;
  return Buffer.from(JSON.stringify({
    createdAt: new Date(notification.createdAt).toISOString(),
    id: String(notification._id),
  })).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const createdAt = new Date(parsed.createdAt);
    if (!mongoose.isValidObjectId(parsed.id) || Number.isNaN(createdAt.getTime())) throw new Error('Invalid cursor');
    return { createdAt, id: parsed.id };
  } catch (_error) {
    throw new ApiError(400, 'Invalid notification cursor');
  }
}

function normalizeListOptions(input = {}) {
  const requested = String(input.status || 'active').toLowerCase();
  const status = requested === 'all' ? 'active' : requested;
  if (!VALID_STATUSES.has(status)) {
    throw new ApiError(400, 'Notification status must be active, unread, or archived');
  }
  const numericLimit = Number(input.limit || DEFAULT_LIMIT);
  if (!Number.isInteger(numericLimit) || numericLimit < 1) {
    throw new ApiError(400, 'Notification limit must be a positive integer');
  }
  return {
    status,
    limit: Math.min(numericLimit, MAX_LIMIT),
    cursor: input.cursor || '',
  };
}

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function createModelNotificationRepository({ notificationModel = Notification } = {}) {
  function validId(id) {
    return mongoose.isValidObjectId(id);
  }

  function tupleFilter(data) {
    return {
      businessEventId: data.businessEventId,
      recipientIdentity: data.recipientIdentity,
      type: data.type,
      channel: data.channel,
    };
  }

  return {
    async createTuple(data, session) {
      const filter = tupleFilter(data);
      return notificationModel.findOneAndUpdate(
        filter,
        { $setOnInsert: data },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
          ...(session ? { session } : {}),
        }
      ).lean();
    },
    async listByUser(userId, options = {}) {
      const query = { userId, channel: 'InApp' };
      if (options.status === 'archived') query.state = 'Archived';
      else if (options.status === 'unread') query.state = 'Unread';
      else query.state = { $in: ['Unread', 'Read'] };
      const cursor = decodeCursor(options.cursor);
      if (cursor) {
        query.$or = [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
        ];
      }
      const documents = await notificationModel.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(options.limit + 1)
        .lean();
      const hasMore = documents.length > options.limit;
      const items = hasMore ? documents.slice(0, options.limit) : documents;
      return { items, nextCursor: hasMore ? encodeCursor(items.at(-1)) : null };
    },
    async countUnread(userId) {
      return notificationModel.countDocuments({ userId, channel: 'InApp', state: 'Unread' });
    },
    async findByIdForUser(userId, id) {
      if (!validId(id)) return null;
      return notificationModel.findOne({ _id: id, userId, channel: 'InApp' }).lean();
    },
    async markAsReadForUser(userId, id, readAt) {
      if (!validId(id)) return null;
      const updated = await notificationModel.findOneAndUpdate(
        { _id: id, userId, channel: 'InApp', state: 'Unread' },
        { $set: { state: 'Read', readAt } },
        { new: true, runValidators: true }
      ).lean();
      if (updated) return updated;
      const current = await notificationModel.findOne({ _id: id, userId, channel: 'InApp' }).lean();
      return current && ['Read', 'Archived'].includes(current.state) ? current : null;
    },
    async archiveForUser(userId, id, archivedAt) {
      if (!validId(id)) return null;
      const updated = await notificationModel.findOneAndUpdate(
        { _id: id, userId, channel: 'InApp', state: 'Read' },
        { $set: { state: 'Archived', archivedAt } },
        { new: true, runValidators: true }
      ).lean();
      if (updated) return updated;
      const current = await notificationModel.findOne({ _id: id, userId, channel: 'InApp' }).lean();
      if (!current) return null;
      if (current.state === 'Unread') return { conflict: 'Unread' };
      return current.state === 'Archived' ? current : null;
    },
    async findActiveUserById(userId) {
      if (!validId(userId)) return null;
      return User.findOne({ _id: userId, status: 'Active' })
        .select('_id email roleId')
        .populate({ path: 'roleId', select: 'roleName' })
        .lean();
    },
    async findRecipientById(userId) {
      if (!validId(userId)) return null;
      return User.findById(userId)
        .select('_id email roleId status')
        .populate({ path: 'roleId', select: 'roleName' })
        .lean();
    },
    async listActiveUsersByRole(roleName) {
      const role = await Role.findOne({ roleName }).select('_id').lean();
      if (!role) return [];
      return User.find({ roleId: role._id, status: 'Active' }).select('_id email').lean();
    },
    async listActiveUserIdsByRole(roleName) {
      return (await this.listActiveUsersByRole(roleName)).map((user) => user._id);
    },
  };
}

function createNotificationService({
  notificationRepository = createModelNotificationRepository(),
  notificationIdValidator = mongoose.isValidObjectId,
  targetResolver = createNotificationTargetResolver(),
  emailOutboxService = null,
  clock = () => new Date(),
} = {}) {
  function validateId(id) {
    if (!notificationIdValidator(id)) throw new ApiError(404, 'Notification not found');
  }

  async function activeRecipient(userIdValue, email = '', roleHint = '') {
    const userId = userIdValue == null ? '' : String(userIdValue).trim();
    const supportsRecipientLookup = typeof notificationRepository.findRecipientById === 'function';
    const supportsActiveLookup = typeof notificationRepository.findActiveUserById === 'function';
    const found = userId && supportsRecipientLookup
      ? await notificationRepository.findRecipientById(userId)
      : userId && supportsActiveLookup
        ? await notificationRepository.findActiveUserById(userId)
        : null;
    const status = String(found?.status || (found ? 'Active' : '')).trim();
    return {
      userId,
      email: String(email || found?.email || '').trim().toLowerCase(),
      role: String(found?.role || found?.roleId?.roleName || roleHint || '').trim(),
      hasAccessibleAccount: supportsRecipientLookup || supportsActiveLookup
        ? Boolean(found) && status === 'Active'
        : Boolean(userId),
    };
  }

  const api = {
    async publishDomainEvent(input = {}, session) {
      const eventConsumer = createNotificationEventConsumer({
        notificationRepository,
        emailOutbox: emailOutboxService,
      });
      const type = normalizeNotificationType(input.type || input.eventType);
      assertNotificationRecipientSelector(type, input);
      const businessEventId = String(input.businessEventId || input.eventId || input.idempotencyKey || '').trim();
      if (!businessEventId) throw new Error('Notification businessEventId is required');
      const hasDirectRecipient = Boolean(input.recipient || input.recipientId || input.userId);
      if (input.recipientRole && hasDirectRecipient) {
        throw new Error('Notification event requires exactly one recipient selector');
      }
      let recipients = [];
      if (input.recipientRole) {
        const users = notificationRepository.listActiveUsersByRole
          ? await notificationRepository.listActiveUsersByRole(input.recipientRole)
          : (await notificationRepository.listActiveUserIdsByRole?.(input.recipientRole) || []).map((_id) => ({ _id }));
        recipients = users.map((user) => ({ userId: String(user._id), email: user.email, role: input.recipientRole, hasAccessibleAccount: true }));
      } else if (input.recipient || input.recipientId || input.userId) {
        const supplied = input.recipient || {};
        recipients = [await activeRecipient(
          supplied.userId || input.recipientId || input.userId,
          supplied.email || input.recipientEmail,
          supplied.role
        )];
      }
      const pages = [];
      for (const recipient of recipients) {
        pages.push(...await eventConsumer.consume({
          businessEventId,
          type,
          recipient,
          target: input.target || { collection: input.targetCollection, id: input.targetId },
          displayValues: sanitizeDisplayValues(type, input.displayValues, { rejectUnknown: true }),
        }, session));
      }
      return pages;
    },

    async notifyPaymentStatus(input = {}) {
      return this.publishDomainEvent({
        ...input,
        type: 'PAYMENT_STATUS',
        businessEventId: input.businessEventId || input.eventId || `payment-status:${randomUUID()}`,
        displayValues: { orderCode: input.orderCode, paymentStatus: input.paymentStatus },
      });
    },

    async createInAppNotification(input = {}, session) {
      const businessEventId = String(input.businessEventId || input.eventId || input.idempotencyKey || `legacy:${randomUUID()}`);
      return this.publishDomainEvent({
        ...input,
        businessEventId,
        recipientId: input.recipientId || input.userId,
      }, session);
    },

    async createRoleNotifications(input = {}, session) {
      if (!input.recipientRole) return [];
      return this.publishDomainEvent({
        ...input,
        businessEventId: input.businessEventId || input.eventId || input.idempotencyKey || `legacy-role:${randomUUID()}`,
      }, session);
    },

    async listMyNotifications(userId, input = {}) {
      const options = normalizeListOptions(input);
      const result = await notificationRepository.listByUser(userId, options);
      const items = Array.isArray(result) ? result : result.items;
      const unreadCount = notificationRepository.countUnread
        ? await notificationRepository.countUnread(userId)
        : items.filter((notification) => notification.state === 'Unread').length;
      return {
        items: items.map(toPlainNotification),
        total: items.length,
        unreadCount,
        nextCursor: Array.isArray(result) ? null : result.nextCursor || null,
      };
    },

    async getNotification(userId, notificationId) {
      validateId(notificationId);
      const notification = await notificationRepository.findByIdForUser(userId, notificationId);
      if (!notification) throw new ApiError(404, 'Notification not found');
      return toPlainNotification(notification);
    },

    async markAsRead(userId, notificationId) {
      validateId(notificationId);
      const updated = await notificationRepository.markAsReadForUser(userId, notificationId, new Date(clock()));
      if (!updated) throw new ApiError(404, 'Notification not found');
      return toPlainNotification(updated);
    },

    async archiveNotification(userId, notificationId) {
      validateId(notificationId);
      const updated = await notificationRepository.archiveForUser(userId, notificationId, new Date(clock()));
      if (!updated) throw new ApiError(404, 'Notification not found');
      if (updated.conflict === 'Unread') {
        throw new ApiError(409, 'Unread notifications cannot be archived', [], 'NOTIFICATION_UNREAD_CANNOT_ARCHIVE');
      }
      return toPlainNotification(updated);
    },

    async resolveTarget(actor, notificationId) {
      validateId(notificationId);
      const notification = await notificationRepository.findByIdForUser(actor.id, notificationId);
      if (!notification) throw new ApiError(404, 'Notification not found');
      return targetResolver.resolve(actor, {
        collection: notification.targetCollection,
        id: notification.targetId ? String(notification.targetId) : '',
      });
    },
  };

  return api;
}

let defaultEmailOutbox;
try {
  const { createEmailOutboxService } = require('./email.service');
  defaultEmailOutbox = createEmailOutboxService();
} catch (_error) {
  defaultEmailOutbox = null;
}

module.exports = {
  createModelNotificationRepository,
  createNotificationService,
  notificationService: createNotificationService({ emailOutboxService: defaultEmailOutbox }),
  decodeCursor,
  encodeCursor,
  normalizeListOptions,
  toPlainNotification,
};
