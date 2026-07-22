function createEmailWorker({ outboxService, intervalMs = 5000, logger = console } = {}) {
  if (!outboxService || typeof outboxService.deliverNext !== 'function') throw new Error('outboxService.deliverNext is required');
  let timer = null;
  let draining = false;

  async function drainOnce() {
    if (draining) return null;
    draining = true;
    try {
      return await outboxService.deliverNext();
    } catch (error) {
      logger.error('Email outbox worker failed to deliver an item:', error);
      return null;
    } finally {
      draining = false;
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

module.exports = { createEmailWorker };
