import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createInventoryService } from './inventoryService.js';

describe('client inventory service', () => {
  it('returns the inventory envelope from the inventory endpoint', async () => {
    const envelope = { items: [{ productName: 'Green Ceramic Frying Pan' }], total: 8 };
    const service = createInventoryService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        assert.equal(url, 'http://api.test/api/warehouse/inventory');
        assert.equal(options.method || 'GET', 'GET');
        return {
          ok: true,
          json: async () => ({ success: true, data: envelope }),
        };
      },
    });

    const result = await service.listInventory();

    assert.deepEqual(result, envelope);
  });

  it('returns the low-stock envelope from the low-stock endpoint', async () => {
    const envelope = { items: [], total: 0 };
    const service = createInventoryService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        assert.equal(url, 'http://api.test/api/warehouse/inventory/low-stock');
        assert.equal(options.method || 'GET', 'GET');
        return {
          ok: true,
          json: async () => ({ success: true, data: envelope }),
        };
      },
    });

    const result = await service.listLowStock();

    assert.deepEqual(result, envelope);
  });

  it('returns the stock-export envelope from the stock-exports endpoint', async () => {
    const envelope = { items: [{ id: 'export-1', status: 'Pending' }], total: 1 };
    const service = createInventoryService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        assert.equal(url, 'http://api.test/api/warehouse/stock-exports');
        assert.equal(options.method || 'GET', 'GET');
        return {
          ok: true,
          json: async () => ({ success: true, data: envelope }),
        };
      },
    });

    const result = await service.listStockExports();

    assert.deepEqual(result, envelope);
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
