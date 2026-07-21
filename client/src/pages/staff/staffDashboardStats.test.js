import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toStaffDashboardStats } from './staffDashboardStats.js';

describe('toStaffDashboardStats', () => {
  it('uses response totals instead of the number of returned items', () => {
    const stats = toStaffDashboardStats({
      orders: { items: [{ id: 'order-1' }], total: 12 },
      returns: { items: [{ id: 'return-1' }], total: 8 },
      newSupport: { items: [{ id: 'support-1' }], total: 3 },
      openSupport: { items: [], total: 0 },
      inProgressSupport: { items: [{ id: 'support-2' }], total: 4 },
    });

    assert.deepEqual(stats, {
      pendingOrders: 12,
      pendingReturns: 8,
      openSupport: 7,
    });
  });

  it('falls back to legacy item arrays when a total is unavailable', () => {
    const stats = toStaffDashboardStats({
      orders: { items: [{ id: 'order-1' }, { id: 'order-2' }] },
      returns: { items: [{ id: 'return-1' }] },
      newSupport: { items: [{ id: 'support-1' }] },
      openSupport: { items: [] },
      inProgressSupport: { items: [{ id: 'support-2' }, { id: 'support-3' }] },
    });

    assert.deepEqual(stats, {
      pendingOrders: 2,
      pendingReturns: 1,
      openSupport: 3,
    });
  });

  it('includes legacy Open support requests in the open support total', () => {
    const stats = toStaffDashboardStats({
      orders: { total: 0 },
      returns: { total: 0 },
      newSupport: { total: 1 },
      openSupport: { total: 2 },
      inProgressSupport: { total: 3 },
    });

    assert.equal(stats.openSupport, 6);
  });

  it('keeps an unavailable response unknown instead of treating it as zero', () => {
    const stats = toStaffDashboardStats({
      orders: null,
      returns: { total: 0 },
      newSupport: { total: 1 },
      openSupport: { total: 0 },
      inProgressSupport: null,
    });

    assert.deepEqual(stats, {
      pendingOrders: null,
      pendingReturns: 0,
      openSupport: null,
    });
  });
});
