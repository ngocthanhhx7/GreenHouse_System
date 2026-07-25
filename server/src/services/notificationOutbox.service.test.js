const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const {
  MAX_NOTIFICATION_OUTBOX_ATTEMPTS,
  createNotificationOutboxService,
} = require('./notificationOutbox.service');
const { createNotificationService } = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../utils/notificationContract');

function canonicalRows() {
  return [
    {
      _id: 'row-review', identityKey: 'review:1:v2:moderated', eventType: 'REVIEW_MODERATION_CHANGED',
      payload: {
        businessEventId: 'review:1:v2:moderated',
        recipient: { userId: 'customer-1', role: 'Customer' },
        targetCollection: 'ProductReview', targetId: 'review-1',
        displayValues: { productName: 'Monstera' },
      },
    },
    {
      _id: 'row-support', identityKey: 'support:1:v3:resolved', eventType: 'SUPPORT_RESOLVED',
      payload: {
        businessEventId: 'support:1:v3:resolved', recipientId: 'customer-1',
        target: { collection: 'SupportRequest', id: 'support-1' },
        displayValues: { ticketCode: 'SUP-001' },
      },
    },
    {
      _id: 'row-order', identityKey: 'order:1:received', eventType: 'ORDER_RECEIVED',
      payload: {
        businessEventId: 'order:1:received', recipientId: 'customer-1',
        targetCollection: 'Order', targetId: 'order-1', displayValues: { orderCode: 'ORD-001' },
      },
    },
    {
      _id: 'row-identity', identityKey: 'account:1:disabled:v4', eventType: 'ACCOUNT_DISABLED',
      payload: {
        businessEventId: 'account:1:disabled:v4',
        recipient: { userId: 'customer-1', email: 'customer@example.com', role: 'Customer' },
        displayValues: {},
      },
    },
  ];
}

function harness(rows = canonicalRows(), publish = null) {
  const completed = [];
  const failed = [];
  const published = [];
  const repository = {
    async listPendingNotificationEvents(eventTypes, staleBefore, limit) {
      assert.deepEqual(eventTypes, NOTIFICATION_TYPES);
      assert.ok(staleBefore instanceof Date);
      assert.equal(limit, 100);
      return rows;
    },
    async claimNotificationEvent(id, staleBefore, claimedAt, maxAttempts) {
      assert.ok(staleBefore instanceof Date);
      assert.ok(claimedAt instanceof Date);
      assert.equal(maxAttempts, MAX_NOTIFICATION_OUTBOX_ATTEMPTS);
      const row = rows.find((entry) => entry._id === id);
      if (!row || Number(row.attemptCount || 0) >= maxAttempts || row.status === 'Completed') {
        return null;
      }
      row.attemptCount = Number(row.attemptCount || 0) + 1;
      row.status = 'Processing';
      return { ...row, processingStartedAt: claimedAt };
    },
    async completeNotificationEvent(id, lease) {
      rows.find((entry) => entry._id === id).status = 'Completed';
      completed.push({ id, lease });
    },
    async failNotificationEvent(id, lease, error) {
      rows.find((entry) => entry._id === id).status = 'Failed';
      failed.push({ id, lease, error: error.message });
    },
  };
  const notificationPublisher = {
    async publishDomainEvent(event) {
      published.push(event);
      if (publish) await publish(event);
    },
  };
  return {
    completed, failed, published,
    service: createNotificationOutboxService({
      repository,
      notificationPublisher,
      clock: () => new Date('2030-07-25T00:00:00.000Z'),
    }),
  };
}

describe('SL-009 canonical Notification DomainOutbox consumer', () => {
  it('AT-176/177 claims Review, Support, Order, and identity rows then publishes each canonical event', async () => {
    const test = harness();

    assert.deepEqual(await test.service.drainPostCommitWork(), {
      claimed: 4, completed: 4, failed: 0,
    });
    assert.deepEqual(test.published.map((event) => event.type), [
      'REVIEW_MODERATION_CHANGED', 'SUPPORT_RESOLVED', 'ORDER_RECEIVED', 'ACCOUNT_DISABLED',
    ]);
    assert.deepEqual(test.published.map((event) => event.businessEventId), [
      'review:1:v2:moderated', 'support:1:v3:resolved', 'order:1:received', 'account:1:disabled:v4',
    ]);
    assert.deepEqual(test.completed.map(({ id }) => id), [
      'row-review', 'row-support', 'row-order', 'row-identity',
    ]);
    assert.deepEqual(test.failed, []);
  });

  it('registers the canonical Notification consumer in the production DomainOutbox worker', () => {
    const serverSource = readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(serverSource, /notificationOutboxService/);
    assert.match(serverSource, /services:\s*\[[^\]]*notificationOutboxService[^\]]*\]/s);
  });

  it('AT-DR-008 drains customer receipt completion and dispute rows through the production Notification consumer', async () => {
    const notificationRows = [];
    const emailRows = [];
    const publisher = createNotificationService({
      notificationRepository: {
        async findRecipientById() {
          return { _id: 'customer-1', email: 'customer@example.com', role: 'Customer', status: 'Active' };
        },
        async createTuple(data) {
          const row = { _id: `notification-${notificationRows.length + 1}`, ...data };
          notificationRows.push(row);
          return row;
        },
      },
      emailOutboxService: { async enqueue(data) { emailRows.push(data); return data; } },
    });
    const rows = [
      {
        _id: 'row-customer-received',
        identityKey: 'customer-delivery-receipt:received-1',
        eventType: 'ORDER_COMPLETED_BY_CUSTOMER',
        payload: {
          businessEventId: 'customer-delivery-receipt:received-1',
          type: 'ORDER_COMPLETED_BY_CUSTOMER',
          recipient: { userId: 'customer-1', role: 'Customer' },
          target: { collection: 'Order', id: 'order-1' },
          displayValues: { orderCode: 'ORD-001' },
        },
      },
      {
        _id: 'row-delivery-disputed',
        identityKey: 'customer-delivery-receipt:disputed-1',
        eventType: 'CUSTOMER_DELIVERY_DISPUTED',
        payload: {
          businessEventId: 'customer-delivery-receipt:disputed-1',
          type: 'CUSTOMER_DELIVERY_DISPUTED',
          recipient: { userId: 'customer-1', role: 'Customer' },
          target: { collection: 'Order', id: 'order-1' },
          displayValues: { orderCode: 'ORD-001' },
        },
      },
    ];
    const test = harness(rows, (event) => publisher.publishDomainEvent(event));

    assert.deepEqual(await test.service.drainPostCommitWork(), {
      claimed: 2, completed: 2, failed: 0,
    });
    assert.deepEqual(notificationRows.map((row) => [row.type, row.channel]), [
      ['ORDER_COMPLETED_BY_CUSTOMER', 'Email'],
      ['ORDER_COMPLETED_BY_CUSTOMER', 'InApp'],
      ['CUSTOMER_DELIVERY_DISPUTED', 'Email'],
      ['CUSTOMER_DELIVERY_DISPUTED', 'InApp'],
    ]);
    assert.equal(emailRows.length, 2);
  });

  it('AT-DR-010 fails closed when either owner-scoped delivery event reaches DomainOutbox as a Customer broadcast', async () => {
    const notificationRows = [];
    let broadcastLookups = 0;
    const publisher = createNotificationService({
      notificationRepository: {
        async listActiveUsersByRole() {
          broadcastLookups += 1;
          return [
            { _id: 'customer-1', email: 'customer-1@example.com', role: 'Customer', status: 'Active' },
            { _id: 'customer-2', email: 'customer-2@example.com', role: 'Customer', status: 'Active' },
          ];
        },
        async createTuple(data) {
          const row = { _id: `notification-${notificationRows.length + 1}`, ...data };
          notificationRows.push(row);
          return row;
        },
      },
      emailOutboxService: { async enqueue(data) { return data; } },
    });
    const rows = ['ORDER_COMPLETED_BY_CUSTOMER', 'CUSTOMER_DELIVERY_DISPUTED'].map((type) => ({
      _id: `row-${type}`,
      identityKey: `customer-delivery-receipt:${type}:broadcast`,
      eventType: type,
      payload: {
        businessEventId: `customer-delivery-receipt:${type}:broadcast`,
        type,
        recipientRole: 'Customer',
        target: { collection: 'Order', id: 'order-1' },
        displayValues: { orderCode: 'ORD-001' },
      },
    }));
    const test = harness(rows, (event) => publisher.publishDomainEvent(event));

    assert.deepEqual(await test.service.drainPostCommitWork(), {
      claimed: 2, completed: 0, failed: 2,
    });
    assert.equal(broadcastLookups, 0);
    assert.deepEqual(notificationRows, []);
  });

  it('never persists raw publisher errors and leaves the fifth failed claim terminal', async () => {
    const row = { ...canonicalRows()[0], attemptCount: 4, status: 'Failed' };
    const test = harness([row], async () => {
      throw new Error('SMTP customer@example.com token=raw-secret payload={private}');
    });

    assert.deepEqual(await test.service.drainPostCommitWork(), {
      claimed: 1, completed: 0, failed: 1,
    });
    assert.deepEqual(test.failed, [{
      id: 'row-review',
      lease: new Date('2030-07-25T00:00:00.000Z'),
      error: 'Notification delivery failed',
    }]);
    assert.doesNotMatch(JSON.stringify(test.failed), /customer@example|raw-secret|private|SMTP/);
    assert.equal(row.attemptCount, MAX_NOTIFICATION_OUTBOX_ATTEMPTS);
    assert.deepEqual(await test.service.drainPostCommitWork(), {
      claimed: 0, completed: 0, failed: 0,
    });
  });
});
