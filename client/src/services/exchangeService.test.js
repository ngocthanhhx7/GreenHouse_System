import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createExchangeService } from './exchangeService.js';

function response(data = {}) {
  return { ok: true, async json() { return { success: true, data }; } };
}

async function captureError(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  assert.fail('Expected operation to reject');
}

describe('Exchange client service', () => {
  it('uses separate role-owned Exchange APIs and carries no financial parameters', async () => {
    const calls = [];
    const service = createExchangeService({
      baseUrl: '/api',
      fetcher: async (url, options = {}) => {
        calls.push({ url, options });
        return response({ id: 'exchange-1' });
      },
    });
    await service.createCustomerRequest('order-1', {
      idempotencyKey: 'exchange-submit-1',
      reason: 'Lỗi',
      evidenceImages: ['evidence'],
      lines: [{ orderDetailId: 'line-1', quantity: 1 }],
    });
    await service.decideRequest('exchange-1', {
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Đã xác minh',
    });
    await service.finalizeInspection('exchange-1', { idempotencyKey: 'inspection-1', lines: [] });
    assert.deepEqual(calls.map((call) => call.url), [
      '/api/orders/order-1/exchanges',
      '/api/staff/exchanges/exchange-1/decision',
      '/api/warehouse/exchanges/exchange-1/inspection',
    ]);
    assert.equal(calls.some((call) => /refund|payos|payout|bank/i.test(call.options.body || '')), false);
  });

  it('preserves typed backend errors for JSON requests', async () => {
    const service = createExchangeService({
      baseUrl: '/api',
      fetcher: async () => ({
        ok: false,
        async json() {
          return {
            success: false,
            message: 'Đang có hồ sơ hậu mãi',
            errorCode: 'AFTER_SALES_CASE_ACTIVE',
            errors: ['orderId'],
            data: {
              currentCase: { type: 'RETURN_REFUND', id: 'return-1', status: 'Approved' },
              action: { label: 'Xem yêu cầu đang xử lý', href: '/return-refunds' },
            },
            requestId: 'request-json',
          };
        },
      }),
    });

    const error = await captureError(() => service.createCustomerRequest('order-1', {}));
    assert.equal(error.message, 'Đang có hồ sơ hậu mãi');
    assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.deepEqual(error.errors, ['orderId']);
    assert.equal(error.data.action.href, '/return-refunds');
    assert.equal(error.requestId, 'request-json');
  });

  it('preserves typed backend errors for uploadEvidence', async () => {
    const service = createExchangeService({
      baseUrl: '/api',
      fetcher: async () => ({
        ok: false,
        async json() {
          return {
            success: false,
            message: 'Tải bằng chứng thất bại',
            errorCode: 'VALIDATION_ERROR',
            errors: [{ field: 'images', message: 'invalid' }],
            data: { retryable: false },
            requestId: 'request-upload',
          };
        },
      }),
    });

    const error = await captureError(() => service.uploadEvidence([
      new Blob(['proof'], { type: 'image/jpeg' }),
    ]));
    assert.equal(error.message, 'Tải bằng chứng thất bại');
    assert.equal(error.errorCode, 'VALIDATION_ERROR');
    assert.deepEqual(error.errors, [{ field: 'images', message: 'invalid' }]);
    assert.deepEqual(error.data, { retryable: false });
    assert.equal(error.requestId, 'request-upload');
  });
});
