const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'order.routes.js'), 'utf8');

describe('customer order route role boundaries', () => {
  it('keeps list, detail and cancellation behind Customer authentication', () => {
    assert.match(source, /router\.get\('\/orders\/my', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.get\('\/orders\/:id', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.patch\('\/orders\/:id\/cancel', authenticate, authorizeRoles\('Customer'\)/);
  });

  it('does not accept a frontend role or customer identity in route declarations', () => {
    assert.doesNotMatch(source, /req\.body\.(role|userId|customerId)/);
  });
});
