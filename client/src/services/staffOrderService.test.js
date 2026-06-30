import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createStaffOrderService } from './staffOrderService.js';

describe('client staff order service', () => {
  it('lists staff orders with status query', async () => {
    const service = createStaffOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        assert.equal(url, 'http://api.test/api/staff/orders?status=Pending');
        assert.equal(options.method || 'GET', 'GET');
        return {
          ok: true,
          json: async () => ({ success: true, data: { items: [{ orderCode: 'ORD-1' }] } }),
        };
      },
    });

    const result = await service.listOrders({ status: 'Pending' });

    assert.equal(result.items[0].orderCode, 'ORD-1');
  });

  it('confirms staff orders through the staff endpoint', async () => {
    const service = createStaffOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/staff/orders/order-1/confirm');
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ success: true, data: { orderStatus: 'Confirmed' } }),
        };
      },
    });

    const result = await service.confirmOrder('order-1', { note: 'Reviewed' });

    assert.equal(result.orderStatus, 'Confirmed');
  });
});
