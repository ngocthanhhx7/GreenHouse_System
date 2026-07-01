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

    assert.equal(result.lowStockDefaultThreshold, 5);
    assert.equal(result.returnWindowDays, 7);
  });

  it('updates numeric admin settings and writes audit log', async () => {
    const result = await service.updateSettings('admin-1', {
      lowStockDefaultThreshold: 10,
      returnWindowDays: 14,
    });

    assert.equal(result.lowStockDefaultThreshold, 10);
    assert.equal(result.returnWindowDays, 14);
    assert.equal(repository.settings.size, 2);
    assert.equal(auditLogger.entries[0].action, 'SYSTEM_SETTING_UPDATE');
  });

  it('rejects negative setting values', async () => {
    await assert.rejects(
      () => service.updateSettings('admin-1', { lowStockDefaultThreshold: -1 }),
      /must be zero or greater/
    );
  });
});
