import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { createCartService } from './cartService.js';
import { subscribeToSessionExpiration } from './apiClient.js';

const listenerCleanups = [];

afterEach(() => {
  while (listenerCleanups.length) listenerCleanups.pop()();
});

describe('client cart service', () => {
  it('adds item through customer cart endpoint', async () => {
    const service = createCartService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/cart/items');
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ success: true, data: { totalAmount: 50 } }),
        };
      },
    });

    const result = await service.addItem({ productId: 'p1', quantity: 2 });

    assert.equal(result.totalAmount, 50);
  });

  it('uses the authenticated customer Cart endpoints without sending a customerId', async () => {
    const calls = [];
    const service = createCartService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        calls.push({ url, options });
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { items: [] } }),
        };
      },
    });

    await service.getCart();
    await service.updateItem('item-1', { quantity: 3, expectedVersion: 1 }, {
      idempotencyKey: 'cart-update-client-001',
    });
    await service.removeItem('item-1', { expectedVersion: 2 }, {
      idempotencyKey: 'cart-remove-client-001',
    });

    assert.deepEqual(calls.map(({ url, options }) => ({
      url,
      method: options.method || 'GET',
      credentials: options.credentials,
    })), [
      { url: 'http://api.test/api/cart', method: 'GET', credentials: 'include' },
      { url: 'http://api.test/api/cart/items/item-1', method: 'PATCH', credentials: 'include' },
      { url: 'http://api.test/api/cart/items/item-1', method: 'DELETE', credentials: 'include' },
    ]);
    assert.deepEqual(JSON.parse(calls[1].options.body), { quantity: 3, expectedVersion: 1 });
    assert.deepEqual(JSON.parse(calls[2].options.body), { expectedVersion: 2 });
    assert.equal(calls.some(({ options }) => options.body?.includes('customerId')), false);
  });

  it('uses the shared session-expiration contract for protected Cart requests', async () => {
    const notifications = [];
    listenerCleanups.push(subscribeToSessionExpiration((error) => {
      notifications.push(error);
    }));
    const service = createCartService({
      baseUrl: 'http://api.test/api',
      fetcher: async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          message: 'Phiên đăng nhập đã hết hạn.',
          errorCode: 'SESSION_EXPIRED',
        }),
      }),
    });

    await assert.rejects(
      () => service.getCart(),
      (error) => error.statusCode === 401 && error.errorCode === 'SESSION_EXPIRED',
    );
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].errorCode, 'SESSION_EXPIRED');
  });
});
