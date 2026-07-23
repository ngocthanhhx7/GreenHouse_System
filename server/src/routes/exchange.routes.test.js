const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'exchange.routes.js'), 'utf8');

describe('Exchange route actor boundaries', () => {
  it('keeps Customer commands on owned Exchange routes', () => {
    assert.match(source, /router\.post\('\/orders\/:id\/exchanges', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.post\('\/exchanges\/:id\/handoff-proof', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.post\('\/exchanges\/:id\/cancel', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.post\('\/exchanges\/:id\/stock-choice', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.post\('\/exchanges\/:id\/shipments\/:shipmentId\/disputes', authenticate, authorizeRoles\('Customer'\)/);
  });

  it('keeps eligibility and evidence-backed delivery fallback with Staff', () => {
    assert.match(source, /router\.patch\('\/staff\/exchanges\/:id\/decision', authenticate, authorizeRoles\('Staff'\)/);
    assert.match(source, /router\.post\('\/staff\/exchanges\/:id\/shipments\/:shipmentId\/events', authenticate, authorizeRoles\('Staff'\)/);
    assert.match(source, /router\.post\('\/staff\/exchanges\/:id\/resend', authenticate, authorizeRoles\('Staff'\)/);
  });

  it('keeps receipt, inspection, and outbound fulfillment with Warehouse', () => {
    assert.match(source, /router\.post\('\/warehouse\/exchanges\/:id\/receipt', authenticate, authorizeRoles\('WarehouseManager'\)/);
    assert.match(source, /router\.post\('\/warehouse\/exchanges\/:id\/inspection', authenticate, authorizeRoles\('WarehouseManager'\)/);
    assert.match(source, /router\.post\('\/warehouse\/exchanges\/:id\/shipments', authenticate, authorizeRoles\('WarehouseManager'\)/);
  });

  it('accepts direct Carrier events only through signed middleware', () => {
    assert.match(source, /router\.post\('\/carrier\/exchanges\/shipments\/:shipmentId\/events', carrierSignature/);
  });
});
