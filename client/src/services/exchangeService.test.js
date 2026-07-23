import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createExchangeService } from './exchangeService.js';

function response(data = {}) {
  return { ok: true, async json() { return { success: true, data }; } };
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
});
