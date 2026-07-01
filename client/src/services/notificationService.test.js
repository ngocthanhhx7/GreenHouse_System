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
});
