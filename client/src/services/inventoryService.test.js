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

  it('processes a stock export with a stable idempotency key', async () => {
    const service = createInventoryService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/warehouse/stock-exports/export-1/process');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['Idempotency-Key'], 'export-command-1');
        assert.equal(options.body, JSON.stringify({}));
        return {
          ok: true,
          json: async () => ({ success: true, data: { stockExport: { status: 'Completed' } } }),
        };
      },
    });

    const result = await service.processStockExport('export-1', {
      idempotencyKey: 'export-command-1',
    });

    assert.equal(result.stockExport.status, 'Completed');
  });
});
