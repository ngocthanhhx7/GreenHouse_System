const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const packageJson = require('../../package.json');
const {
  DEMO_CATEGORIES,
  DEMO_ORDER_SPECS,
  DEMO_PRODUCTS,
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
  });
});
