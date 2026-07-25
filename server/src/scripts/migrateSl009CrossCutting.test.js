const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

let migration = {};
try {
  migration = require('./migrateSl009CrossCutting');
} catch {
  migration = {};
}

describe('SL-009 cross-cutting migration', () => {
  it('exposes preflight, dry-run, apply, and verify boundaries', () => {
    assert.equal(typeof migration.buildSl009MigrationPlan, 'function');
    assert.equal(typeof migration.runSl009Migration, 'function');
    assert.equal(typeof migration.verifySl009Migration, 'function');
    assert.equal(typeof migration.parseCliArgs, 'function');
    assert.equal(typeof migration.runCli, 'function');
  });

  it('keeps the CLI dry-run by default and requires an explicit apply mode', () => {
    assert.deepEqual(migration.parseCliArgs([]), { mode: 'dry-run' });
    assert.deepEqual(migration.parseCliArgs(['--dry-run']), { mode: 'dry-run' });
    assert.deepEqual(migration.parseCliArgs(['--apply']), { mode: 'apply' });
    assert.deepEqual(migration.parseCliArgs(['--verify']), { mode: 'verify' });
    assert.throws(
      () => migration.parseCliArgs(['--apply', '--verify']),
      (error) => error.code === 'SL009_MIGRATION_CLI_ARGUMENT_INVALID',
    );
  });

  it('builds a deterministic canonical plan for every SL-009 data area', () => {
    const now = new Date('2026-07-25T00:00:00.000Z');
    const input = {
      audits: [{
        _id: 'audit-1',
        userId: 'customer-1',
        action: 'ORDER_CREATED',
        targetEntity: 'Order',
        targetId: 'order-1',
        eventId: 'order:order-1:created',
        description: 'Order created',
        createdAt: new Date('2026-07-24T01:00:00.000Z'),
      }],
      notifications: [{
        _id: 'notification-1',
        userId: 'customer-1',
        eventId: 'order:order-1:created',
        type: 'ORDER_CREATED',
        channel: 'InApp',
        isRead: true,
        deletedAt: null,
        targetCollection: 'Order',
        targetId: 'order-1',
        createdAt: new Date('2026-07-24T01:00:01.000Z'),
      }],
      emailOutboxes: [{
        _id: 'email-1',
        eventType: 'ORDER_CREATED',
        idempotencyKey: 'ORDER_CREATED:order-1',
        recipient: 'customer@example.com',
        payload: { orderCode: 'ORD-001' },
        status: 'Failed',
        attemptCount: 2,
        availableAt: new Date('2026-07-24T01:01:00.000Z'),
      }],
      domainOutboxes: [{
        _id: 'outbox-1',
        identityKey: 'order:order-1:shipped',
        eventType: 'ORDER_SHIPPED',
        payload: {
          businessEventId: 'order:order-1:shipped',
          recipientId: 'customer-1',
          targetCollection: 'Order',
          targetId: 'order-1',
          displayValues: { orderCode: 'ORD-001' },
        },
        createdAt: new Date('2026-07-24T02:00:00.000Z'),
      }],
      settings: [
        { _id: 'setting-payment', key: 'PAYMENT_TIMEOUT_MINUTES', value: 20 },
        { _id: 'setting-low-stock', key: 'LOW_STOCK_DEFAULT_THRESHOLD', value: 7 },
        { _id: 'setting-return', key: 'RETURN_WINDOW_DAYS', value: 30 },
      ],
      settingVersions: [],
    };

    const first = migration.buildSl009MigrationPlan(input, { now });
    const second = migration.buildSl009MigrationPlan(structuredClone(input), { now });

    assert.deepEqual(first, second);
    assert.match(first.checksum, /^[a-f0-9]{64}$/);
    assert.deepEqual(first.unresolved, []);
    assert.deepEqual(first.summary, {
      AuditLog: { update: 1 },
      Notification: { update: 1 },
      EmailOutbox: { update: 1 },
      DomainOutbox: { update: 1 },
      SystemSetting: { delete: 1 },
      SystemSettingVersion: { insert: 1 },
    });
    const notification = first.operations.find((operation) => operation.collection === 'Notification');
    assert.equal(notification.update.$set.businessEventId, 'order:order-1:created');
    assert.equal(notification.update.$set.recipientIdentity, 'user:customer-1');
    assert.equal(notification.update.$set.type, 'ORDER_RECEIVED');
    assert.equal(notification.update.$set.state, 'Read');
    const email = first.operations.find((operation) => operation.collection === 'EmailOutbox');
    assert.equal(email.update.$set.status, 'RetryScheduled');
    assert.equal(email.update.$set.deliveryPolicyVersion, 2);
    const outbox = first.operations.find((operation) => operation.collection === 'DomainOutbox');
    assert.equal(outbox.update.$set.payloadSchemaVersion, 1);
    assert.match(outbox.update.$set.eventHash, /^[a-f0-9]{64}$/);
    const baseline = first.operations.find(
      (operation) => operation.collection === 'SystemSettingVersion',
    );
    assert.deepEqual(baseline.document.values, {
      PAYMENT_TIMEOUT_MINUTES: 20,
      LOW_STOCK_DEFAULT_THRESHOLD: 7,
    });
  });

  it('fails closed on ambiguous identities and never applies a partial plan', async () => {
    const calls = [];
    const repository = {
      async loadSnapshot() {
        return {
          audits: [],
          notifications: [{ _id: 'notification-ambiguous', type: 'ORDER_CREATED' }],
          emailOutboxes: [],
          domainOutboxes: [],
          settings: [],
          settingVersions: [{ version: 1 }],
        };
      },
      async applyPlan(plan) { calls.push(plan); },
    };

    const dryRun = await migration.runSl009Migration({
      repository,
      dryRun: true,
      now: new Date('2026-07-25T00:00:00.000Z'),
    });
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.unresolved[0].code, 'NOTIFICATION_IDENTITY_AMBIGUOUS');
    assert.equal(calls.length, 0);

    await assert.rejects(
      migration.runSl009Migration({
        repository,
        dryRun: false,
        now: new Date('2026-07-25T00:00:00.000Z'),
      }),
      (error) => error.code === 'SL009_MIGRATION_UNRESOLVED',
    );
    assert.equal(calls.length, 0);
  });

  it('applies a clean plan once and is repeat-safe', async () => {
    let applied = false;
    const calls = [];
    const legacy = {
      audits: [],
      notifications: [],
      emailOutboxes: [{
        _id: 'email-repeat',
        eventType: 'ORDER_CREATED',
        idempotencyKey: 'ORDER_CREATED:repeat',
        recipient: 'repeat@example.com',
        payload: { orderCode: 'ORD-REPEAT' },
        status: 'Failed',
        attemptCount: 1,
        availableAt: new Date('2026-07-24T01:00:00.000Z'),
      }],
      domainOutboxes: [],
      settings: [],
      settingVersions: [{ version: 1 }],
    };
    const canonical = structuredClone(legacy);
    canonical.emailOutboxes[0] = {
      ...canonical.emailOutboxes[0],
      status: 'RetryScheduled',
      deliveryPolicyVersion: 2,
      attempts: [],
    };
    const repository = {
      async loadSnapshot() { return structuredClone(applied ? canonical : legacy); },
      async applyPlan(plan) {
        calls.push(plan);
        applied = true;
      },
    };

    const first = await migration.runSl009Migration({
      repository,
      dryRun: false,
      now: new Date('2026-07-25T00:00:00.000Z'),
    });
    const second = await migration.runSl009Migration({
      repository,
      dryRun: false,
      now: new Date('2026-07-25T00:00:00.000Z'),
    });

    assert.equal(first.applied, 1);
    assert.equal(second.applied, 0);
    assert.equal(calls.length, 1);
  });

  it('fails closed when an optimistic migration operation loses a concurrent-write race', async () => {
    const observed = [];
    const model = {
      collection: {
        async updateOne(filter) {
          observed.push(filter);
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        },
      },
    };
    const repository = migration.createMigrationRepository({
      models: Object.fromEntries([
        'AuditLog',
        'Notification',
        'EmailOutbox',
        'DomainOutbox',
        'SystemSetting',
        'SystemSettingVersion',
      ].map((name) => [name, model])),
      sessionFactory: async () => ({
        async withTransaction(work) { return work(); },
        async endSession() {},
      }),
    });
    const source = {
      _id: 'audit-race',
      action: 'ORDER_CREATED',
      updatedAt: new Date('2026-07-25T00:00:00.000Z'),
    };
    const operation = migration.updateOperation(
      'AuditLog',
      source,
      { action: 'ORDER_RECEIVED' },
    );

    await assert.rejects(
      repository.applyPlan({ operations: [operation] }),
      (error) => error.code === 'SL009_MIGRATION_CONCURRENT_WRITE',
    );
    assert.equal(observed.length, 1);
    assert.equal(observed[0].action, 'ORDER_CREATED');
    assert.deepEqual(observed[0].updatedAt, source.updatedAt);
  });

  it('verifies logical notification uniqueness and terminal email delivery bounds', async () => {
    const result = await migration.verifySl009Migration({
      audits: [],
      notifications: [
        {
          _id: 'notification-a',
          businessEventId: 'order:1:created',
          recipientIdentity: 'user:1',
          userId: '1',
          type: 'ORDER_RECEIVED',
          templateKey: 'ORDER_RECEIVED',
          channel: 'InApp',
          state: 'Unread',
        },
        {
          _id: 'notification-b',
          businessEventId: 'order:1:created',
          recipientIdentity: 'user:1',
          userId: '1',
          type: 'ORDER_RECEIVED',
          templateKey: 'ORDER_RECEIVED',
          channel: 'InApp',
          state: 'Unread',
        },
      ],
      emailOutboxes: [{
        _id: 'email-over-limit',
        eventType: 'ORDER_CREATED',
        idempotencyKey: 'ORDER_CREATED:over-limit',
        recipient: 'limit@example.com',
        status: 'RetryScheduled',
        attemptCount: 5,
        deliveryPolicyVersion: 2,
        attempts: [],
        availableAt: new Date('2026-07-25T00:00:00.000Z'),
      }],
      domainOutboxes: [],
      settings: [],
      settingVersions: [{ version: 1 }],
    }, { now: new Date('2026-07-25T00:00:00.000Z') });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === 'NOTIFICATION_TUPLE_DUPLICATE'));
    assert.ok(result.errors.some((error) => error.code === 'EMAIL_ATTEMPT_LIMIT_NONTERMINAL'));
  });
});
