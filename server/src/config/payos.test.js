const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { buildRedirectUrl, createPayOSGateway } = require('./payos');

describe('payOS configuration', () => {
  it('injects the internal order id into configured return URLs', () => {
    assert.equal(
      buildRedirectUrl('http://localhost:5173/payments/result/{orderId}', 'order-1'),
      'http://localhost:5173/payments/result/order-1'
    );
    assert.equal(
      buildRedirectUrl('http://localhost:5173/payments/result', 'order-1'),
      'http://localhost:5173/payments/result?orderId=order-1'
    );
  });

  it('reports missing credentials without exposing secret values', () => {
    const gateway = createPayOSGateway({ clientId: '', apiKey: '', checksumKey: '' });
    assert.equal(gateway.isConfigured(), false);
  });
});
