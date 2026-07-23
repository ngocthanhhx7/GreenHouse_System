import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { apiRequest } from './apiClient.js';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

async function captureError(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  assert.fail('Expected operation to reject');
}

afterEach(() => {
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
});
