const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const Notification = require('./notification.model');
const { assertLifecycleUpdate } = require('./notification.model');

function inApp(overrides = {}) {
  return new Notification({
    businessEventId: 'order:1:received',
    recipientIdentity: 'user:507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439012',
    type: 'ORDER_RECEIVED',
    templateKey: 'ORDER_RECEIVED',
    displayValues: { orderCode: 'ORD-001' },
    channel: 'InApp',
    state: 'Unread',
    targetCollection: '',
    targetId: null,
    ...overrides,
  });
}

describe('SL-009 Notification model', () => {
  it('AT-176 declares the exact migration-ready logical tuple unique index', () => {
    const indexes = Notification.schema.indexes();
    const tuple = indexes.find(([, options]) => options.name === 'notification_logical_tuple_unique');

    assert.deepEqual(tuple[0], {
      businessEventId: 1,
      recipientIdentity: 1,
      type: 1,
      channel: 1,
    });
    assert.equal(tuple[1].unique, true);
  });

  it('AT-178 has no arbitrary subject/content payload and rejects non-allowlisted display values', async () => {
    assert.equal(Notification.schema.path('subject'), undefined);
    assert.equal(Notification.schema.path('content'), undefined);
    const notification = new Notification({
      businessEventId: 'order:1:received',
      recipientIdentity: 'user:507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439012',
      type: 'ORDER_RECEIVED',
      templateKey: 'ORDER_RECEIVED',
      displayValues: { orderCode: 'ORD-001', passwordHash: 'unsafe' },
      channel: 'InApp',
      state: 'Unread',
    });

    await assert.rejects(() => notification.validate(), /display value.*not allowed/i);
  });

  it('AT-179 models the monotonic in-app states and retains archive time', () => {
    assert.deepEqual(Notification.schema.path('state').enumValues, ['Unread', 'Read', 'Archived', 'NotApplicable']);
    assert.ok(Notification.schema.path('readAt'));
    assert.ok(Notification.schema.path('archivedAt'));
    assert.equal(Notification.schema.path('deletedAt'), undefined);
  });

  it('AT-179 rejects internally inconsistent initial lifecycle states', async () => {
    await assert.rejects(() => inApp({ state: 'Read' }).validate(), /readAt/i);
    await assert.rejects(() => inApp({ state: 'Archived', readAt: new Date() }).validate(), /archivedAt/i);
    await assert.rejects(() => inApp({ state: 'Unread', readAt: new Date() }).validate(), /Unread.*readAt/i);
    await assert.doesNotReject(() => inApp({ state: 'Archived', readAt: new Date(), archivedAt: new Date() }).validate());
  });

  it('AT-179 permits only query-guarded Unread -> Read -> Archived lifecycle updates', () => {
    const now = new Date('2030-07-25T00:00:00.000Z');
    assert.doesNotThrow(() => assertLifecycleUpdate({ state: 'Unread' }, { $set: { state: 'Read', readAt: now } }));
    assert.doesNotThrow(() => assertLifecycleUpdate({ state: 'Read' }, { $set: { state: 'Archived', archivedAt: now } }));
    assert.throws(() => assertLifecycleUpdate({ state: 'Archived' }, { $set: { state: 'Read', readAt: now } }), /lifecycle/i);
    assert.throws(() => assertLifecycleUpdate({ state: 'Read' }, { $set: { state: 'Unread' } }), /lifecycle/i);
    assert.throws(() => assertLifecycleUpdate({}, { $set: { state: 'Archived', archivedAt: now } }), /lifecycle/i);
  });

  it('AT-179 rejects timestamp-only, unset, and mixed lifecycle query mutations', () => {
    const now = new Date('2030-07-25T00:00:00.000Z');
    const invalid = [
      [{ state: 'Unread' }, { $set: { readAt: now } }],
      [{ state: 'Read' }, { $set: { archivedAt: now } }],
      [{ state: 'Read' }, { $unset: { readAt: 1 } }],
      [{ state: 'Archived' }, { $unset: { archivedAt: 1 } }],
      [{ state: 'Read' }, { $unset: { 'readAt.zone': 1 } }],
      [{ state: 'Unread' }, { $set: { state: 'Read', readAt: now, archivedAt: now } }],
      [{ state: 'Read' }, { $set: { state: 'Archived', archivedAt: now, readAt: now } }],
      [{ state: 'Unread' }, { state: 'Read', readAt: now }],
      [{ state: 'Unread' }, { $inc: { readAt: 1 } }],
    ];

    for (const [filter, update] of invalid) {
      assert.throws(() => assertLifecycleUpdate(filter, update), /lifecycle/i);
    }
  });

  it('AT-179 prevents document saves from replacing lifecycle timestamps', async () => {
    const read = Notification.hydrate(inApp({
      state: 'Read',
      readAt: new Date('2030-07-25T00:00:00.000Z'),
    }).toObject());
    read.readAt = new Date('2030-07-25T00:01:00.000Z');
    await assert.rejects(() => read.validate(), /lifecycle/i);

    const archived = Notification.hydrate(inApp({
      state: 'Archived',
      readAt: new Date('2030-07-25T00:00:00.000Z'),
      archivedAt: new Date('2030-07-25T00:01:00.000Z'),
    }).toObject());
    archived.archivedAt = new Date('2030-07-25T00:02:00.000Z');
    await assert.rejects(() => archived.validate(), /lifecycle/i);
  });
});
