const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createLowStockAlertLifecycle } = require('./lowStockAlertLifecycle.service');

function createRepository() {
  const alerts = [];
  return {
    alerts,
    async findDefaultThreshold() { return 5; },
    async findOpen(productId) {
      return alerts.find((alert) => alert.productId === productId && alert.status === 'Open') || null;
    },
    async createOpen(data) {
      if (alerts.some((alert) => alert.productId === data.productId && alert.status === 'Open')) {
        const error = new Error('duplicate open alert');
        error.code = 11000;
        throw error;
      }
      const alert = { _id: `alert-${alerts.length + 1}`, ...data };
      alerts.push(alert);
      return alert;
    },
    async refreshOpen(id, data) {
      const alert = alerts.find((entry) => entry._id === id && entry.status === 'Open');
      if (!alert) return null;
      Object.assign(alert, data);
      return alert;
    },
    async resolveOpen(id, data) {
      const alert = alerts.find((entry) => entry._id === id && entry.status === 'Open');
      if (!alert) return null;
      Object.assign(alert, { status: 'Resolved', ...data });
      return alert;
    },
  };
}

describe('low stock alert lifecycle', () => {
  it('opens once, refreshes while low, resolves above threshold, and opens a new lifecycle on recross', async () => {
    const repository = createRepository();
    const lifecycle = createLowStockAlertLifecycle({
      repository,
      clock: () => new Date('2026-07-23T00:00:00.000Z'),
    });
    const inventory = {
      _id: 'inventory-1',
      productId: 'product-1',
      sellableQuantity: 5,
      reservedQuantity: 0,
      inventoryHealth: 'Normal',
      lowStockThresholdOverride: null,
    };

    const opened = await lifecycle.evaluate(inventory, { eventKey: 'count:1' });
    const refreshed = await lifecycle.evaluate({ ...inventory, sellableQuantity: 4 }, { eventKey: 'count:2' });
    const resolved = await lifecycle.evaluate({ ...inventory, sellableQuantity: 6 }, { eventKey: 'receipt:1' });
    const reopened = await lifecycle.evaluate({ ...inventory, sellableQuantity: 5 }, { eventKey: 'export:1' });

    assert.equal(opened.opened, true);
    assert.equal(refreshed.opened, false);
    assert.equal(resolved.resolved, true);
    assert.equal(reopened.opened, true);
    assert.equal(repository.alerts.length, 2);
    assert.equal(repository.alerts.filter((alert) => alert.status === 'Open').length, 1);
  });

  it('uses zero availability while inventory reconciliation is required', async () => {
    const repository = createRepository();
    const lifecycle = createLowStockAlertLifecycle({ repository });
    const result = await lifecycle.evaluate({
      _id: 'inventory-1',
      productId: 'product-1',
      sellableQuantity: 10,
      reservedQuantity: 12,
      inventoryHealth: 'ReconciliationRequired',
      lowStockThresholdOverride: 0,
    }, { eventKey: 'damage:1' });

    assert.equal(result.availableQuantity, 0);
    assert.equal(result.opened, true);
  });
});
