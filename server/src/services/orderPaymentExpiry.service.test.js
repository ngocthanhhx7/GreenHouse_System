const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createOrderPaymentExpiryService } = require('./orderPaymentExpiry.service');

function createFixture() {
  const order = {
    _id: 'order-1',
    orderCode: 'ORD-001',
    customerId: 'customer-1',
    paymentMethod: 'ONLINE',
    paymentStatus: 'Pending',
    orderStatus: 'Pending',
    paymentDeadlineAt: new Date('2026-07-23T08:00:00.000Z'),
  };
  const details = [
    { productId: 'product-a', quantity: 2 },
    { productId: 'product-b', quantity: 1 },
  ];
  const releases = [];
  const attempts = [{
    _id: 'attempt-active',
    orderId: 'order-1',
    paymentStatus: 'Pending',
    paymentLinkId: 'payos-link-active',
  }];
  const payments = [{ _id: 'payment-1', orderId: 'order-1', paymentStatus: 'Pending' }];
  const auditEntries = [];
  const notifications = [];
  const retiredLinks = [];
  let committed = false;

  const repository = {
    async listDueOnlineOrders(now) {
      return order.orderStatus === 'Pending'
        && order.paymentStatus === 'Pending'
        && order.paymentDeadlineAt <= now
        ? [order]
        : [];
    },
    async claimExpiry(id, now, data) {
      if (id !== order._id || order.orderStatus !== 'Pending' || order.paymentStatus !== 'Pending' || order.paymentDeadlineAt > now) return null;
      Object.assign(order, data);
      return { ...order };
    },
    async listOrderDetails(orderId) { return orderId === order._id ? details : []; },
    async cancelPendingPayment(orderId) {
      const payment = payments.find((entry) => entry.orderId === orderId && entry.paymentStatus === 'Pending');
      if (payment) payment.paymentStatus = 'Cancelled';
      return payment || null;
    },
    async expireActivePaymentAttempt(orderId) {
      const attempt = attempts.find((entry) => entry.orderId === orderId && entry.paymentStatus === 'Pending');
      if (attempt) attempt.paymentStatus = 'Expired';
      return attempt || null;
    },
  };
  const transactionManager = {
    async withTransaction(work) {
      const result = await work({ id: 'session-1' });
      committed = true;
      return result;
    },
  };
  const service = createOrderPaymentExpiryService({
    repository,
    transactionManager,
    inventoryRepository: { async release(productId, quantity) { releases.push({ productId, quantity }); return true; } },
    auditLogger: { async log(entry) { assert.equal(committed, true); auditEntries.push(entry); } },
    notificationPublisher: { async publish(entry) { assert.equal(committed, true); notifications.push(entry); } },
    payosGateway: {
      async cancelPaymentLink(paymentLinkId, reason) {
        assert.equal(committed, true);
        retiredLinks.push({ paymentLinkId, reason });
      },
    },
    clock: () => new Date('2026-07-23T08:00:01.000Z'),
  });
  return { service, order, payments, attempts, releases, auditEntries, notifications, retiredLinks, repository };
}

describe('order payment expiry service', () => {
  it('claims only expiry events from the shared domain outbox', async () => {
    let requestedTypes = null;
    const service = createOrderPaymentExpiryService({
      repository: {
        async listPendingPostCommitWork(eventTypes) {
          requestedTypes = eventTypes;
          return [];
        },
      },
    });

    await service.drainPostCommitWork();

    assert.deepEqual(requestedTypes, [
      'ORDER_PAYMENT_EXPIRED_AUDIT',
      'ORDER_PAYMENT_EXPIRED_NOTIFICATION',
    ]);
  });

  it('does not publish a durable expiry event claimed by another worker', async () => {
    const auditEntries = [];
    let claimedId = null;
    const service = createOrderPaymentExpiryService({
      repository: {
        async listPendingPostCommitWork() {
          return [{
            _id: 'outbox-expiry-lost',
            identityKey: 'ORDER_PAYMENT_EXPIRED_AUDIT:lost',
            eventType: 'ORDER_PAYMENT_EXPIRED_AUDIT',
            payload: { action: 'ORDER_PAYMENT_EXPIRED' },
          }];
        },
        async claimPostCommitWork(id) {
          claimedId = id;
          return null;
        },
      },
      auditLogger: { async log(entry) { auditEntries.push(entry); } },
    });

    await service.drainPostCommitWork();

    assert.equal(claimedId, 'outbox-expiry-lost');
    assert.equal(auditEntries.length, 0);
  });

  it('persists failed post-commit effects for a later retry without repeating expiry', async () => {
    const fixture = createFixture();
    const workItems = [];
    let auditAttempts = 0;
    const repository = {
      ...fixture.repository,
      async enqueuePostCommitWork(item) { workItems.push(item); return item; },
    };
    const service = createOrderPaymentExpiryService({
      repository,
      transactionManager: { async withTransaction(work) { return work({}); } },
      inventoryRepository: { async release() { return true; } },
      auditLogger: { async log() { auditAttempts += 1; if (auditAttempts === 1) throw new Error('audit unavailable'); } },
      notificationPublisher: { async publish() { return true; } },
      clock: () => new Date('2026-07-23T08:00:01.000Z'),
    });

    const first = await service.expireOverdueOrders();
    const second = await service.expireOverdueOrders();
    assert.deepEqual(first, { expired: 1 });
    assert.deepEqual(second, { expired: 0 });
    assert.equal(workItems.length, 2);
    assert.equal(fixture.order.orderStatus, 'Cancelled');
  });

  it('does not publish transaction-local expiry work when commit fails', async () => {
    const fixture = createFixture();
    const auditEntries = [];
    const notifications = [];
    const service = createOrderPaymentExpiryService({
      repository: {
        ...fixture.repository,
        async enqueuePostCommitWork(item) {
          return { _id: `transaction-local-${item.eventType}`, ...item };
        },
        async listPendingPostCommitWork() {
          return [];
        },
      },
      transactionManager: {
        async withTransaction(work) {
          await work({ id: 'rolled-back-session' });
          throw new Error('commit failed');
        },
      },
      inventoryRepository: { async release() { return true; } },
      auditLogger: { async log(entry) { auditEntries.push(entry); } },
      notificationPublisher: { async publish(entry) { notifications.push(entry); } },
      clock: () => new Date('2026-07-23T08:00:01.000Z'),
    });

    await assert.rejects(() => service.expireOverdueOrders(), /commit failed/);
    await service.drainPostCommitWork();

    assert.equal(auditEntries.length, 0);
    assert.equal(notifications.length, 0);
  });

  it('expires one due online order atomically then releases each reservation once after the winner transition', async () => {
    const fixture = createFixture();

    const result = await fixture.service.expireOverdueOrders();

    assert.deepEqual(result, { expired: 1 });
    assert.equal(fixture.order.orderStatus, 'Cancelled');
    assert.equal(fixture.order.paymentStatus, 'Cancelled');
    assert.equal(fixture.payments[0].paymentStatus, 'Cancelled');
    assert.equal(fixture.attempts[0].paymentStatus, 'Expired');
    assert.deepEqual(fixture.releases, [
      { productId: 'product-a', quantity: 2 },
      { productId: 'product-b', quantity: 1 },
    ]);
    assert.equal(fixture.auditEntries[0].action, 'ORDER_PAYMENT_EXPIRED');
    assert.equal(fixture.notifications[0].eventId, 'ORDER_PAYMENT_EXPIRED:order-1');
    assert.deepEqual(fixture.retiredLinks, [{
      paymentLinkId: 'payos-link-active',
      reason: 'Order payment deadline expired',
    }]);
  });

  it('fails closed when an expired order has no exact reservation lineage to release', async () => {
    const fixture = createFixture();
    fixture.repository.claimReservationRelease = async () => null;
    fixture.service = createOrderPaymentExpiryService({
      repository: fixture.repository,
      transactionManager: { async withTransaction(work) { return work({}); } },
      inventoryRepository: {
        async release() {
          throw new Error('aggregate inventory must not be released without an owned lineage');
        },
      },
      auditLogger: { async log() {} },
      notificationPublisher: { async publish() {} },
      clock: () => new Date('2026-07-23T08:00:01.000Z'),
    });

    await assert.rejects(
      () => fixture.service.expireOverdueOrders(),
      /reservation.*missing|reservation.*released|reservation.*intact/i,
    );
  });

  it('does not release, audit, or notify when another committed transition wins the expiry race', async () => {
    const fixture = createFixture();
    fixture.service = createOrderPaymentExpiryService({
      repository: {
        async listDueOnlineOrders() { return [fixture.order]; },
        async claimExpiry() { return null; },
        async listOrderDetails() { throw new Error('must not load details after a lost claim'); },
      },
      transactionManager: { async withTransaction(work) { return work({}); } },
      inventoryRepository: { async release() { throw new Error('must not release after a lost claim'); } },
      auditLogger: { async log() { throw new Error('must not audit after a lost claim'); } },
      notificationPublisher: { async publish() { throw new Error('must not notify after a lost claim'); } },
      clock: () => new Date('2026-07-23T08:00:01.000Z'),
    });

    const result = await fixture.service.expireOverdueOrders();

    assert.deepEqual(result, { expired: 0 });
  });

  it('is repeat-idempotent after the deadline transition has committed', async () => {
    const fixture = createFixture();

    await fixture.service.expireOverdueOrders();
    const replay = await fixture.service.expireOverdueOrders();

    assert.deepEqual(replay, { expired: 0 });
    assert.equal(fixture.releases.length, 2);
    assert.equal(fixture.auditEntries.length, 1);
    assert.equal(fixture.notifications.length, 1);
  });
});
