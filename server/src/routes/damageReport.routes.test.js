const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'damageReport.routes.js'), 'utf8');

describe('damage report route role boundaries', () => {
  it('allows Staff to create reports without exposing warehouse actions', () => {
    assert.match(source, /router\.post\('\/staff\/damage-reports', authenticate, authorizeRoles\('Staff'\)/);
  });

  it('keeps the queue, detail, and confirmation endpoints Warehouse-only', () => {
    assert.match(source, /router\.get\('\/warehouse\/damage-reports', authenticate, authorizeRoles\('WarehouseManager'\)/);
    assert.match(source, /router\.get\('\/warehouse\/damage-reports\/:id', authenticate, authorizeRoles\('WarehouseManager'\)/);
    assert.match(source, /router\.post\('\/warehouse\/damage-reports\/:id\/confirm', authenticate, authorizeRoles\('WarehouseManager'\)/);
  });
});
