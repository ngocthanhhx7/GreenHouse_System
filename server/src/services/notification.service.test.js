const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createNotificationService } = require('./notification.service');
const Notification = require('../models/notification.model');

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

  it('queues a payment notification idempotently when a callback event identity is supplied', async () => {
    const saved = [];
    const service = createNotificationService({
      notificationRepository: {
        async createIdempotent(data) {
          const existing = saved.find((entry) => entry.eventId === data.eventId);
          if (existing) return existing;
          const created = { _id: `noti-${saved.length + 1}`, ...data };
          saved.push(created);
          return created;
        },
      },
    });
    const input = {
      userId: 'customer-1',
      orderCode: 'ORD-1',
      paymentStatus: 'Paid',
      eventId: 'PAYMENT_CALLBACK:event-1:NOTIFICATION',
    };

    const first = await service.notifyPaymentStatus(input);
    const replay = await service.notifyPaymentStatus(input);

    assert.equal(first.id, replay.id);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].eventId, input.eventId);
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

  it('passes the caller Mongo session through the service idempotent create path', async () => {
    const session = { id: 'exchange-session' };
    let receivedSession;
    const service = createNotificationService({
      notificationRepository: {
        async createIdempotent(data, repositorySession) {
          receivedSession = repositorySession;
          return { _id: 'noti-session-1', ...data };
        },
      },
    });

    await service.createInAppNotification({
      userId: 'customer-1',
      type: 'EXCHANGE_COMPLETED',
      subject: 'Completed',
      content: 'Completed atomically',
      eventId: 'EXCHANGE_COMPLETED:exchange-1',
    }, session);

    assert.equal(receivedSession, session);
  });

  it('creates the in-app notification in the caller Mongo session', async () => {
    const originalFindOne = Notification.findOne;
    const originalCreate = Notification.create;
    const session = { id: 'exchange-session' };
    let receivedDocuments;
    let receivedOptions;
    Notification.findOne = () => ({
      session(receivedSession) {
        assert.equal(receivedSession, session);
        return this;
      },
      async lean() { return null; },
    });
    Notification.create = async (documents, options) => {
      receivedDocuments = documents;
      receivedOptions = options;
      return [{ _id: '507f1f77bcf86cd799439011', ...documents[0] }];
    };

    try {
      const service = createNotificationService();
      await service.createInAppNotification({
        userId: '507f1f77bcf86cd799439012',
        type: 'EXCHANGE_COMPLETED',
        subject: 'Completed',
        content: 'Completed atomically',
        eventId: 'EXCHANGE_COMPLETED:507f1f77bcf86cd799439013',
      }, session);
    } finally {
      Notification.findOne = originalFindOne;
      Notification.create = originalCreate;
    }

    assert.equal(Array.isArray(receivedDocuments), true);
    assert.equal(receivedDocuments[0].type, 'EXCHANGE_COMPLETED');
    assert.equal(receivedOptions.session, session);
  });

  it('pre-reads an idempotent in-app notification in the caller session before creating', async () => {
    const originalFindOne = Notification.findOne;
    const originalCreate = Notification.create;
    const session = { id: 'exchange-session' };
    const operations = [];
    Notification.findOne = (filter) => {
      operations.push({ kind: 'find', filter });
      return {
        session(receivedSession) {
          assert.equal(receivedSession, session);
          return this;
        },
        async lean() {
          return {
            _id: '507f1f77bcf86cd799439011',
            userId: '507f1f77bcf86cd799439012',
            type: 'EXCHANGE_COMPLETED',
            channel: 'InApp',
            subject: 'Completed',
            content: 'Completed once',
            deliveryStatus: 'Sent',
            eventId: 'EXCHANGE_COMPLETED:exchange-1',
          };
        },
      };
    };
    Notification.create = async () => {
      operations.push({ kind: 'create' });
      throw new Error('create must not run when the session pre-read finds the event');
    };

    try {
      const service = createNotificationService();
      const result = await service.createInAppNotification({
        userId: '507f1f77bcf86cd799439012',
        type: 'EXCHANGE_COMPLETED',
        subject: 'Completed',
        content: 'Completed once',
        eventId: 'EXCHANGE_COMPLETED:exchange-1',
      }, session);
      assert.equal(result.id, '507f1f77bcf86cd799439011');
    } finally {
      Notification.findOne = originalFindOne;
      Notification.create = originalCreate;
    }

    assert.deepEqual(operations.map((item) => item.kind), ['find']);
  });

  it('does not query an aborted session after a duplicate create error', async () => {
    const originalFindOne = Notification.findOne;
    const originalCreate = Notification.create;
    const session = { id: 'exchange-session' };
    const operations = [];
    Notification.findOne = () => {
      operations.push('find');
      return {
        session(receivedSession) {
          assert.equal(receivedSession, session);
          return this;
        },
        async lean() { return null; },
      };
    };
    Notification.create = async () => {
      operations.push('create');
      const error = new Error('duplicate notification event');
      error.code = 11000;
      throw error;
    };

    try {
      const service = createNotificationService();
      await assert.rejects(
        service.createInAppNotification({
          userId: '507f1f77bcf86cd799439012',
          type: 'EXCHANGE_COMPLETED',
          subject: 'Completed',
          content: 'Completed once',
          eventId: 'EXCHANGE_COMPLETED:exchange-1',
        }, session),
        (error) => error.code === 11000
      );
    } finally {
      Notification.findOne = originalFindOne;
      Notification.create = originalCreate;
    }

    assert.deepEqual(operations, ['find', 'create']);
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
