const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, it } = require('node:test');

function source(relativePath) {
  return readFileSync(join(__dirname, '..', relativePath), 'utf8');
}

describe('SL-004 route actor and command boundaries', () => {
  it('exposes exact Staff fulfillment commands and no generic fulfillment status mutation', () => {
    const routes = source('routes/fulfillment.routes.js');
    const controller = source('controller/fulfillment.controller.js');
    assert.match(routes, /\/staff\/orders\/:id\/packing/);
    assert.match(routes, /\/staff\/orders\/:id\/shipments/);
    assert.match(routes, /\/staff\/shipments\/:shipmentId\/events/);
    assert.match(routes, /\/staff\/orders\/:id\/delivery-resolution/);
    assert.match(routes, /authorizeRoles\('Staff'\)/);
    assert.match(controller, /source:\s*'STAFF_EVIDENCE'/);
    assert.doesNotMatch(routes, /\/status/);
  });

  it('uses one exact Warehouse export command and a complete returned-receipt boundary', () => {
    const fulfillmentRoutes = source('routes/fulfillment.routes.js');
    const inventoryRoutes = source('routes/inventory.routes.js');
    assert.match(inventoryRoutes, /post\('\/warehouse\/stock-exports\/:id\/process'/);
    assert.doesNotMatch(inventoryRoutes, /stock-exports\/:id\/status/);
    assert.match(fulfillmentRoutes, /get\('\/warehouse\/returned-parcels'/);
    assert.match(fulfillmentRoutes, /\/warehouse\/shipments\/:shipmentId\/returned-receipt/);
    assert.match(fulfillmentRoutes, /authorizeRoles\('WarehouseManager'\)/);
  });

  it('keeps Customer mutations owner-authenticated and Carrier events signature-only', () => {
    const routes = source('routes/fulfillment.routes.js');
    assert.match(routes, /authorizeRoles\('Customer'\)/);
    assert.match(routes, /\/orders\/:id\/fulfillment/);
    assert.match(routes, /\/orders\/:id\/destination-corrections/);
    assert.match(routes, /\/orders\/:id\/delivery-incidents\/:incidentId\/choice/);
    assert.match(routes, /\/carrier\/shipments\/:shipmentId\/events', carrierSignature/);
    assert.doesNotMatch(routes, /authorizeRoles\([^)]*['"]Carrier['"]/);
  });

  it('mounts the fulfillment route and retires the separate Staff stock-export request', () => {
    assert.match(source('app.js'), /fulfillmentRoutes/);
    assert.doesNotMatch(source('routes/staffOrder.routes.js'), /\/staff\/orders\/:id\/stock-export/);
  });
});
