const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  commandKey,
  requestJson,
} = require('./verifyPhase1E2E');

function fakeFetcher(response) {
  return async () => ({
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    headers: { get() { return null; } },
    async json() { return response.body; },
  });
}

describe('phase 1 E2E runner helpers', () => {
  it('fails the report when a response has the wrong status or error envelope', async () => {
    await assert.rejects(
      requestJson(fakeFetcher({
        status: 403,
        body: { success: false, errorCode: 'FORBIDDEN' },
      }), 'http://api.test', '/x'),
      /FORBIDDEN/,
    );
  });

  it('uses one stable key for a retryable command', () => {
    assert.equal(commandKey('checkout', 'order-1'), commandKey('checkout', 'order-1'));
  });
});
