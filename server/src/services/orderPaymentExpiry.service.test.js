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
  return { service, order, payments, attempts, releases, auditEntries, notifications, retiredLinks };
}

describe('order payment expiry service', () => {
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
