function createOrderPaymentExpiryWorker({ service, intervalMs = 60_000, logger = console } = {}) {
  if (!service || typeof service.expireOverdueOrders !== 'function') {
    throw new Error('order payment expiry service with expireOverdueOrders is required');
  }

  let timer = null;
  let running = false;

  async function drainOnce() {
    if (running) return null;
    running = true;
    try {
      return await service.expireOverdueOrders();
    } catch (error) {
      logger.error('Order payment expiry worker failed:', error);
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

module.exports = { createOrderPaymentExpiryWorker };
