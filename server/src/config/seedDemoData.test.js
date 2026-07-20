const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const packageJson = require('../../package.json');
const {
  DEMO_AUDIT_SPECS,
  DEMO_CATEGORIES,
  DEMO_NOTIFICATION_SPECS,
  DEMO_ORDER_SPECS,
  DEMO_RETURN_REFUND_SPECS,
  DEMO_PRODUCTS,
  DEMO_REVIEW_SPECS,
  DEMO_SETTING_SPECS,
  DEMO_SUPPORT_SPECS,
  DEMO_USERS,
} = require('./seedDemoData');

describe('demo data seed config', () => {
  it('provides one runnable npm command for consistent demo data', () => {
    assert.equal(packageJson.scripts['seed:demo'], 'node src/config/seedDemoData.js');
    const scriptSource = readFileSync(path.join(__dirname, 'seedDemoData.js'), 'utf8');
    assert.match(scriptSource, /seedDemoData/);
  });

  it('includes demo accounts for every application role', () => {
    const roles = DEMO_USERS.map((user) => user.roleName).sort();

    assert.deepEqual(roles, ['Admin', 'Customer', 'Staff', 'WarehouseManager']);
    assert.ok(DEMO_USERS.every((user) => user.email.endsWith('@greenhome.test')));
  });

  it('includes catalog and staff order demo records', () => {
    assert.ok(DEMO_CATEGORIES.length >= 4);
    assert.ok(DEMO_PRODUCTS.length >= 8);
    assert.ok(DEMO_PRODUCTS.every((product) => product.stockQuantity > 0));
    assert.ok(DEMO_ORDER_SPECS.some((order) => order.orderStatus === 'Pending'));
    assert.ok(DEMO_ORDER_SPECS.some((order) => order.orderStatus === 'Confirmed'));
    assert.ok(DEMO_ORDER_SPECS.some((order) => order.orderStatus === 'StockExportRequested'));
    assert.ok(DEMO_ORDER_SPECS.some((order) => order.orderStatus === 'Delivered'));
    assert.ok(DEMO_RETURN_REFUND_SPECS.some((request) => request.orderCode === 'GH-DEMO-1004'));
    assert.ok(DEMO_SUPPORT_SPECS.some((request) => request.orderCode === 'GH-DEMO-1004'));
    assert.ok(DEMO_REVIEW_SPECS.some((review) => review.productName === 'Minimal Dinner Plate Set'));
    assert.ok(DEMO_SETTING_SPECS.some((setting) => setting.key === 'lowStockDefaultThreshold'));
  });

  it('includes notification demo records for every signed-in role', () => {
    const notificationRoles = DEMO_NOTIFICATION_SPECS.map((notification) => notification.roleName).sort();

    assert.deepEqual(notificationRoles, ['Admin', 'Customer', 'Staff', 'WarehouseManager']);
    assert.ok(DEMO_NOTIFICATION_SPECS.every((notification) => notification.channel === 'InApp'));
    assert.ok(DEMO_NOTIFICATION_SPECS.every((notification) => notification.subject.trim()));
  });

  it('includes audit demo records for mentor review', () => {
    const actions = DEMO_AUDIT_SPECS.map((entry) => entry.action);

    assert.ok(actions.includes('AUTH_LOGIN_SUCCESS'));
    assert.ok(actions.includes('ORDER_CREATE'));
    assert.ok(actions.includes('RETURN_REFUND_APPROVED_FOR_INSPECTION'));
  });
});
