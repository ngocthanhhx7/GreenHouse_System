import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createReplenishmentService } from './replenishmentService.js';

describe('client replenishment service', () => {
  it('creates warehouse replenishment requests', async () => {
    const service = createReplenishmentService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/warehouse/replenishments');
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ success: true, data: { status: 'PendingApproval' } }),
        };
      },
    });

    const result = await service.createWarehouseRequest({ inventoryId: 'inv-1', quantity: 20, reason: 'Low stock' });

    assert.equal(result.status, 'PendingApproval');
  });

  it('updates admin replenishment decisions', async () => {
    const service = createReplenishmentService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/admin/replenishments/rep-1/status');
        assert.equal(options.method, 'PATCH');
        return {
          ok: true,
          json: async () => ({ success: true, data: { status: 'Approved' } }),
        };
      },
    });

    const result = await service.updateAdminStatus('rep-1', { status: 'Approved' });

    assert.equal(result.status, 'Approved');
  });
});
