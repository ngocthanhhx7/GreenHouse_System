import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createOrderService } from './orderService.js';

describe('client order service', () => {
  it('places customer order through order endpoint', async () => {
    const service = createOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/orders');
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ success: true, data: { orderCode: 'ORD-1' } }),
        };
      },
    });

    const result = await service.placeOrder({ shippingAddress: 'Ha Noi', paymentMethod: 'COD' }, { idempotencyKey: 'checkout-test-001' });

    assert.equal(result.orderCode, 'ORD-1');
  });

  it('sends the checkout idempotency key in the standard request header', async () => {
    const service = createOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (_url, options) => {
        assert.equal(options.headers['Idempotency-Key'], 'checkout-header-001');
        return { ok: true, json: async () => ({ success: true, data: {} }) };
      },
    });

    await service.placeOrder({ shippingAddress: 'Ha Noi', paymentMethod: 'COD' }, { idempotencyKey: 'checkout-header-001' });
  });
});
