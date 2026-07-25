const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createLowStockAlertLifecycle } = require('./lowStockAlertLifecycle.service');
const { renderNotification } = require('../utils/notificationContract');

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

  it('publishes LOW_STOCK_OPENED with the exact safe facts required by its rendered copy', async () => {
    const repository = createRepository();
    repository.findProductName = async (productId) => {
      assert.equal(productId, 'product-1');
      return 'Monstera Deliciosa';
    };
    const events = [];
    const lifecycle = createLowStockAlertLifecycle({
      repository,
      eventPublisher: { async publishDomainEvent(event) { events.push(event); } },
    });

    await lifecycle.evaluate({
      _id: 'inventory-1',
      productId: 'product-1',
      sellableQuantity: 2,
      reservedQuantity: 0,
      inventoryHealth: 'Normal',
      lowStockThresholdOverride: 5,
    }, { eventKey: 'count:product-1' });

    assert.equal(events.length, 1);
    assert.deepEqual(events[0].displayValues, {
      productName: 'Monstera Deliciosa',
      availableQuantity: 2,
      effectiveThreshold: 5,
    });
    assert.deepEqual(Object.keys(events[0].displayValues).sort(), [
      'availableQuantity', 'effectiveThreshold', 'productName',
    ]);
    const rendered = renderNotification(
      events[0].type,
      events[0].type,
      events[0].displayValues,
    );
    assert.match(rendered.content, /Monstera Deliciosa/);
    assert.match(rendered.content, /2/);
    assert.match(rendered.content, /5/);
    assert.doesNotMatch(`${rendered.subject} ${rendered.content}`, /\{[A-Za-z]+\}/);
  });

  it('uses the claimed global setting version while preserving the Product override', async () => {
    const repository = createRepository();
    let fallbackReads = 0;
    repository.findDefaultThreshold = async () => { fallbackReads += 1; return 5; };
    const lifecycle = createLowStockAlertLifecycle({ repository });
    const base = {
      _id: 'inventory-global',
      productId: 'product-global',
      sellableQuantity: 9,
      reservedQuantity: 0,
      inventoryHealth: 'Normal',
      lowStockThresholdOverride: null,
    };

    const global = await lifecycle.evaluate(base, {
      eventKey: 'system-settings:8',
      settingVersion: 8,
      globalThreshold: 10,
    });
    const override = await lifecycle.evaluate({
      ...base,
      _id: 'inventory-override',
      productId: 'product-override',
      lowStockThresholdOverride: 3,
    }, {
      eventKey: 'system-settings:8',
      settingVersion: 8,
      globalThreshold: 10,
    });
    await lifecycle.evaluate({ ...base, sellableQuantity: 8 }, { eventKey: 'inventory:later' });

    assert.equal(global.effectiveThreshold, 10);
    assert.equal(global.opened, true);
    assert.equal(global.alert.settingVersion, 8);
    assert.equal(override.effectiveThreshold, 3);
    assert.equal(override.opened, false);
    assert.equal(global.alert.settingVersion, 8, 'later non-setting evaluations must not erase version provenance');
    assert.equal(fallbackReads, 1);
  });

  it('does not let a stale claimed setting version refresh or resolve a newer open lifecycle', async () => {
    const repository = createRepository();
    repository.alerts.push({
      _id: 'alert-newer',
      productId: 'product-1',
      inventoryId: 'inventory-1',
      status: 'Open',
      availableQuantity: 9,
      effectiveThreshold: 10,
      settingVersion: 2,
      crossingKey: 'system-settings:2',
    });
    const lifecycle = createLowStockAlertLifecycle({ repository });

    const result = await lifecycle.evaluate({
      _id: 'inventory-1',
      productId: 'product-1',
      sellableQuantity: 9,
      reservedQuantity: 0,
      inventoryHealth: 'Normal',
      lowStockThresholdOverride: null,
    }, {
      eventKey: 'system-settings:1',
      settingVersion: 1,
      globalThreshold: 4,
      replay: true,
    });

    assert.equal(result.staleSettingVersion, true);
    assert.equal(result.resolved, false);
    assert.equal(repository.alerts[0].status, 'Open');
    assert.equal(repository.alerts[0].effectiveThreshold, 10);
    assert.equal(repository.alerts[0].settingVersion, 2);
    assert.equal(repository.alerts[0].crossingKey, 'system-settings:2');
  });
});
