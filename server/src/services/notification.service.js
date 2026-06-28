const Notification = require('../models/notification.model');

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
  };
}

module.exports = {
  createNotificationService,
  notificationService: createNotificationService(),
};
