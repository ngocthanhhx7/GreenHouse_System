const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

let createDomainEventProducer;
let canonicalEnvelope;
let createOutboxWriter;
try {
  ({
    canonicalEnvelope,
    createDomainEventProducer,
    createOutboxWriter,
  } = require('./domainEventProducer.service'));
} catch {
  createDomainEventProducer = undefined;
}

describe('SL-009 atomic domain event producer', () => {
  it('AT-175 exposes one shared producer boundary', () => {
    assert.equal(typeof createDomainEventProducer, 'function');
  });

  it('AT-175 commits domain state, canonical Audit, and one DomainOutbox row in the same session', async () => {
    const state = { domain: [], audits: [], outbox: [] };
    const session = { id: 'transaction-session-1' };
    const transactionManager = {
      async withTransaction(work) {
        return work(session);
      },
    };
    const producer = createDomainEventProducer({
      transactionManager,
      auditWriter: {
        async write(entry, activeSession) {
          assert.equal(activeSession, session);
          state.audits.push(entry);
        },
      },
      outboxWriter: {
        async publish(entry, activeSession) {
          assert.equal(activeSession, session);
          state.outbox.push(entry);
          return entry;
        },
      },
      clock: () => new Date('2026-07-24T01:02:03.000Z'),
    });

    const result = await producer.execute({
      async mutate(activeSession) {
        assert.equal(activeSession, session);
        const order = { id: 'order-1', orderCode: 'ORD-001', version: 4 };
        state.domain.push(order);
        return order;
      },
      buildAudit(order) {
        return {
          actorType: 'User',
          actorId: 'customer-1',
          actorRole: 'Customer',
          action: 'ORDER_SHIPPED',
          targetType: 'Order',
          targetId: order.id,
          outcome: 'Success',
        };
      },
      buildEvent(order) {
        return {
          businessEventId: `order:${order.id}:shipped`,
          eventType: 'ORDER_SHIPPED',
          aggregateType: 'Order',
          aggregateId: order.id,
          aggregateVersion: order.version,
          recipientId: 'customer-1',
          target: { collection: 'Order', id: order.id },
          displayValues: { orderCode: order.orderCode },
        };
      },
    });

    assert.equal(result.id, 'order-1');
    assert.equal(state.domain.length, 1);
    assert.equal(state.audits.length, 1);
    assert.equal(state.outbox.length, 1);
    assert.equal(state.audits[0].businessEventId, 'order:order-1:shipped');
    assert.match(state.outbox[0].eventHash, /^[a-f0-9]{64}$/);
    const { eventHash, ...outboxWithoutHash } = state.outbox[0];
    assert.ok(eventHash);
    assert.deepEqual(outboxWithoutHash, {
      identityKey: 'order:order-1:shipped',
      businessEventId: 'order:order-1:shipped',
      eventType: 'ORDER_SHIPPED',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      aggregateVersion: 4,
      occurredAt: new Date('2026-07-24T01:02:03.000Z'),
      payloadSchemaVersion: 1,
      payload: {
        businessEventId: 'order:order-1:shipped',
        type: 'ORDER_SHIPPED',
        recipientId: 'customer-1',
        target: { collection: 'Order', id: 'order-1' },
        displayValues: { orderCode: 'ORD-001' },
      },
      status: 'Pending',
    });
  });

  it('AT-176 binds each canonical event identity to an immutable content hash', () => {
    const base = {
      identityKey: 'order:order-1:shipped',
      businessEventId: 'order:order-1:shipped',
      eventType: 'ORDER_SHIPPED',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      aggregateVersion: 4,
      occurredAt: '2026-07-24T01:02:03.000Z',
      recipientId: 'customer-1',
      target: { collection: 'Order', id: 'order-1' },
      displayValues: { orderCode: 'ORD-001' },
    };

    const first = canonicalEnvelope(base);
    const same = canonicalEnvelope(structuredClone(base));
    const changed = canonicalEnvelope({
      ...base,
      displayValues: { orderCode: 'ORD-CHANGED' },
    });

    assert.match(first.eventHash, /^[a-f0-9]{64}$/);
    assert.equal(first.eventHash, same.eventHash);
    assert.notEqual(first.eventHash, changed.eventHash);
  });

  it('AT-176 replays identical DomainOutbox facts and rejects identity reuse with different facts', async () => {
    const rows = [];
    const model = {
      findOne(filter) {
        const query = {
          session() { return query; },
          async lean() {
            return rows.find((row) => row.identityKey === filter.identityKey) || null;
          },
        };
        return query;
      },
      async create([entry]) {
        if (rows.some((row) => row.identityKey === entry.identityKey)) {
          const error = new Error('duplicate');
          error.code = 11000;
          throw error;
        }
        const row = { _id: `outbox-${rows.length + 1}`, ...structuredClone(entry) };
        rows.push(row);
        return [{ toObject() { return structuredClone(row); } }];
      },
    };
    const writer = createOutboxWriter({ model });
    const original = canonicalEnvelope({
      businessEventId: 'order:order-1:shipped',
      eventType: 'ORDER_SHIPPED',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      recipientId: 'customer-1',
      target: { collection: 'Order', id: 'order-1' },
      displayValues: { orderCode: 'ORD-001' },
      occurredAt: '2026-07-24T01:02:03.000Z',
    });

    const first = await writer.publish(original, { id: 'session-1' });
    const replay = await writer.publish(structuredClone(original), { id: 'session-1' });

    assert.equal(first._id, replay._id);
    assert.equal(rows.length, 1);
    await assert.rejects(
      () => writer.publish({
        ...original,
        eventHash: 'b'.repeat(64),
      }),
      (error) => error.code === 'DOMAIN_EVENT_IDEMPOTENCY_REUSE',
    );
    assert.equal(rows.length, 1);
  });
});
