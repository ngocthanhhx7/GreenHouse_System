const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createSystemSettingService } = require('./systemSetting.service');

function createRepository() {
  const settings = new Map();

  return {
    settings,
    async listSettings() {
      return Array.from(settings.values());
    },
    async upsertSetting(key, data) {
      const setting = { key, ...data, updatedAt: new Date() };
      settings.set(key, setting);
      return setting;
    },
  };
}

function createAuditLogger() {
  return {
    entries: [],
    async log(entry) {
      this.entries.push(entry);
    },
  };
}

describe('system setting service', () => {
  let repository;
  let auditLogger;
  let service;

  beforeEach(() => {
    repository = createRepository();
    auditLogger = createAuditLogger();
    service = createSystemSettingService({ repository, auditLogger });
  });

  it('returns default admin settings when database is empty', async () => {
    const result = await service.listSettings();

    assert.equal(result.LOW_STOCK_DEFAULT_THRESHOLD, 5);
    assert.equal(result.RETURN_WINDOW_DAYS, 7);
    assert.equal(result.PAYMENT_TIMEOUT_MINUTES, 15);
  });

  it('updates numeric admin settings and writes audit log', async () => {
    const result = await service.updateSettings('admin-1', {
      LOW_STOCK_DEFAULT_THRESHOLD: 10,
      RETURN_WINDOW_DAYS: 14,
      PAYMENT_TIMEOUT_MINUTES: 30,
    });

    assert.equal(result.LOW_STOCK_DEFAULT_THRESHOLD, 10);
    assert.equal(result.RETURN_WINDOW_DAYS, 14);
    assert.equal(repository.settings.size, 3);
    assert.equal(auditLogger.entries[0].action, 'SYSTEM_SETTING_UPDATE');
  });

  it('rejects negative setting values', async () => {
    await assert.rejects(
      () => service.updateSettings('admin-1', { PAYMENT_TIMEOUT_MINUTES: 0 }),
      /must be a positive integer/
    );
  });

  it('validates the complete batch before writing any setting', async () => {
    await assert.rejects(
      () => service.updateSettings('admin-1', {
        LOW_STOCK_DEFAULT_THRESHOLD: 10,
        RETURN_WINDOW_DAYS: 0,
      }),
      /must be a positive integer/,
    );

    assert.equal(repository.settings.size, 0);
    assert.equal(auditLogger.entries.length, 0);
  });
});
