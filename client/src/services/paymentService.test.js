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
          json: async () => ({ success: true, data: { checkoutUrl: 'https://pay.payos.vn/web/order-1' } }),
        };
      },
    });

    const result = await service.createOnlinePayment('order-1');

    assert.equal(result.checkoutUrl, 'https://pay.payos.vn/web/order-1');
  });
});
