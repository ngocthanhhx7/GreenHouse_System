const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'returnRefund.routes.js'), 'utf8');

describe('return/refund route role boundaries', () => {
  it('keeps inspection with Warehouse and refund completion with Staff', () => {
    assert.match(source, /router\.post\('\/warehouse\/return-refunds\/:id\/inspection', authenticate, authorizeRoles\('WarehouseManager'\)/);
    assert.match(source, /router\.post\('\/staff\/return-refunds\/:id\/complete-refund', authenticate, authorizeRoles\('Staff'\)/);
  });

  it('exposes a Warehouse-only queue and detail endpoint for inspection work', () => {
    assert.match(source, /router\.get\('\/warehouse\/return-refunds', authenticate, authorizeRoles\('WarehouseManager'\)/);
    assert.match(source, /router\.get\('\/warehouse\/return-refunds\/:id', authenticate, authorizeRoles\('WarehouseManager'\)/);
  });
});
