import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { apiRequest, subscribeToSessionExpiration } from './apiClient.js';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const listenerCleanups = [];

async function captureError(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  assert.fail('Expected operation to reject');
}

afterEach(() => {
  while (listenerCleanups.length) listenerCleanups.pop()();
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
});

describe('apiClient error contract', () => {
  it('preserves every typed backend error field', async () => {
    globalThis.window = { localStorage: { getItem: () => 'token' } };
    globalThis.fetch = async () => ({
      ok: false,
      async json() {
        return {
          success: false,
          message: 'Đơn hàng đang có yêu cầu hậu mãi',
          errorCode: 'AFTER_SALES_CASE_ACTIVE',
          errors: [{ field: 'orderId', message: 'conflict' }],
          data: {
            currentCase: { type: 'EXCHANGE', id: 'exchange-1', status: 'Submitted' },
            action: { label: 'Xem yêu cầu đang xử lý', href: '/exchanges/exchange-1' },
          },
          requestId: 'request-1',
        };
      },
    });

    const error = await captureError(() => apiRequest('/orders/order-1/exchanges'));
    assert.equal(error.message, 'Đơn hàng đang có yêu cầu hậu mãi');
    assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.deepEqual(error.errors, [{ field: 'orderId', message: 'conflict' }]);
    assert.deepEqual(error.data.action, {
      label: 'Xem yêu cầu đang xử lý',
      href: '/exchanges/exchange-1',
    });
    assert.equal(error.requestId, 'request-1');
  });

  it('notifies one subscriber and preserves the HTTP status when a session expires', async () => {
    const notifications = [];
    listenerCleanups.push(subscribeToSessionExpiration((error) => {
      notifications.push(error);
    }));
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      async json() {
        return {
          success: false,
          message: 'Phiên đăng nhập đã hết hạn.',
          errorCode: 'SESSION_EXPIRED',
          errors: [],
          requestId: 'request-expired-1',
        };
      },
    });

    const error = await captureError(() => apiRequest('/cart'));

    assert.equal(error.statusCode, 401);
    assert.equal(error.errorCode, 'SESSION_EXPIRED');
    assert.equal(error.requestId, 'request-expired-1');
    assert.deepEqual(notifications, [error]);
  });

  it('does not notify session subscribers for a non-session 401 response', async () => {
    let notificationCount = 0;
    listenerCleanups.push(subscribeToSessionExpiration(() => {
      notificationCount += 1;
    }));
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      async json() {
        return {
          success: false,
          message: 'Email hoặc mật khẩu không đúng.',
          errorCode: 'AUTH_INVALID_CREDENTIALS',
        };
      },
    });

    const error = await captureError(() => apiRequest('/auth/login'));

    assert.equal(error.errorCode, 'AUTH_INVALID_CREDENTIALS');
    assert.equal(notificationCount, 0);
  });

  it('stops notifying a session subscriber after unsubscribe', async () => {
    let notificationCount = 0;
    const unsubscribe = subscribeToSessionExpiration(() => {
      notificationCount += 1;
    });
    unsubscribe();
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      async json() {
        return {
          success: false,
          message: 'Phiên đăng nhập đã bị thu hồi.',
          errorCode: 'SESSION_REVOKED',
        };
      },
    });

    await captureError(() => apiRequest('/cart'));

    assert.equal(notificationCount, 0);
  });
});
