const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createNotificationService } = require('./notification.service');

describe('notification service', () => {
  it('records payment status notification with pending delivery status', async () => {
    const saved = [];
    const service = createNotificationService({
      notificationRepository: {
        async create(data) {
          saved.push(data);
          return { _id: 'noti-1', ...data };
        },
      },
    });

    const result = await service.notifyPaymentStatus({
      userId: 'customer-1',
      orderCode: 'ORD-1',
      paymentStatus: 'Paid',
    });

    assert.equal(result.type, 'PAYMENT_STATUS');
    assert.equal(result.deliveryStatus, 'Pending');
    assert.equal(saved[0].userId, 'customer-1');
  });

  it('lists only notifications for the current user with unread count', async () => {
    const notifications = [
      { _id: 'noti-1', userId: 'customer-1', type: 'PAYMENT_STATUS', channel: 'InApp', subject: 'Paid', content: 'Paid', deliveryStatus: 'Sent', isRead: false },
      { _id: 'noti-2', userId: 'customer-1', type: 'ORDER_STATUS', channel: 'InApp', subject: 'Shipped', content: 'Shipped', deliveryStatus: 'Sent', isRead: true },
      { _id: 'noti-3', userId: 'customer-2', type: 'PAYMENT_STATUS', channel: 'InApp', subject: 'Other', content: 'Other', deliveryStatus: 'Sent', isRead: false },
    ];
    const service = createNotificationService({
      notificationRepository: {
        async listByUser(userId) {
          return notifications.filter((notification) => notification.userId === userId);
        },
      },
    });

    const result = await service.listMyNotifications('customer-1');

    assert.equal(result.total, 2);
    assert.equal(result.unreadCount, 1);
    assert.deepEqual(result.items.map((item) => item.id), ['noti-1', 'noti-2']);
  });

  it('marks only the current user notification as read', async () => {
    const notifications = [
      { _id: 'noti-1', userId: 'customer-1', type: 'PAYMENT_STATUS', channel: 'InApp', subject: 'Paid', content: 'Paid', deliveryStatus: 'Sent', isRead: false },
    ];
    const service = createNotificationService({
      notificationRepository: {
        async findById(id) {
          return notifications.find((notification) => notification._id === id) || null;
        },
        async update(id, data) {
          const notification = notifications.find((entry) => entry._id === id);
          Object.assign(notification, data);
          return notification;
        },
      },
    });

    const result = await service.markAsRead('customer-1', 'noti-1');

    assert.equal(result.isRead, true);
  });
});
