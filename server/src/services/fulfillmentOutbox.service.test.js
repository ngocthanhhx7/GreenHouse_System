const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, it } = require('node:test');

const { createFulfillmentService } = require('./fulfillment.service');

function createHarness({
  failFirstNotification = false,
  failFirstCompletion = false,
} = {}) {
  const order = {
    _id: 'order-1',
    orderCode: 'GH-004-OUTBOX',
    customerId: 'customer-1',
  };
  const outbox = [
    {
      _id: 'outbox-1',
      identityKey: 'shipment-event:event-1:DELIVERY_ATTEMPT_FAILED',
      eventType: 'DELIVERY_ATTEMPT_FAILED',
      payload: { orderId: 'order-1', shipmentId: 'shipment-1', eventId: 'event-1' },
      status: 'Pending',
      attemptCount: 0,
      processingStartedAt: null,
    },
  ];
  const notifications = [];
  let shouldFail = failFirstNotification;
  let shouldFailCompletion = failFirstCompletion;
  const repository = {
    async findOrderById(id) { return id === order._id ? order : null; },
    async listPendingPostCommitWork(eventTypes) {
      return outbox.filter((item) => eventTypes.includes(item.eventType)
        && ['Pending', 'Failed'].includes(item.status));
    },
    async claimPostCommitWork(id, staleBefore, now) {
      const item = outbox.find((entry) => entry._id === id);
      if (!item || !['Pending', 'Failed'].includes(item.status)) return null;
      Object.assign(item, {
        status: 'Processing',
        processingStartedAt: now,
        attemptCount: item.attemptCount + 1,
        lastError: '',
      });
      return item;
    },
    async markPostCommitWorkDone(id, processingStartedAt) {
      if (shouldFailCompletion) {
        shouldFailCompletion = false;
        throw new Error('outbox completion unavailable');
      }
      const item = outbox.find((entry) => entry._id === id
        && entry.status === 'Processing'
        && entry.processingStartedAt === processingStartedAt);
      if (!item) return null;
      Object.assign(item, {
        status: 'Completed',
        completedAt: new Date('2026-07-24T08:00:00.000Z'),
        processingStartedAt: null,
      });
      return item;
    },
    async markPostCommitWorkFailed(id, processingStartedAt, error) {
      const item = outbox.find((entry) => entry._id === id
        && entry.status === 'Processing'
        && entry.processingStartedAt === processingStartedAt);
      if (!item) return null;
      Object.assign(item, {
        status: 'Failed',
        processingStartedAt: null,
        lastError: error.message,
      });
      return item;
    },
  };
  const notificationPublisher = {
    async createInAppNotification(input) {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('notification store unavailable');
      }
      const existing = notifications.find((entry) => (
        entry.userId === input.userId && entry.eventId === input.eventId
      ));
      if (existing) return existing;
      const created = { id: `notification-${notifications.length + 1}`, ...input };
      notifications.push(created);
      return created;
    },
  };
  const service = createFulfillmentService({
    repository,
    notificationPublisher,
    transactionManager: { async withTransaction(work) { return work({}); } },
    auditLogger: { async log() {} },
    assignmentCoordinator: { async coordinate() {} },
    clock: () => new Date('2026-07-24T08:00:00.000Z'),
  });
  return { service, outbox, notifications };
}

describe('SL-004 fulfillment notification outbox consumer', () => {
  it('retries a failed durable notification independently and completes it idempotently once', async () => {
    const { service, outbox, notifications } = createHarness({ failFirstNotification: true });
    assert.equal(typeof service.drainPostCommitWork, 'function');

    await service.drainPostCommitWork();
    assert.equal(outbox[0].status, 'Failed');
    assert.equal(outbox[0].attemptCount, 1);
    assert.equal(notifications.length, 0);

    await service.drainPostCommitWork();
    assert.equal(outbox[0].status, 'Completed');
    assert.equal(outbox[0].attemptCount, 2);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'DELIVERY_ATTEMPT_FAILED');
    assert.equal(
      notifications[0].eventId,
      'FULFILLMENT:shipment-event:event-1:DELIVERY_ATTEMPT_FAILED',
    );

    await service.drainPostCommitWork();
    assert.equal(notifications.length, 1);
  });

  it('does not duplicate the Notification when completion recording fails after publication', async () => {
    const { service, outbox, notifications } = createHarness({ failFirstCompletion: true });

    await service.drainPostCommitWork();
    assert.equal(outbox[0].status, 'Failed');
    assert.equal(notifications.length, 1);

    await service.drainPostCommitWork();
    assert.equal(outbox[0].status, 'Completed');
    assert.equal(notifications.length, 1);
  });

  it('registers the fulfillment consumer in the shared domain outbox worker', () => {
    const source = readFileSync(join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(source, /services:\s*\[[^\]]*fulfillmentService[^\]]*\]/s);
  });
});
