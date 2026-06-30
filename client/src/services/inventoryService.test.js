import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createInventoryService } from './inventoryService.js';

describe('client inventory service', () => {
  it('lists warehouse inventory', async () => {
    const service = createInventoryService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        assert.equal(url, 'http://api.test/api/warehouse/inventory');
        assert.equal(options.method || 'GET', 'GET');
        return {
          ok: true,
          json: async () => ({ success: true, data: { items: [{ productName: 'Green Ceramic Frying Pan' }] } }),
        };
      },
    });

    const result = await service.listInventory();

    assert.equal(result.items[0].productName, 'Green Ceramic Frying Pan');
  });

  it('updates stock export request status', async () => {
    const service = createInventoryService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/warehouse/stock-exports/export-1/status');
        assert.equal(options.method, 'PATCH');
        return {
          ok: true,
          json: async () => ({ success: true, data: { stockExport: { status: 'Approved' } } }),
        };
      },
    });

    const result = await service.updateStockExportStatus('export-1', { status: 'Approved' });

    assert.equal(result.stockExport.status, 'Approved');
  });
});
