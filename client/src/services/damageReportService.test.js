import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDamageReportService } from './damageReportService.js';

describe('client damage report service contract', () => {
  it('exposes Staff report and Warehouse decision boundaries', async () => {
    const calls = [];
    const service = createDamageReportService({
      baseUrl: '/api',
      fetcher: async (url, options = {}) => {
        calls.push({ url, options });
        return { ok: true, async json() { return { success: true, data: { ok: true } }; } };
      },
    });
    await service.createStaffReport({ inventoryId: 'inv-1', reportedQuantity: 1, evidence: [{ reference: 'x' }] });
    await service.decideWarehouseReport('damage-1', { confirmedQuantity: 1, decisionReason: 'Verified', evidence: [{ reference: 'y' }] });
    assert.equal(calls[0].url, '/api/staff/damage-reports');
    assert.equal(calls[1].url, '/api/warehouse/damage-reports/damage-1/decision');
  });
});
