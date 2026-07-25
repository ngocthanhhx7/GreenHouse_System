const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createSystemSettingService } = require('./systemSetting.service');

function createRepository() {
  const versions = [];
  return {
    versions,
    async listVersions(limit = 20) { return [...versions].sort((a, b) => b.version - a.version).slice(0, limit); },
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
    }, 'settings-stale-002'), (error) => {
      assert.equal(error.errorCode, 'SETTINGS_VERSION_STALE');
      assert.deepEqual(error.data.current, {
        version: 1,
        effectiveAt: new Date('2026-07-25T00:00:00.000Z'),
        values: { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: 5 },
      });
      return true;
    });
    assert.equal(repository.versions.length, 1);
  });

  it('returns the complete bounded history, including values, after a save', async () => {
    for (let version = 1; version <= 3; version += 1) {
      repository.versions.push({
        _id: `version-${version}`,
        version,
        values: { PAYMENT_TIMEOUT_MINUTES: 15 + version, LOW_STOCK_DEFAULT_THRESHOLD: version },
        reason: `Version ${version}`,
        effectiveAt: new Date(`2026-07-2${version}T00:00:00.000Z`),
        updatedBy: 'admin-1',
        idempotencyKey: `settings-history-${version}`,
        requestHash: String(version).repeat(64),
      });
    }

    const result = await service.updateSettings('admin-1', {
      expectedVersion: 3,
      reason: 'Version 4',
      values: { PAYMENT_TIMEOUT_MINUTES: 25, LOW_STOCK_DEFAULT_THRESHOLD: 8 },
    }, 'settings-history-4');

    assert.deepEqual(result.history.map((item) => item.version), [4, 3, 2, 1]);
    assert.deepEqual(result.history[0].values, {
      PAYMENT_TIMEOUT_MINUTES: 25,
      LOW_STOCK_DEFAULT_THRESHOLD: 8,
    });
  });

  it('passes the claimed settings version and threshold through post-commit reevaluation', async () => {
    const reevaluations = [];
    const claimed = {
      _id: 'outbox-7',
      processingStartedAt: new Date('2026-07-25T00:00:00.000Z'),
      payload: {
        version: 7,
        values: { PAYMENT_TIMEOUT_MINUTES: 30, LOW_STOCK_DEFAULT_THRESHOLD: 11 },
      },
    };
    const worker = createSystemSettingService({
      repository: {
        async listVersions() { return []; },
        async listPendingReevaluations() { return [{ _id: 'outbox-7' }]; },
        async claimReevaluation() { return claimed; },
        async completeReevaluation() {},
        async failReevaluation() { assert.fail('reevaluation must not fail'); },
      },
      lowStockLifecycle: { async evaluateAll(context) { reevaluations.push(context); } },
      clock: () => new Date('2026-07-25T00:00:00.000Z'),
    });

    await worker.drainPostCommitWork();

    assert.deepEqual(reevaluations, [{
      eventKey: 'system-settings:7',
      settingVersion: 7,
      globalThreshold: 11,
    }]);
  });

  it('skips a stale v1 reclaim after v2 has already applied, preserving monotonic effects', async () => {
    let now = new Date('2026-07-25T00:01:00.000Z');
    const reevaluations = [];
    const completed = [];
    const outboxes = [
      {
        _id: 'outbox-v1', status: 'Processing',
        processingStartedAt: new Date('2026-07-25T00:00:30.000Z'),
        payload: { version: 1, values: { PAYMENT_TIMEOUT_MINUTES: 15, LOW_STOCK_DEFAULT_THRESHOLD: 4 } },
      },
      {
        _id: 'outbox-v2', status: 'Pending', processingStartedAt: null,
        payload: { version: 2, values: { PAYMENT_TIMEOUT_MINUTES: 15, LOW_STOCK_DEFAULT_THRESHOLD: 9 } },
      },
    ];
    const repository = {
      async listVersions() {
        return [{ version: 2, effectiveAt: new Date('2026-07-25T00:00:45.000Z'), values: { PAYMENT_TIMEOUT_MINUTES: 15, LOW_STOCK_DEFAULT_THRESHOLD: 9 } }];
      },
      async listPendingReevaluations(staleBefore) {
        return outboxes.filter((entry) => (
          ['Pending', 'Failed'].includes(entry.status)
          || (entry.status === 'Processing' && entry.processingStartedAt <= staleBefore)
        ));
      },
      async claimReevaluation(id, staleBefore, claimedAt) {
        const entry = outboxes.find((item) => item._id === id);
        const claimable = ['Pending', 'Failed'].includes(entry.status)
          || (entry.status === 'Processing' && entry.processingStartedAt <= staleBefore);
        if (!claimable) return null;
        entry.status = 'Processing';
        entry.processingStartedAt = claimedAt;
        return { ...entry };
      },
      async completeReevaluation(id) {
        const entry = outboxes.find((item) => item._id === id);
        entry.status = 'Completed';
        completed.push(id);
      },
      async failReevaluation() { assert.fail('stale reclaim must complete without applying or failing'); },
    };
    const worker = createSystemSettingService({
      repository,
      lowStockLifecycle: { async evaluateAll(context) { reevaluations.push(context); } },
      clock: () => new Date(now),
    });

    await worker.drainPostCommitWork();
    assert.deepEqual(reevaluations.map((entry) => entry.settingVersion), [2]);

    now = new Date('2026-07-25T00:02:31.000Z');
    await worker.drainPostCommitWork();

    assert.deepEqual(reevaluations.map((entry) => entry.settingVersion), [2]);
    assert.deepEqual(completed, ['outbox-v2', 'outbox-v1']);
  });

  it('classifies a concurrent same-key/different-facts winner as idempotency reuse', async () => {
    const raceRepository = createRepository();
    const raceService = createSystemSettingService({
      repository: {
        ...raceRepository,
        async appendVersion(data) {
          raceRepository.versions.push({
            ...data,
            _id: 'winner',
            requestHash: 'f'.repeat(64),
          });
          const error = new Error('duplicate idempotency key');
          error.code = 11000;
          throw error;
        },
      },
      transactionManager: { async withTransaction(work) { return work({ id: 'race-session' }); } },
      auditLogger: { async log() {} },
      outboxPublisher: { async publish() {} },
      clock: () => new Date('2026-07-25T00:00:00.000Z'),
    });

    await assert.rejects(() => raceService.updateSettings('admin-1', {
      expectedVersion: 0,
      reason: 'Different losing facts',
      values: { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: 5 },
    }, 'settings-race-same-key'), (error) => {
      assert.equal(error.errorCode, 'IDEMPOTENCY_KEY_REUSED');
      return true;
    });
  });

  it('returns the safe current result when a different-key version race loses', async () => {
    const raceRepository = createRepository();
    const winner = {
      _id: 'winner',
      version: 1,
      values: { PAYMENT_TIMEOUT_MINUTES: 45, LOW_STOCK_DEFAULT_THRESHOLD: 12 },
      reason: 'Concurrent winner',
      effectiveAt: new Date('2026-07-25T00:00:00.000Z'),
      updatedBy: 'admin-2',
      idempotencyKey: 'settings-race-winner',
      requestHash: 'f'.repeat(64),
    };
    const raceService = createSystemSettingService({
      repository: {
        ...raceRepository,
        async appendVersion() {
          raceRepository.versions.push(winner);
          const error = new Error('duplicate version');
          error.code = 11000;
          throw error;
        },
      },
      transactionManager: { async withTransaction(work) { return work({ id: 'race-session' }); } },
      auditLogger: { async log() {} },
      outboxPublisher: { async publish() {} },
      clock: () => new Date('2026-07-25T00:00:00.000Z'),
    });

    await assert.rejects(() => raceService.updateSettings('admin-1', {
      expectedVersion: 0,
      reason: 'Losing command',
      values: { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: 5 },
    }, 'settings-race-loser'), (error) => {
      assert.equal(error.errorCode, 'SETTINGS_VERSION_STALE');
      assert.deepEqual(error.data.current, {
        version: 1,
        effectiveAt: winner.effectiveAt,
        values: winner.values,
      });
      return true;
    });
  });
});
