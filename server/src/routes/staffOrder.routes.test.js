const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'staffOrder.routes.js'), 'utf8');

describe('staff order route role boundaries', () => {
  it('exposes cancellation and invoices to Staff without a manual COD collection endpoint', () => {
    assert.match(source, /router\.post\('\/staff\/orders\/:id\/cancel', authenticate, authorizeRoles\('Staff'\)/);
    assert.doesNotMatch(source, /cod-collected/);
    assert.match(source, /router\.get\('\/staff\/orders\/:id\/invoice', authenticate, authorizeRoles\('Staff'\)/);
  });
});
