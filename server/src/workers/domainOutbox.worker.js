function createDomainOutboxWorker({
  services = [],
  intervalMs = 5000,
  logger = console,
} = {}) {
  let timer = null;
  let running = false;

  async function runOnce() {
    if (running) return;
    running = true;
    try {
      for (const service of services) {
        if (typeof service?.drainPostCommitWork === 'function') {
          try {
            await service.drainPostCommitWork();
          } catch (error) {
            logger.error('Domain outbox handler failed:', error);
          }
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return;
      void runOnce();
      timer = setInterval(() => { void runOnce(); }, intervalMs);
      timer.unref?.();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
    runOnce,
  };
}

module.exports = { createDomainOutboxWorker };
