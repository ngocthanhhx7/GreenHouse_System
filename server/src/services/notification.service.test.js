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
        async markAsReadForUser(userId, id) {
          const notification = notifications.find((entry) => entry._id === id && entry.userId === userId);
          if (!notification) return null;
          const data = { isRead: true };
          Object.assign(notification, data);
          return notification;
        },
      },
    });

    const result = await service.markAsRead('customer-1', 'noti-1');

    assert.equal(result.isRead, true);
  });

  it('rejects marking another user notification as read', async () => {
    const service = createNotificationService({
      notificationRepository: {
        async markAsReadForUser() {
          return null;
        },
      },
    });

    await assert.rejects(
      () => service.markAsRead('customer-1', 'noti-2'),
      /Notification not found/
    );
  });

  it('creates only one in-app notification for the same business event', async () => {
    const notifications = [];
    const service = createNotificationService({
      notificationRepository: {
        async createIdempotent(data) {
          const existing = notifications.find((item) => item.userId === data.userId && item.eventId === data.eventId);
          if (existing) return existing;
          const notification = { _id: `noti-${notifications.length + 1}`, ...data };
          notifications.push(notification);
          return notification;
        },
      },
    });

    const first = await service.createInAppNotification({
      userId: 'customer-1', type: 'STOCK_EXPORT', subject: 'Exported', content: 'Done', eventId: 'stock-export:export-1',
    });
    const replay = await service.createInAppNotification({
      userId: 'customer-1', type: 'STOCK_EXPORT', subject: 'Exported', content: 'Done', eventId: 'stock-export:export-1',
    });
    const secondRecipient = await service.createInAppNotification({
      userId: 'customer-2', type: 'STOCK_EXPORT', subject: 'Exported', content: 'Done', eventId: 'stock-export:export-1',
    });

    assert.equal(first.id, replay.id);
    assert.notEqual(first.id, secondRecipient.id);
    assert.equal(first.eventId, 'stock-export:export-1');
    assert.equal(notifications.length, 2);
  });

  it('lists unread notifications with an opaque cursor and target metadata', async () => {
    const service = createNotificationService({
      notificationRepository: {
        async listByUser(userId, options) {
          assert.equal(userId, 'customer-1');
          assert.equal(options.status, 'unread');
          assert.equal(options.limit, 5);
          return {
            items: [{
              _id: '507f1f77bcf86cd799439011', userId, type: 'ORDER_STATUS', channel: 'InApp', subject: 'Đã giao hàng',
              content: 'Đơn hàng đã được giao.', deliveryStatus: 'Sent', isRead: false,
              targetCollection: 'Order', targetId: '507f1f77bcf86cd799439012', createdAt: new Date('2026-07-20T00:00:00.000Z'),
            }],
            nextCursor: 'cursor-2',
          };
        },
        async countUnread() { return 3; },
      },
      notificationIdValidator: () => true,
    });

    const result = await service.listMyNotifications('customer-1', { status: 'unread', limit: 5 });
    assert.equal(result.items[0].targetCollection, 'Order');
    assert.equal(result.items[0].targetId, '507f1f77bcf86cd799439012');
    assert.equal(result.unreadCount, 3);
    assert.equal(result.nextCursor, 'cursor-2');
  });

  it('returns notification detail only to its owner', async () => {
    const service = createNotificationService({
      notificationRepository: {
        async findByIdForUser(userId, id) {
          if (userId !== 'customer-1') return null;
          return { _id: id, userId, type: 'ORDER_STATUS', channel: 'InApp', subject: 'Chi tiết', content: 'Nội dung', deliveryStatus: 'Sent', isRead: true };
        },
      },
      notificationIdValidator: () => true,
    });

    assert.equal((await service.getNotification('customer-1', 'noti-1')).subject, 'Chi tiết');
    await assert.rejects(() => service.getNotification('customer-2', 'noti-1'), /Notification not found/);
  });

  it('prevents deleting unread notifications with a stable business error code', async () => {
    const service = createNotificationService({
      notificationRepository: {
        async findByIdForUser() {
          return { _id: 'noti-1', userId: 'customer-1', isRead: false };
        },
      },
      notificationIdValidator: () => true,
    });

    await assert.rejects(
      () => service.deleteNotification('customer-1', 'noti-1'),
      (error) => error.statusCode === 409 && error.errorCode === 'NOTIFICATION_UNREAD_CANNOT_DELETE'
    );
  });

  it('soft deletes a read notification owned by the current user', async () => {
    let deletedAt = null;
    const notification = { _id: 'noti-1', userId: 'customer-1', type: 'ORDER_STATUS', channel: 'InApp', subject: 'Read', content: 'Read', deliveryStatus: 'Sent', isRead: true };
    const service = createNotificationService({
      notificationRepository: {
        async findByIdForUser() { return notification; },
        async softDeleteForUser(userId, id, date) {
          assert.equal(userId, 'customer-1');
          assert.equal(id, 'noti-1');
          deletedAt = date;
          return { ...notification, deletedAt: date };
        },
      },
      notificationIdValidator: () => true,
    });

    const result = await service.deleteNotification('customer-1', 'noti-1');
    assert.ok(deletedAt instanceof Date);
    assert.ok(result.deletedAt);
  });
});
