const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'report.routes.js'), 'utf8');

describe('SL-009 Admin report route boundaries', () => {
  for (const [pathName, handler] of [
    ['/admin/reports/overview', 'getAdminOverview'],
    ['/admin/reports/revenue', 'getRevenueReport'],
    ['/admin/reports/orders', 'getOrderReport'],
    ['/admin/reports/products', 'getProductReport'],
    ['/admin/reports/customers', 'getCustomerReport'],
    ['/admin/reports/staff', 'getStaffReport'],
    ['/admin/reports/inventory', 'getInventoryReport'],
  ]) {
    it(`keeps GET ${pathName} Admin-only`, () => {
      const escapedPath = pathName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(
        source,
        new RegExp(
          `router\\.get\\('${escapedPath}',\\s*authenticate,\\s*authorizeRoles\\('Admin'\\),\\s*reportController\\.${handler}\\)`,
        ),
      );
    });
  }

  it('exposes no report mutation route', () => {
    assert.doesNotMatch(source, /router\.(?:post|put|patch|delete)\(/);
  });
});
