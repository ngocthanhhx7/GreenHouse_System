import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getWarehouseDashboardStats } from './warehouseDashboardStats.js';

describe('getWarehouseDashboardStats', () => {
  it('uses totals from API envelopes and counts only pending stock exports', () => {
    const stats = getWarehouseDashboardStats({
      inventory: { items: [{ id: 'item-1' }], total: 8 },
      lowStock: { items: [], total: 0 },
      stockExports: {
        items: [
          { id: 'export-1', status: 'Pending' },
          { id: 'export-2', status: 'Approved' },
          { id: 'export-3', status: 'pending' },
        ],
        total: 3,
      },
    });

    assert.deepEqual(stats, {
      totalItems: 8,
      lowStock: 0,
      pendingExports: 1,
    });
  });

  it('supports legacy array responses', () => {
    const stats = getWarehouseDashboardStats({
      inventory: [{ id: 'item-1' }, { id: 'item-2' }],
      lowStock: [{ id: 'low-1' }],
      stockExports: [{ status: 'Pending' }, { status: 'Rejected' }],
    });

    assert.deepEqual(stats, {
      totalItems: 2,
      lowStock: 1,
      pendingExports: 1,
    });
  });

  it('keeps metrics unknown when required response data is malformed or unavailable', () => {
    const stats = getWarehouseDashboardStats({
      inventory: { items: [] },
      lowStock: null,
      stockExports: { total: 3 },
    });

    assert.deepEqual(stats, {
      totalItems: null,
      lowStock: null,
      pendingExports: null,
    });
  });

  it('requires items alongside total in inventory and low-stock envelopes', () => {
    const stats = getWarehouseDashboardStats({
      inventory: { total: 8 },
      lowStock: { total: 8 },
      stockExports: [],
    });

    assert.deepEqual(stats, {
      totalItems: null,
      lowStock: null,
      pendingExports: 0,
    });
  });

  it('keeps inventory and low-stock metrics unknown for fractional totals', () => {
    const stats = getWarehouseDashboardStats({
      inventory: { items: [], total: 8.5 },
      lowStock: { items: [], total: 0.5 },
      stockExports: [],
    });

    assert.deepEqual(stats, {
      totalItems: null,
      lowStock: null,
      pendingExports: 0,
    });
  });

  it('keeps pending exports unknown when its envelope total is invalid', () => {
    const invalidEnvelopes = [
      { items: [] },
      { items: [], total: -1 },
      { items: [], total: 1.5 },
    ];

    for (const stockExports of invalidEnvelopes) {
      const stats = getWarehouseDashboardStats({
        inventory: [],
        lowStock: [],
        stockExports,
      });

      assert.equal(stats.pendingExports, null);
    }
  });
});
