const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createOrderPaymentExpiryWorker } = require('./orderPaymentExpiry.worker');

describe('order payment expiry worker', () => {
  it('drains the order expiry command without overlap and stops cleanly', async () => {
    let runs = 0;
    let resolveRun;
    const service = {
      async expireOverdueOrders() {
        runs += 1;
        await new Promise((resolve) => { resolveRun = resolve; });
        return { expired: 1 };
      },
    };
    const worker = createOrderPaymentExpiryWorker({ service, intervalMs: 10, logger: { error() {} } });

    const first = worker.drainOnce();
    assert.equal(await worker.drainOnce(), null);
    assert.equal(runs, 1);
    resolveRun();
    assert.deepEqual(await first, { expired: 1 });

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    worker.stop();
    resolveRun?.();
    assert.equal(worker.isRunning(), false);
    assert.ok(runs >= 2);
  });
});
