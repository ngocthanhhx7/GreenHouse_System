const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createReturnEvidenceRetentionWorker } = require('./returnEvidenceRetention.worker');

describe('return evidence retention worker', () => {
  it('runs cleanup without overlap and can stop cleanly', async () => {
    let runs = 0;
    const worker = createReturnEvidenceRetentionWorker({
      service: { async cleanup() { runs += 1; return { scanned: 0 }; } },
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
