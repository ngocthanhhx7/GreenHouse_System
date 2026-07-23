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

  it('keeps handoff and destination submission with the owning Customer', () => {
    assert.match(source, /router\.post\('\/return-refunds\/:id\/handoff-proof', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.post\('\/return-refunds\/:id\/destination', authenticate, authorizeRoles\('Customer'\)/);
  });

  it('keeps destination verification, expiry, manual evidence, and payOS payout reconciliation with Staff', () => {
    assert.match(source, /router\.patch\('\/staff\/return-refunds\/:id\/destination', authenticate, authorizeRoles\('Staff'\)/);
    assert.match(source, /router\.post\('\/staff\/return-refunds\/:id\/expire', authenticate, authorizeRoles\('Staff'\)/);
    assert.match(source, /router\.post\('\/staff\/return-refunds\/:id\/payout-evidence', authenticate, authorizeRoles\('Staff'\)/);
    assert.match(source, /router\.post\('\/staff\/return-refunds\/:id\/payos-payout', authenticate, authorizeRoles\('Staff'\)/);
    assert.match(source, /router\.post\('\/staff\/return-refunds\/:id\/payos-reconcile', authenticate, authorizeRoles\('Staff'\)/);
    assert.match(source, /router\.post\('\/staff\/return-refunds\/:id\/payout-incident', authenticate, authorizeRoles\('Staff'\)/);
  });

  it('exposes a Warehouse-only queue and detail endpoint for inspection work', () => {
    assert.match(source, /router\.get\('\/warehouse\/return-refunds', authenticate, authorizeRoles\('WarehouseManager'\)/);
    assert.match(source, /router\.get\('\/warehouse\/return-refunds\/:id', authenticate, authorizeRoles\('WarehouseManager'\)/);
  });
});
