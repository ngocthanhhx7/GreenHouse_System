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

    const result = await service.placeOrder({ shippingAddress: 'Ha Noi', paymentMethod: 'COD' });

    assert.equal(result.orderCode, 'ORD-1');
  });
});
