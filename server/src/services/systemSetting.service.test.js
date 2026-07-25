const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createSystemSettingService } = require('./systemSetting.service');

function createRepository() {
  const versions = [];
  return {
    versions,
    async listVersions() { return [...versions].sort((a, b) => b.version - a.version); },
    async findByIdempotencyKey(key) { return versions.find((entry) => entry.idempotencyKey === key) || null; },
    async appendVersion(data) {
      if (versions.some((entry) => entry.version === data.version)) {
        const error = new Error('duplicate version'); error.code = 11000; throw error;
      }
      const version = { _id: `version-${data.version}`, ...data };
      versions.push(version);
      return version;
    },
    async syncCurrent() {},
  };
}

describe('versioned system setting service', () => {
  let repository;
  let audits;
  let outbox;
  let lifecycle;
  let service;

  beforeEach(() => {
    repository = createRepository();
    audits = [];
    outbox = [];
    lifecycle = [];
    service = createSystemSettingService({
      repository,
      transactionManager: { async withTransaction(work) { return work({ id: 'session' }); } },
      auditLogger: { async log(entry, session) { audits.push({ entry, session }); } },
      outboxPublisher: { async publish(entry, session) { outbox.push({ entry, session }); } },
      lowStockLifecycle: { async evaluateAll(entry) { lifecycle.push(entry); } },
      clock: () => new Date('2026-07-25T00:00:00.000Z'),
    });
  });

  it('returns only the two safe defaults when no approved version exists', async () => {
    const result = await service.listSettings();
    assert.deepEqual(result.current.values, {
      PAYMENT_TIMEOUT_MINUTES: 15,
      LOW_STOCK_DEFAULT_THRESHOLD: 5,
    });
    assert.equal(result.current.version, 0);
    assert.deepEqual(result.history, []);
  });

  it('atomically records one immutable version, audit, and outbox event for the complete batch', async () => {
    const result = await service.updateSettings('admin-1', {
      expectedVersion: 0,
      reason: 'Cap nhat nguong van hanh',
      values: { PAYMENT_TIMEOUT_MINUTES: 30, LOW_STOCK_DEFAULT_THRESHOLD: 10 },
    }, 'settings-command-001');

    assert.equal(result.current.version, 1);
    assert.equal(result.current.values.PAYMENT_TIMEOUT_MINUTES, 30);
    assert.equal(repository.versions.length, 1);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].session.id, 'session');
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].entry.eventType, 'SYSTEM_SETTINGS_LOW_STOCK_REEVALUATE');
    assert.equal(outbox[0].session.id, 'session');
    assert.equal(lifecycle.length, 0, 'reevaluation belongs to the DomainOutbox seam, not an inline side effect');
  });

  it('rejects unsupported, missing, decimal, out-of-range, and partial batches before any write', async () => {
    for (const input of [
      { expectedVersion: 0, reason: 'reason', values: { PAYMENT_TIMEOUT_MINUTES: 20, UNSUPPORTED_SETTING: 5, LOW_STOCK_DEFAULT_THRESHOLD: 2 } },
      { expectedVersion: 0, reason: 'reason', values: { PAYMENT_TIMEOUT_MINUTES: 20 } },
      { expectedVersion: 0, reason: 'reason', values: { PAYMENT_TIMEOUT_MINUTES: 20.5, LOW_STOCK_DEFAULT_THRESHOLD: 2 } },
      { expectedVersion: 0, reason: 'reason', values: { PAYMENT_TIMEOUT_MINUTES: 61, LOW_STOCK_DEFAULT_THRESHOLD: 2 } },
      { expectedVersion: 0, reason: 'reason', values: { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: -1 } },
    ]) {
      await assert.rejects(() => service.updateSettings('admin-1', input, 'settings-invalid'), /invalid|exactly|integer|between/i);
    }
    assert.equal(repository.versions.length, 0);
    assert.equal(audits.length, 0);
    assert.equal(outbox.length, 0);
  });

  it('replays canonical identical facts but rejects reuse of the idempotency key with different facts', async () => {
    const command = {
      expectedVersion: 0,
      reason: 'Cap nhat timeout',
      values: { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: 5 },
    };
    const created = await service.updateSettings('admin-1', command, 'settings-replay-001');
    const replay = await service.updateSettings('admin-1', { ...command, values: { LOW_STOCK_DEFAULT_THRESHOLD: 5, PAYMENT_TIMEOUT_MINUTES: 20 } }, 'settings-replay-001');
    assert.equal(replay.replay, true);
    assert.deepEqual(replay.current, created.current);
    await assert.rejects(() => service.updateSettings('admin-1', { ...command, reason: 'Khac' }, 'settings-replay-001'), /different facts/i);
  });

  it('rejects a stale expected version without writing a second version', async () => {
    await service.updateSettings('admin-1', {
      expectedVersion: 0, reason: 'Lan dau', values: { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: 5 },
    }, 'settings-stale-001');
    await assert.rejects(() => service.updateSettings('admin-1', {
      expectedVersion: 0, reason: 'Lan sau', values: { PAYMENT_TIMEOUT_MINUTES: 25, LOW_STOCK_DEFAULT_THRESHOLD: 5 },
    }, 'settings-stale-002'), /stale/i);
    assert.equal(repository.versions.length, 1);
  });
});
