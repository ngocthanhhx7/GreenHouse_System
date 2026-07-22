const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'payment.routes.js'), 'utf8');

describe('payment route security contract', () => {
  it('protects payment-link creation and exposes only the signature-verified payOS webhook publicly', () => {
    assert.match(source, /router\.post\('\/orders\/:id\/payments', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.post\('\/payments\/payos\/webhook', paymentController\.payosWebhook\)/);
    assert.doesNotMatch(source, /payments\/callback/);
  });
});
