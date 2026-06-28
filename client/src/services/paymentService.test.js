import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPaymentService } from './paymentService.js';

describe('client payment service', () => {
  it('creates online payment request through order payment endpoint', async () => {
    const service = createPaymentService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/orders/order-1/payments');
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ success: true, data: { mockPaymentUrl: '/payments/mock/order-1' } }),
        };
      },
    });

    const result = await service.createOnlinePayment('order-1');

    assert.equal(result.mockPaymentUrl, '/payments/mock/order-1');
  });

  it('submits mock callback result', async () => {
    const service = createPaymentService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/payments/callback');
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ success: true, data: { paymentStatus: 'Paid' } }),
        };
      },
    });

    const result = await service.submitMockCallback({ orderId: 'order-1', amount: 50, status: 'Paid' });

    assert.equal(result.paymentStatus, 'Paid');
  });
});
