function createExchangeExpiryWorker({ service, intervalMs = 60_000, logger = console } = {}) {
  if (!service || typeof service.expireOverdueRequests !== 'function') {
    throw new Error('Exchange service with expireOverdueRequests is required');
  }
  let timer = null;
  let running = false;

  async function drainOnce() {
    if (running) return null;
    running = true;
    try {
      return await service.expireOverdueRequests();
    } catch (error) {
      logger.error('Exchange expiry worker failed:', error);
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

module.exports = { createExchangeExpiryWorker };
