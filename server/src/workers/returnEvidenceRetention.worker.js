function createReturnEvidenceRetentionWorker({ service, intervalMs = 6 * 60 * 60 * 1000, logger = console } = {}) {
  if (!service || typeof service.cleanup !== 'function') {
    throw new Error('return evidence retention service with cleanup is required');
  }
  let timer = null;
  let running = false;

  async function drainOnce() {
    if (running) return null;
    running = true;
    try {
      return await service.cleanup();
    } catch (error) {
      logger.error('Return evidence retention worker failed:', error);
      return null;
    } finally {
      running = false;
    }
  }

  return {
    drainOnce,
    start() {
      if (timer) return;
      timer = setInterval(() => { void drainOnce(); }, intervalMs);
      timer.unref?.();
      void drainOnce();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    isRunning() { return Boolean(timer); },
  };
}

module.exports = { createReturnEvidenceRetentionWorker };
