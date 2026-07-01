import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAdminService } from './adminService.js';

describe('client admin service', () => {
  it('fetches admin overview report', async () => {
    const service = createAdminService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/admin/reports/overview');
        return { ok: true, json: async () => ({ success: true, data: { orders: { total: 3 } } }) };
      },
    });

    const result = await service.getOverviewReport();

    assert.equal(result.orders.total, 3);
  });

  it('updates admin system settings', async () => {
    const service = createAdminService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/admin/settings');
        assert.equal(options.method, 'PATCH');
        assert.deepEqual(JSON.parse(options.body), { lowStockDefaultThreshold: 10 });
        return { ok: true, json: async () => ({ success: true, data: { lowStockDefaultThreshold: 10 } }) };
      },
    });

    const result = await service.updateSettings({ lowStockDefaultThreshold: 10 });

    assert.equal(result.lowStockDefaultThreshold, 10);
  });
});
