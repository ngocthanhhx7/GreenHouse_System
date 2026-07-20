import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createNotificationService } from './notificationService.js';

describe('client notification service', () => {
  it('lists notifications for the signed-in user', async () => {
    const service = createNotificationService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        assert.equal(url, 'http://api.test/api/notifications');
        assert.equal(options.method, undefined);
        return { ok: true, json: async () => ({ success: true, data: { unreadCount: 1, items: [] } }) };
      },
    });

    const result = await service.listMyNotifications();

    assert.equal(result.unreadCount, 1);
  });

  it('marks a notification as read', async () => {
    const service = createNotificationService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        assert.equal(url, 'http://api.test/api/notifications/noti-1/read');
        assert.equal(options.method, 'PATCH');
        return { ok: true, json: async () => ({ success: true, data: { id: 'noti-1', isRead: true } }) };
      },
    });

    const result = await service.markAsRead('noti-1');

    assert.equal(result.isRead, true);
  });

  it('filters and paginates the notification inbox', async () => {
    const service = createNotificationService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/notifications?status=unread&limit=5&cursor=next-page');
        return { ok: true, json: async () => ({ success: true, data: { items: [], unreadCount: 2 } }) };
      },
    });

    const result = await service.listMyNotifications({ status: 'unread', limit: 5, cursor: 'next-page' });
    assert.equal(result.unreadCount, 2);
  });

  it('loads notification detail and deletes a read notification', async () => {
    const calls = [];
    const service = createNotificationService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ success: true, data: { id: 'noti-1', isRead: true } }) };
      },
    });

    await service.getNotification('noti-1');
    await service.deleteNotification('noti-1');

    assert.equal(calls[0].url, 'http://api.test/api/notifications/noti-1');
    assert.equal(calls[1].options.method, 'DELETE');
  });
});
