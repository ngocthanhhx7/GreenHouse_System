const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const DomainOutbox = require('./domainOutbox.model');

describe('domain outbox persistence contract', () => {
  it('stores a lease for atomic multi-worker claims and keeps identity unique', () => {
    const item = new DomainOutbox({
      identityKey: 'ORDER_CANCEL_AUDIT:event-1',
      eventType: 'ORDER_CANCEL_AUDIT',
      payload: { eventId: 'event-1' },
      status: 'Processing',
      processingStartedAt: new Date('2026-07-24T00:00:00.000Z'),
      attemptCount: 1,
    });

    assert.equal(item.validateSync(), undefined);
    assert.equal(item.status, 'Processing');
    assert.equal(item.processingStartedAt.toISOString(), '2026-07-24T00:00:00.000Z');
    const indexes = DomainOutbox.schema.indexes();
    assert.ok(indexes.some(([keys, options]) => (
      keys.identityKey === 1 && options.unique === true
    )));
    assert.ok(indexes.some(([keys]) => (
      keys.status === 1 && keys.processingStartedAt === 1 && keys.createdAt === 1
    )));
  });
});
