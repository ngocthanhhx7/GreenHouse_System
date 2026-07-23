const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { describe, it } = require('node:test');

const { createCarrierSignature } = require('./carrierSignature.middleware');

describe('carrier signature middleware', () => {
  const now = new Date('2026-07-23T10:00:00.000Z');

  function signature(secret, timestamp, method, path, rawBody) {
    return crypto.createHmac('sha256', secret)
      .update(`${timestamp}\n${method}\n${path}\n`)
      .update(rawBody)
      .digest('hex');
  }

  function responseRecorder() {
    return {
      statusCode: 200,
      body: null,
      status(value) { this.statusCode = value; return this; },
      json(value) { this.body = value; return this; },
    };
  }

  it('accepts a canonical signature bound to timestamp, method, path, and raw body', async () => {
    const secret = 'carrier-test-secret';
    const rawBody = Buffer.from('{"eventId":"evt-1","amount":100}');
    const timestamp = now.toISOString();
    const method = 'POST';
    const originalUrl = '/api/carrier/exchanges/shipments/shipment-1/events';
    const supplied = signature(secret, timestamp, method, originalUrl, rawBody);
    const middleware = createCarrierSignature({ secret, clock: () => now });
    const accepted = {
      method,
      originalUrl,
      headers: { 'x-carrier-signature': supplied, 'x-carrier-timestamp': timestamp },
      rawBody,
      body: { eventId: 'evt-1', amount: 100 },
    };
    let nextCalled = false;
    await middleware(accepted, responseRecorder(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('rejects replaying a valid signed payload against another shipment path', async () => {
    const secret = 'carrier-test-secret';
    const timestamp = now.toISOString();
    const rawBody = Buffer.from('{"eventId":"evt-1"}');
    const originalUrl = '/api/carrier/exchanges/shipments/shipment-1/events';
    const supplied = signature(secret, timestamp, 'POST', originalUrl, rawBody);
    const middleware = createCarrierSignature({ secret, clock: () => now });
    const replay = {
      method: 'POST',
      originalUrl: '/api/carrier/exchanges/shipments/shipment-2/events',
      headers: { 'x-carrier-signature': supplied, 'x-carrier-timestamp': timestamp },
      rawBody,
      body: { eventId: 'evt-1' },
    };
    let nextCalled = false;
    const response = responseRecorder();
    await middleware(replay, response, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 401);
  });

  it('rejects a correctly signed timestamp outside the five-minute replay window', async () => {
    const secret = 'carrier-test-secret';
    const timestamp = '2026-07-23T09:54:59.000Z';
    const rawBody = Buffer.from('{"eventId":"evt-old"}');
    const originalUrl = '/api/carrier/exchanges/shipments/shipment-1/events';
    const supplied = signature(secret, timestamp, 'POST', originalUrl, rawBody);
    const middleware = createCarrierSignature({ secret, clock: () => now });
    const request = {
      method: 'POST',
      originalUrl,
      headers: { 'x-carrier-signature': supplied, 'x-carrier-timestamp': timestamp },
      rawBody,
      body: { eventId: 'evt-old' },
    };
    let nextCalled = false;
    const response = responseRecorder();
    await middleware(request, response, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 401);
  });
});
