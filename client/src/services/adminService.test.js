import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAdminService } from './adminService.js';

describe('client admin service', () => {
  it('fetches admin overview report without a query when no period is supplied', async () => {
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

  it('fetches the admin overview report with encoded reporting dates', async () => {
    const service = createAdminService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/admin/reports/overview?from=2026-07-01&to=2026-07-31');
        return { ok: true, json: async () => ({ success: true, data: { orders: { total: 3 } } }) };
      },
    });

    await service.getOverviewReport({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('sends a versioned complete settings command with its idempotency identity', async () => {
    const service = createAdminService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/admin/settings');
        assert.equal(options.method, 'PATCH');
        assert.equal(options.headers['Idempotency-Key'], 'settings-client-001');
        assert.deepEqual(JSON.parse(options.body), {
          expectedVersion: 3,
          reason: 'Cập nhật ngưỡng kho',
          values: { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: 10 },
        });
        return { ok: true, json: async () => ({ success: true, data: { current: { version: 4 } } }) };
      },
    });

    const result = await service.updateSettings({
      expectedVersion: 3,
      reason: 'Cập nhật ngưỡng kho',
      values: { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: 10 },
    }, 'settings-client-001');

    assert.equal(result.current.version, 4);
  });

  it('fetches admin audit logs with query filters', async () => {
    const service = createAdminService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/admin/audit-logs?action=ORDER_CREATE&userId=user-1');
        return { ok: true, json: async () => ({ success: true, data: { total: 1, items: [{ id: 'audit-1' }] } }) };
      },
    });

    const result = await service.listAuditLogs({ action: 'ORDER_CREATE', userId: 'user-1' });

    assert.equal(result.total, 1);
  });
});
