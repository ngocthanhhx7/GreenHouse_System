const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createNotificationController } = require('./notification.controller');

function response() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

describe('SL-009 Notification controller', () => {
  it('AT-179 forwards only the authenticated owner identity for inbox lifecycle actions', async () => {
    const calls = [];
    const controller = createNotificationController({
      notificationService: {
        async listMyNotifications(userId, query) { calls.push(['list', userId, query]); return { items: [] }; },
        async markAsRead(userId, id) { calls.push(['read', userId, id]); return { id, state: 'Read' }; },
        async archiveNotification(userId, id) { calls.push(['archive', userId, id]); return { id, state: 'Archived' }; },
      },
    });
    const actor = { id: 'customer-1', role: 'Customer' };

    await controller.listMyNotifications({ user: actor, query: { status: 'archived' } }, response(), assert.fail);
    await controller.markAsRead({ user: actor, params: { id: 'notification-1' } }, response(), assert.fail);
    await controller.archiveNotification({ user: actor, params: { id: 'notification-1' } }, response(), assert.fail);

    assert.deepEqual(calls, [
      ['list', 'customer-1', { status: 'archived' }],
      ['read', 'customer-1', 'notification-1'],
      ['archive', 'customer-1', 'notification-1'],
    ]);
  });

  it('AT-180 passes the complete current actor to the target resolver boundary', async () => {
    let received;
    const controller = createNotificationController({
      notificationService: {
        async resolveTarget(actor, id) { received = { actor, id }; return { href: '/orders/order-1' }; },
      },
    });
    const res = response();
    const actor = { id: 'customer-1', role: 'Customer', status: 'Active' };

    await controller.resolveTarget({ user: actor, params: { id: 'notification-1' } }, res, assert.fail);

    assert.deepEqual(received, { actor, id: 'notification-1' });
    assert.deepEqual(res.payload.data, { href: '/orders/order-1' });
  });
});
