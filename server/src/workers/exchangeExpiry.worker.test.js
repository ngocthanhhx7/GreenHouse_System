const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createExchangeExpiryWorker } = require('./exchangeExpiry.worker');

describe('Exchange expiry worker', () => {
  it('runs the expiry command without overlapping and can stop cleanly', async () => {
    let runs = 0;
    const worker = createExchangeExpiryWorker({
      service: { async expireOverdueRequests() { runs += 1; return { expired: 0 }; } },
      intervalMs: 10,
      logger: { error() {} },
    });
    await worker.drainOnce();
    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 25));
    worker.stop();
    assert.ok(runs >= 2);
    assert.equal(worker.isRunning(), false);
  });
});
