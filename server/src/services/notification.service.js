const Notification = require('../models/notification.model');
const ApiError = require('../utils/apiError');

function toPlainNotification(notification) {
  return {
    id: String(notification._id),
    userId: String(notification.userId),
    type: notification.type,
    channel: notification.channel,
    subject: notification.subject,
    content: notification.content,
    deliveryStatus: notification.deliveryStatus,
    isRead: notification.isRead,
    sentAt: notification.sentAt,
    createdAt: notification.createdAt,
  };
}

function createModelNotificationRepository() {
  return {
    async create(data) {
      return Notification.create(data);
    },
    async listByUser(userId) {
      return Notification.find({ userId }).sort({ createdAt: -1 }).lean();
    },
    async markAsReadForUser(userId, id) {
      return Notification.findOneAndUpdate(
        { _id: id, userId },
        { $set: { isRead: true } },
        { new: true, runValidators: true }
      ).lean();
    },
  };
}

function createNotificationService({
  notificationRepository = createModelNotificationRepository(),
} = {}) {
  return {
    async notifyPaymentStatus({ userId, orderCode, paymentStatus }) {
      const notification = await notificationRepository.create({
        userId,
        type: 'PAYMENT_STATUS',
        channel: 'Email',
        subject: `Payment ${paymentStatus} for order ${orderCode}`,
        content: `Your payment status for order ${orderCode} is ${paymentStatus}.`,
        deliveryStatus: 'Pending',
      });
      return toPlainNotification(notification);
    },

    async createInAppNotification({ userId, type, subject, content }) {
      const notification = await notificationRepository.create({
        userId,
        type,
        channel: 'InApp',
        subject,
        content,
        deliveryStatus: 'Sent',
        isRead: false,
        sentAt: new Date(),
      });
      return toPlainNotification(notification);
    },

    async listMyNotifications(userId) {
      const notifications = await notificationRepository.listByUser(userId);
      const items = notifications.map(toPlainNotification);
      return {
        items,
        total: items.length,
        unreadCount: items.filter((notification) => !notification.isRead).length,
      };
    },

    async markAsRead(userId, notificationId) {
      const updated = await notificationRepository.markAsReadForUser(userId, notificationId);
      if (!updated) {
        throw new ApiError(404, 'Notification not found');
      }
      return toPlainNotification(updated);
    },
  };
}

module.exports = {
  createNotificationService,
  notificationService: createNotificationService(),
};
