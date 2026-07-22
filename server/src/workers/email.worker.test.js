const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createEmailWorker } = require('./email.worker');

describe('email outbox worker', () => {
  it('drains pending outbox work and can be stopped cleanly', async () => {
    let deliveries = 0;
    const worker = createEmailWorker({
      outboxService: { async deliverNext() { deliveries += 1; return deliveries === 1 ? { status: 'Sent' } : null; } },
      intervalMs: 10,
      logger: { error() {} },
    });

    await worker.drainOnce();
    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 25));
    worker.stop();

    assert.ok(deliveries >= 2);
    assert.equal(worker.isRunning(), false);
  });
});
