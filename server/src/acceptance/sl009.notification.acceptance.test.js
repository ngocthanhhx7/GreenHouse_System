const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createNotificationEventConsumer } = require('../services/notificationEventConsumer.service');
const { renderNotification } = require('../utils/notificationContract');

function createTupleRepository() {
  const rows = [];
  return {
    rows,
    async createTuple(data) {
      const key = [data.businessEventId, data.recipientIdentity, data.type, data.channel].join('|');
      const existing = rows.find((row) => row.tupleKey === key);
      if (existing) return existing;
      const row = { _id: `notification-${rows.length + 1}`, tupleKey: key, ...data };
      rows.push(row);
      return row;
    },
  };
}

describe('SL-009 Notification acceptance', () => {
  it('AT-176 replays the exact logical tuple while distinct recipient, type, and channel tuples persist', async () => {
    const repository = createTupleRepository();
    const emailEnqueues = [];
    const consumer = createNotificationEventConsumer({
      notificationRepository: repository,
      emailOutbox: { async enqueue(entry) { emailEnqueues.push(structuredClone(entry)); return entry; } },
    });
    const event = {
      businessEventId: 'shipment:order-1:shipped',
      type: 'ORDER_SHIPPED',
      recipient: { userId: 'customer-1', email: 'CUSTOMER@example.com', role: 'Customer', hasAccessibleAccount: true },
      target: { collection: 'Order', id: '507f1f77bcf86cd799439011' },
      displayValues: { orderCode: 'ORD-001' },
    };

    const first = await consumer.consume(event);
    const replay = await consumer.consume(event);
    await consumer.consume({ ...event, recipient: { ...event.recipient, userId: 'customer-2', email: 'other@example.com' } });
    await consumer.consume({ ...event, type: 'ORDER_DELIVERED' });

    assert.deepEqual(first.map((item) => item.id), replay.map((item) => item.id));
    assert.equal(repository.rows.length, 6);
    assert.equal(emailEnqueues.length, 4, 'Email enqueue is retried through its own idempotency boundary');
    assert.equal(new Set(repository.rows.map((row) => row.tupleKey)).size, 6);
    assert.deepEqual(new Set(repository.rows.map((row) => row.channel)), new Set(['Email', 'InApp']));
  });

  it('AT-177 applies the exact channel policy and treats Packed as audit-only', () => {
    const consumer = createNotificationEventConsumer({ notificationRepository: createTupleRepository() });
    const account = { userId: 'customer-1', email: 'customer@example.com', role: 'Customer', hasAccessibleAccount: true };

    assert.deepEqual(consumer.resolveChannels('PASSWORD_RESET_COMPLETED', account), ['Email', 'InApp']);
    assert.deepEqual(consumer.resolveChannels('PASSWORD_RESET_COMPLETED', { email: 'guest@example.com' }), ['Email']);
    assert.deepEqual(consumer.resolveChannels('ORDER_RECEIVED', account), ['Email', 'InApp']);
    assert.deepEqual(consumer.resolveChannels('RETURN_REFUND_APPROVED', account), ['Email', 'InApp']);
    assert.deepEqual(consumer.resolveChannels('REVIEW_MODERATION_CHANGED', account), ['Email', 'InApp']);
    assert.deepEqual(consumer.resolveChannels('SUPPORT_RESOLVED', account), ['Email', 'InApp']);
    assert.deepEqual(consumer.resolveChannels('ORDER_SHIPPED', { ...account, role: 'Staff' }), []);
    assert.deepEqual(consumer.resolveChannels('ORDER_SHIPPED', { ...account, hasAccessibleAccount: false }), ['Email']);
    assert.deepEqual(consumer.resolveChannels('LOW_STOCK_OPENED', { ...account, role: 'WarehouseManager' }), ['InApp']);
    assert.deepEqual(consumer.resolveChannels('LOW_STOCK_OPENED', { ...account, role: 'Staff' }), []);
    assert.deepEqual(consumer.resolveChannels('REPLENISHMENT_REQUESTED', { ...account, role: 'Admin' }), ['InApp']);
    assert.deepEqual(consumer.resolveChannels('REPLENISHMENT_REQUESTED', { ...account, role: 'WarehouseManager' }), []);
    assert.deepEqual(consumer.resolveChannels('DAMAGE_DECIDED', { ...account, role: 'Staff' }), ['InApp']);
    assert.deepEqual(consumer.resolveChannels('DAMAGE_DECIDED', { ...account, role: 'WarehouseManager' }), []);
    assert.deepEqual(consumer.resolveChannels('ACCOUNT_DISABLED', { email: 'disabled@example.com', role: 'Customer', hasAccessibleAccount: false }), ['Email']);
    assert.deepEqual(consumer.resolveChannels('ACCOUNT_REACTIVATED', account), ['Email', 'InApp']);
    assert.deepEqual(consumer.resolveChannels('STOCK_EXPORT', account), []);
    assert.deepEqual(consumer.resolveChannels('ORDER_PACKED', account), []);
  });

  it('AT-178 persists only allowlisted immutable display facts and labels order creation as Received', async () => {
    const repository = createTupleRepository();
    const consumer = createNotificationEventConsumer({
      notificationRepository: repository,
      emailOutbox: { async enqueue(entry) { return entry; } },
    });

    await consumer.consume({
      businessEventId: 'order:order-1:created',
      type: 'ORDER_CREATED',
      recipient: { userId: 'customer-1', email: 'customer@example.com', role: 'Customer', hasAccessibleAccount: true },
      target: { collection: 'Order', id: '507f1f77bcf86cd799439011' },
      displayValues: {
        orderCode: 'ORD-001',
        statusLabel: 'Confirmed',
        passwordHash: 'hash-secret',
        token: 'token-secret',
        otp: '123456',
        session: 'session-secret',
        cookie: 'cookie-secret',
        phoneNumber: '0900000000',
        fullAddress: 'sensitive address',
        refundDestination: 'sensitive bank account',
        rawPaymentCallback: { provider: 'secret' },
        reviewContent: 'full private review',
        supportContent: 'full private support message',
        evidence: ['private evidence'],
      },
    });

    const serialized = JSON.stringify(repository.rows);
    assert.doesNotMatch(serialized, /hash-secret|token-secret|123456|session-secret|cookie-secret/);
    assert.doesNotMatch(serialized, /0900000000|sensitive address|sensitive bank account|private review|private support|private evidence/);
    assert.equal(repository.rows[0].type, 'ORDER_RECEIVED');
    assert.equal(repository.rows[0].templateKey, 'ORDER_RECEIVED');
    assert.deepEqual(repository.rows[0].displayValues, { orderCode: 'ORD-001' });
    assert.equal(Reflect.set(repository.rows[0].displayValues, 'orderCode', 'ORD-MUTATED'), false);
    assert.equal(repository.rows[0].displayValues.orderCode, 'ORD-001');
  });

  it('AT-178 renders explicit scalar zero values instead of dropping them', () => {
    const rendered = renderNotification('LOW_STOCK_OPENED', 'LOW_STOCK_OPENED', {
      productName: 'Monstera',
      availableQuantity: 0,
      effectiveThreshold: 0,
    });

    assert.match(rendered.content, /Monstera/);
    assert.match(rendered.content, /còn 0, ngưỡng cảnh báo 0\./);
  });
});
