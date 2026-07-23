const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { describe, it } = require('node:test');

const { createCarrierSignature } = require('./carrierSignature.middleware');

describe('carrier signature middleware', () => {
  it('accepts a signature over the raw request body and rejects a tampered body', async () => {
    const secret = 'carrier-test-secret';
    const rawBody = Buffer.from('{"eventId":"evt-1","amount":100}');
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const middleware = createCarrierSignature({ secret });
    const accepted = { headers: { 'x-carrier-signature': signature }, rawBody, body: { eventId: 'evt-1', amount: 100 } };
    let nextCalled = false;
    await middleware(accepted, { status() { return this; }, json() {} }, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    const rejected = { ...accepted, rawBody: Buffer.from('{"eventId":"evt-1","amount":101}') };
    let rejectedNext = false;
    await middleware(rejected, { status() { return this; }, json() {} }, () => { rejectedNext = true; });
    assert.equal(rejectedNext, false);
  });
});
