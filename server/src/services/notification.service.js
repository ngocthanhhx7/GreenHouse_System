const mongoose = require('mongoose');

const Notification = require('../models/notification.model');
const ApiError = require('../utils/apiError');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const VALID_STATUSES = new Set(['all', 'unread']);
const PAYMENT_STATUS_LABELS = {
  Paid: 'đã thanh toán',
  Failed: 'thất bại',
  Pending: 'đang chờ xử lý',
  Refunded: 'đã hoàn tiền',
  RefundPending: 'đang chờ hoàn tiền',
};

function toPlainNotification(notification) {
  return {
    id: String(notification._id),
    userId: String(notification.userId),
    targetCollection: notification.targetCollection || '',
    targetId: notification.targetId ? String(notification.targetId) : null,
    recipientEmail: notification.recipientEmail || '',
    type: notification.type,
    channel: notification.channel,
    subject: notification.subject,
    content: notification.content,
    deliveryStatus: notification.deliveryStatus,
    isRead: Boolean(notification.isRead),
    readAt: notification.readAt || null,
    deletedAt: notification.deletedAt || null,
    sentAt: notification.sentAt,
    providerMessageId: notification.providerMessageId || '',
    eventId: notification.eventId || '',
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
  } catch (error) {
    throw new ApiError(400, 'Invalid notification cursor');
  }
}

function normalizeListOptions(input = {}) {
  const status = String(input.status || 'all').toLowerCase();
  if (!VALID_STATUSES.has(status)) {
    throw new ApiError(400, 'Notification status must be all or unread');
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

function createModelNotificationRepository() {
  function validId(id) {
    return mongoose.isValidObjectId(id);
  }

  return {
    async create(data) {
      return Notification.create(data);
    },
    async createIdempotent(data) {
      if (!data.eventId) return Notification.create(data);
      try {
        return await Notification.create(data);
      } catch (error) {
        if (error && error.code === 11000) {
          const existing = await Notification.findOne({ userId: data.userId, eventId: data.eventId }).lean();
          if (existing) return existing;
        }
        throw error;
      }
    },
    async listByUser(userId, options = {}) {
      const query = { userId, deletedAt: null };
      if (options.status === 'unread') query.isRead = false;
      const cursor = decodeCursor(options.cursor);
      if (cursor) {
        query.$or = [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
        ];
      }
      const documents = await Notification.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(options.limit + 1)
        .lean();
      const hasMore = documents.length > options.limit;
      const items = hasMore ? documents.slice(0, options.limit) : documents;
      return { items, nextCursor: hasMore ? encodeCursor(items.at(-1)) : null };
    },
    async countUnread(userId) {
      return Notification.countDocuments({ userId, isRead: false, deletedAt: null });
    },
    async findByIdForUser(userId, id) {
      if (!validId(id)) return null;
      return Notification.findOne({ _id: id, userId, deletedAt: null }).lean();
    },
    async markAsReadForUser(userId, id) {
      if (!validId(id)) return null;
      const current = await Notification.findOne({ _id: id, userId, deletedAt: null }).lean();
      if (!current || current.isRead) return current;
      return Notification.findOneAndUpdate(
        { _id: id, userId, deletedAt: null, isRead: false },
        { $set: { isRead: true, readAt: new Date() } },
        { new: true, runValidators: true }
      ).lean();
    },
    async softDeleteForUser(userId, id, deletedAt) {
      if (!validId(id)) return null;
      return Notification.findOneAndUpdate(
        { _id: id, userId, deletedAt: null, isRead: true },
        { $set: { deletedAt } },
        { new: true, runValidators: true }
      ).lean();
    },
  };
}

function createNotificationService({
  notificationRepository = createModelNotificationRepository(),
  notificationIdValidator = () => true,
} = {}) {
  function validateId(id) {
    if (!notificationIdValidator(id)) throw new ApiError(404, 'Notification not found');
  }

  return {
    async notifyPaymentStatus({ userId, orderCode, paymentStatus }) {
      const statusLabel = PAYMENT_STATUS_LABELS[paymentStatus] || String(paymentStatus || '').toLowerCase();
      const notification = await notificationRepository.create({
        userId,
        type: 'PAYMENT_STATUS',
        channel: 'Email',
        subject: `Thanh toán đơn ${orderCode} ${statusLabel}`,
        content: `Trạng thái thanh toán của đơn hàng ${orderCode}: ${statusLabel}.`,
        deliveryStatus: 'Pending',
      });
      return toPlainNotification(notification);
    },

    async createInAppNotification({
      userId,
      type,
      subject,
      content,
      eventId = '',
      targetCollection = '',
      targetId = null,
      recipientEmail = '',
    }) {
      const create = eventId && notificationRepository.createIdempotent
        ? notificationRepository.createIdempotent.bind(notificationRepository)
        : notificationRepository.create.bind(notificationRepository);
      const notification = await create({
        userId,
        type,
        channel: 'InApp',
        subject,
        content,
        deliveryStatus: 'Sent',
        isRead: false,
        sentAt: new Date(),
        eventId,
        targetCollection,
        targetId,
        recipientEmail,
      });
      return toPlainNotification(notification);
    },

    async listMyNotifications(userId, input = {}) {
      const options = normalizeListOptions(input);
      const result = await notificationRepository.listByUser(userId, options);
      const items = Array.isArray(result) ? result : result.items;
      const unreadCount = notificationRepository.countUnread
        ? await notificationRepository.countUnread(userId)
        : items.filter((notification) => !notification.isRead).length;
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
      const updated = await notificationRepository.markAsReadForUser(userId, notificationId);
      if (!updated) throw new ApiError(404, 'Notification not found');
      return toPlainNotification(updated);
    },

    async deleteNotification(userId, notificationId) {
      validateId(notificationId);
      const current = await notificationRepository.findByIdForUser(userId, notificationId);
      if (!current) throw new ApiError(404, 'Notification not found');
      if (!current.isRead) {
        throw new ApiError(409, 'Unread notifications cannot be deleted', [], 'NOTIFICATION_UNREAD_CANNOT_DELETE');
      }
      const deletedAt = new Date();
      const deleted = await notificationRepository.softDeleteForUser(userId, notificationId, deletedAt);
      if (!deleted) throw new ApiError(404, 'Notification not found');
      return toPlainNotification(deleted);
    },
  };
}

module.exports = {
  createNotificationService,
  notificationService: createNotificationService(),
  encodeCursor,
  decodeCursor,
};
