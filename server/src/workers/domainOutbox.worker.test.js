const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createDomainOutboxWorker } = require('./domainOutbox.worker');

describe('domain outbox worker', () => {
  it('continues draining later domain handlers when one handler fails', async () => {
    const calls = [];
    const errors = [];
    const worker = createDomainOutboxWorker({
      services: [
        {
          async drainPostCommitWork() {
            calls.push('order');
            throw new Error('order outbox unavailable');
          },
        },
        {
          async drainPostCommitWork() {
            calls.push('payment');
          },
        },
      ],
      logger: { error(...args) { errors.push(args); } },
    });

    await worker.runOnce();

    assert.deepEqual(calls, ['order', 'payment']);
    assert.equal(errors.length, 1);
  });

  it('drains every registered domain handler without overlapping and stops cleanly', async () => {
    const calls = [];
    let active = 0;
    let maxActive = 0;
    const makeService = (name) => ({
      async drainPostCommitWork() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        calls.push(name);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      },
    });
    const worker = createDomainOutboxWorker({
      services: [makeService('order'), makeService('payment'), makeService('expiry')],
      intervalMs: 10,
      logger: { error() {} },
    });

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 45));
    worker.stop();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const callsAfterStop = calls.length;
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.equal(maxActive, 1);
    assert.ok(calls.includes('order'));
    assert.ok(calls.includes('payment'));
    assert.ok(calls.includes('expiry'));
    assert.equal(calls.length, callsAfterStop);
  });
});
