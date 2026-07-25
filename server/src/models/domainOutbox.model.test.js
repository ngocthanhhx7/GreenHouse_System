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

  it('AT-175 stores the canonical business event identity and aggregate clock', () => {
    const occurredAt = new Date('2026-07-24T01:02:03.000Z');
    const item = new DomainOutbox({
      identityKey: 'order:order-1:shipped',
      businessEventId: 'order:order-1:shipped',
      eventType: 'ORDER_SHIPPED',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      aggregateVersion: 4,
      occurredAt,
      payloadSchemaVersion: 1,
      eventHash: 'a'.repeat(64),
      payload: {
        businessEventId: 'order:order-1:shipped',
        type: 'ORDER_SHIPPED',
        recipientId: 'customer-1',
        target: { collection: 'Order', id: 'order-1' },
        displayValues: { orderCode: 'ORD-001' },
      },
    });

    assert.equal(item.validateSync(), undefined);
    assert.equal(item.businessEventId, 'order:order-1:shipped');
    assert.equal(item.aggregateType, 'Order');
    assert.equal(item.aggregateId, 'order-1');
    assert.equal(item.aggregateVersion, 4);
    assert.equal(item.occurredAt.toISOString(), occurredAt.toISOString());
    assert.equal(item.payloadSchemaVersion, 1);
  });

  it('AT-182 rejects prohibited fields before a canonical payload can persist', () => {
    const item = new DomainOutbox({
      identityKey: 'order:order-1:shipped',
      businessEventId: 'order:order-1:shipped',
      eventType: 'ORDER_SHIPPED',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      occurredAt: new Date('2026-07-24T01:02:03.000Z'),
      payloadSchemaVersion: 1,
      eventHash: 'a'.repeat(64),
      payload: {
        businessEventId: 'order:order-1:shipped',
        type: 'ORDER_SHIPPED',
        recipientId: 'customer-1',
        displayValues: { orderCode: 'ORD-001' },
        password: 'must-not-persist',
      },
    });

    const error = item.validateSync();
    assert.equal(error?.errors?.payload?.kind, 'domainOutboxPayload');
    assert.doesNotMatch(JSON.stringify(item.payload), /must-not-persist/);
  });
});
