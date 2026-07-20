const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'staffOrder.routes.js'), 'utf8');

describe('staff order route role boundaries', () => {
  it('exposes cancellation, COD collection, and invoices only to Staff', () => {
    assert.match(source, /router\.post\('\/staff\/orders\/:id\/cancel', authenticate, authorizeRoles\('Staff'\)/);
    assert.match(source, /router\.post\('\/staff\/orders\/:id\/cod-collected', authenticate, authorizeRoles\('Staff'\)/);
    assert.match(source, /router\.get\('\/staff\/orders\/:id\/invoice', authenticate, authorizeRoles\('Staff'\)/);
  });
});
