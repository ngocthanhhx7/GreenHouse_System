const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createPaymentService } = require('./payment.service');

function createPaymentRepository() {
  const orders = [
    {
      _id: 'order-online',
      customerId: 'customer-1',
      orderCode: 'ORD-ONLINE',
      totalAmount: 50,
      paymentMethod: 'ONLINE',
      paymentStatus: 'Pending',
      orderStatus: 'WaitingForPayment',
    },
  ];
  const payments = [
    { _id: 'payment-1', orderId: 'order-online', paymentMethod: 'ONLINE', amount: 50, paymentStatus: 'Pending', transactionId: '' },
  ];
  const attempts = [
    {
      _id: 'attempt-1',
      orderId: 'order-online',
      attemptCode: 'PAY-1',
      paymentMethod: 'ONLINE',
      paymentProvider: 'MOCK',
      amount: 50,
      currency: 'VND',
      paymentStatus: 'Pending',
      transactionId: '',
      providerMessageId: '',
    },
  ];
  const events = [];
  const refunds = [];

  return {
    orders,
    payments,
    attempts,
    events,
    refunds,
    async findOrderById(id) { return orders.find((order) => order._id === id) || null; },
    async findPaymentByOrder(id) { return payments.find((payment) => payment.orderId === id) || null; },
    async updatePayment(id, data) {
      const payment = payments.find((entry) => entry._id === id);
      Object.assign(payment, data);
      return payment;
    },
    async updateOrder(id, data) {
      const order = orders.find((entry) => entry._id === id);
      Object.assign(order, data);
      return order;
    },
    async findLatestAttemptByOrder(id) {
      return attempts.filter((attempt) => attempt.orderId === id).at(-1) || null;
    },
    async findPaymentAttemptById(id) { return attempts.find((attempt) => attempt._id === id) || null; },
    async findPaymentAttemptByProviderOrderCode(provider, providerOrderCode) {
      return attempts.find((attempt) => attempt.paymentProvider === provider && attempt.providerOrderCode === providerOrderCode) || null;
    },
    async createPaymentAttempt(data) {
      const attempt = { _id: `attempt-${attempts.length + 1}`, ...data };
      attempts.push(attempt);
      return attempt;
    },
    async updatePaymentAttempt(id, data) {
      const attempt = attempts.find((entry) => entry._id === id);
      Object.assign(attempt, data);
      return attempt;
    },
    async findCallbackEvent(provider, providerMessageId) {
      return events.find((event) => event.paymentProvider === provider && event.providerMessageId === providerMessageId) || null;
    },
    async createCallbackEvent(data) {
      const duplicated = events.find((event) => event.paymentProvider === data.paymentProvider && event.providerMessageId === data.providerMessageId);
      if (duplicated) {
        const error = new Error('duplicate callback');
        error.code = 11000;
        throw error;
      }
      const event = { _id: `event-${events.length + 1}`, eventStatus: 'Received', ...data };
      events.push(event);
      return event;
    },
    async claimCallbackEvent(id, staleBefore) {
      const event = events.find((entry) => entry._id === id && (
        entry.eventStatus === 'Received'
        || (entry.eventStatus === 'Processing' && entry.processingStartedAt && entry.processingStartedAt <= staleBefore)
      ));
      if (!event) return null;
      event.eventStatus = 'Processing';
      event.processingStartedAt = new Date();
      return event;
    },
    async markCallbackEventProcessed(id, processingResult) {
      const event = events.find((entry) => entry._id === id);
      Object.assign(event, { eventStatus: 'Processed', processingResult });
      return event;
    },
    async upsertRefundPending(data) {
      const existing = refunds.find((refund) => data.obligationKey
        ? refund.obligationKey === data.obligationKey
        : refund.orderId === data.orderId && refund.obligationType === data.obligationType);
      if (existing) return existing;
      const refund = { _id: `refund-${refunds.length + 1}`, ...data };
      refunds.push(refund);
      return refund;
    },
  };
}

function createAuditLogger() {
  const entries = [];
  return { entries, async log(entry) { entries.push(entry); } };
}

function createNotificationService() {
  const notifications = [];
  return { notifications, async notifyPaymentStatus(input) { notifications.push(input); } };
}

describe('payment service', () => {
  let paymentRepository;
  let auditLogger;
  let notificationService;
  let paymentService;
  let payosGateway;

  beforeEach(() => {
    paymentRepository = createPaymentRepository();
    auditLogger = createAuditLogger();
    notificationService = createNotificationService();
    payosGateway = {
      cancelledLinks: [],
      isConfigured: () => true,
      async createPaymentLink({ providerOrderCode }) {
        return {
          paymentLinkId: `link-${providerOrderCode}`,
          checkoutUrl: `https://pay.payos.vn/web/${providerOrderCode}`,
          qrCode: 'payos-qr-payload',
          expiredAt: Math.floor(Date.now() / 1000) + 900,
        };
      },
      async verifyWebhook(payload) { return payload.verifiedData; },
      async cancelPaymentLink(paymentLinkId, reason) { this.cancelledLinks.push({ paymentLinkId, reason }); },
    };
    paymentService = createPaymentService({ paymentRepository, auditLogger, notificationService, callbackSecret: 'test-callback-secret', payosGateway });
  });

  it('creates an additional online payment attempt for a waiting order', async () => {
    const result = await paymentService.createOnlinePaymentRequest('customer-1', 'order-online');
    assert.equal(result.orderId, 'order-online');
    assert.equal(result.paymentStatus, 'Pending');
    assert.equal(result.paymentProvider, 'PAYOS');
    assert.match(result.checkoutUrl, /^https:\/\/pay\.payos\.vn\/web\//);
    assert.equal(paymentRepository.attempts.length, 2);
  });

  it('rejects a non-integer VND amount before creating a payOS link', async () => {
    paymentRepository.orders[0].totalAmount = 50.5;
    await assert.rejects(
      () => paymentService.createOnlinePaymentRequest('customer-1', 'order-online'),
      /số nguyên VND dương/i
    );
    assert.equal(paymentRepository.attempts.length, 1);
  });

  it('retires a nearly expired payOS link before creating its replacement', async () => {
    Object.assign(paymentRepository.attempts[0], {
      paymentProvider: 'PAYOS',
      providerOrderCode: 1001,
      paymentLinkId: 'old-link',
      checkoutUrl: 'https://pay.payos.vn/web/old-link',
      expiresAt: new Date(Date.now() + 10_000),
    });

    const result = await paymentService.createOnlinePaymentRequest('customer-1', 'order-online');

    assert.equal(paymentRepository.attempts[0].paymentStatus, 'Cancelled');
    assert.equal(payosGateway.cancelledLinks[0].paymentLinkId, 'old-link');
    assert.notEqual(result.paymentLinkId, 'old-link');
  });

  it('verifies a payOS webhook and applies the paid transition once', async () => {
    const created = await paymentService.createOnlinePaymentRequest('customer-1', 'order-online');
    const result = await paymentService.handlePayOSWebhook({
      verifiedData: {
        orderCode: created.providerOrderCode,
        amount: 50,
        paymentLinkId: created.paymentLinkId,
        reference: 'PAYOS-REF-1',
        code: '00',
        desc: 'success',
      },
    });

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.events[0].paymentProvider, 'PAYOS');
  });

  it('hands a payment after the payOS link expiry to refund processing', async () => {
    Object.assign(paymentRepository.attempts[0], {
      paymentProvider: 'PAYOS',
      providerOrderCode: 1002,
      paymentLinkId: 'expired-link',
      expiresAt: new Date('2026-07-22T02:00:00.000Z'),
    });

    const result = await paymentService.handlePayOSWebhook({
      verifiedData: {
        orderCode: 1002,
        amount: 50,
        paymentLinkId: 'expired-link',
        reference: 'PAYOS-LATE-1',
        transactionDateTime: '2026-07-22 09:05:00',
        code: '00',
        desc: 'success',
      },
    });

    assert.equal(result.paymentStatus, 'RefundPending');
    assert.equal(result.refundPending, true);
    assert.equal(paymentRepository.orders[0].orderStatus, 'WaitingForPayment');
    assert.equal(paymentRepository.refunds.length, 1);
    assert.equal(paymentRepository.refunds[0].obligationType, 'PAYMENT_REVERSAL');
    assert.equal(paymentRepository.refunds[0].obligationKey, 'PAYMENT_REVERSAL:attempt-1');
  });

  it('does not overwrite a paid order when another payOS attempt is also paid', async () => {
    paymentRepository.orders[0].paymentStatus = 'Paid';
    paymentRepository.orders[0].orderStatus = 'Pending';
    paymentRepository.attempts[0].paymentStatus = 'Paid';
    paymentRepository.attempts.push({
      _id: 'attempt-2',
      orderId: 'order-online',
      attemptCode: 'PAY-2',
      paymentMethod: 'ONLINE',
      paymentProvider: 'PAYOS',
      providerOrderCode: 1003,
      paymentStatus: 'Pending',
      amount: 50,
      currency: 'VND',
    });

    const result = await paymentService.handlePayOSWebhook({
      verifiedData: {
        orderCode: 1003,
        amount: 50,
        paymentLinkId: 'duplicate-paid-link',
        reference: 'PAYOS-DUPLICATE-PAID',
        transactionDateTime: '2026-07-22 09:05:00',
        code: '00',
        desc: 'success',
      },
    });

    assert.equal(result.paymentStatus, 'RefundPending');
    assert.equal(result.duplicatePayment, true);
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.attempts[1].paymentStatus, 'RefundPending');
  });

  it('acknowledges a verified payOS webhook used to validate an unknown order code', async () => {
    const result = await paymentService.handlePayOSWebhook({
      verifiedData: {
        orderCode: 123,
        amount: 3000,
        paymentLinkId: 'payos-validation-link',
        reference: 'payos-validation-reference',
        code: '00',
        desc: 'success',
      },
    });

    assert.equal(result.ignored, true);
    assert.equal(result.reason, 'PAYMENT_ATTEMPT_NOT_FOUND');
  });

  it('marks order and authoritative attempt paid when a new callback succeeds', async () => {
    const result = await paymentService.handlePaymentCallback({
      orderId: 'order-online', paymentAttemptId: 'attempt-1', transactionId: 'TXN-1', providerMessageId: 'MSG-1', amount: 50, status: 'Paid', callbackSecret: 'test-callback-secret',
    });
    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.orders[0].orderStatus, 'Pending');
    assert.equal(paymentRepository.attempts[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.events.length, 1);
    assert.equal(auditLogger.entries[0].action, 'PAYMENT_CALLBACK_PAID');
    assert.equal(notificationService.notifications[0].paymentStatus, 'Paid');
  });

  it('records duplicate callback once and does not repeat mutation, audit, notification, or refund', async () => {
    const input = { orderId: 'order-online', transactionId: 'TXN-2', providerMessageId: 'MSG-2', amount: 50, status: 'Paid', callbackSecret: 'test-callback-secret' };
    const first = await paymentService.handlePaymentCallback(input);
    const second = await paymentService.handlePaymentCallback(input);
    assert.equal(second.paymentStatus, first.paymentStatus);
    assert.equal(paymentRepository.events.length, 1);
    assert.equal(auditLogger.entries.length, 1);
    assert.equal(notificationService.notifications.length, 1);
    assert.equal(paymentRepository.refunds.length, 0);
  });

  it('records the callback payload without persisting its shared secret', async () => {
    await paymentService.handlePaymentCallback({
      orderId: 'order-online', transactionId: 'TXN-SAFE', providerMessageId: 'MSG-SAFE', amount: 50, status: 'Paid', callbackSecret: 'test-callback-secret',
    });
    assert.equal(paymentRepository.events[0].rawPayload.callbackSecret, undefined);
  });

  it('reprocesses a previously received callback event after an interrupted attempt', async () => {
    paymentRepository.events.push({
      _id: 'event-received',
      eventStatus: 'Received',
      orderId: 'order-online',
      paymentAttemptId: 'attempt-1',
      paymentProvider: 'MOCK',
      providerMessageId: 'MSG-RECOVER',
      rawPayload: {},
    });

    const result = await paymentService.handlePaymentCallback({
      orderId: 'order-online', paymentAttemptId: 'attempt-1', transactionId: 'TXN-RECOVER', providerMessageId: 'MSG-RECOVER', amount: 50, status: 'Paid', callbackSecret: 'test-callback-secret',
    });

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(paymentRepository.events[0].eventStatus, 'Processed');
    assert.equal(auditLogger.entries.length, 1);
    assert.equal(notificationService.notifications.length, 1);
  });

  it('does not run side effects twice when another worker owns a callback event', async () => {
    paymentRepository.events.push({
      _id: 'event-processing',
      eventStatus: 'Processing',
      orderId: 'order-online',
      paymentAttemptId: 'attempt-1',
      paymentProvider: 'MOCK',
      providerMessageId: 'MSG-PROCESSING',
      rawPayload: {},
    });

    await assert.rejects(
      () => paymentService.handlePaymentCallback({
        orderId: 'order-online', paymentAttemptId: 'attempt-1', transactionId: 'TXN-PROCESSING', providerMessageId: 'MSG-PROCESSING', amount: 50, status: 'Paid', callbackSecret: 'test-callback-secret',
      }),
      /already being processed/
    );
    assert.equal(auditLogger.entries.length, 0);
    assert.equal(notificationService.notifications.length, 0);
  });

  it('reclaims a callback whose processing lease expired after a worker crash', async () => {
    paymentRepository.events.push({
      _id: 'event-stale-processing',
      eventStatus: 'Processing',
      processingStartedAt: new Date(Date.now() - 120_000),
      orderId: 'order-online',
      paymentAttemptId: 'attempt-1',
      paymentProvider: 'MOCK',
      providerMessageId: 'MSG-STALE-PROCESSING',
      rawPayload: {},
    });

    const result = await paymentService.handlePaymentCallback({
      orderId: 'order-online', paymentAttemptId: 'attempt-1', transactionId: 'TXN-STALE', providerMessageId: 'MSG-STALE-PROCESSING', amount: 50, status: 'Paid', callbackSecret: 'test-callback-secret',
    });

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(paymentRepository.events[0].eventStatus, 'Processed');
  });

  it('keeps a cancelled order closed and creates one RefundPending hand-off when a paid callback arrives late', async () => {
    paymentRepository.orders[0].orderStatus = 'Cancelled';
    paymentRepository.orders[0].paymentStatus = 'Cancelled';
    const input = { orderId: 'order-online', transactionId: 'TXN-LATE', providerMessageId: 'MSG-LATE', amount: 50, status: 'Paid', callbackSecret: 'test-callback-secret' };
    const result = await paymentService.handlePaymentCallback(input);
    await paymentService.handlePaymentCallback(input);

    assert.equal(result.paymentStatus, 'RefundPending');
    assert.equal(paymentRepository.orders[0].orderStatus, 'Cancelled');
    assert.equal(paymentRepository.orders[0].paymentStatus, 'RefundPending');
    assert.equal(paymentRepository.attempts[0].paymentStatus, 'RefundPending');
    assert.equal(paymentRepository.refunds.length, 1);
    assert.equal(paymentRepository.refunds[0].status, 'RefundPending');
    assert.equal(paymentRepository.refunds[0].obligationType, 'PAYMENT_REVERSAL');
    assert.equal(paymentRepository.refunds[0].obligationKey, 'PAYMENT_REVERSAL:attempt-1');
    assert.equal(auditLogger.entries.length, 1);
    assert.equal(notificationService.notifications.length, 1);
  });

  it('rejects callback amount mismatch and missing callback identity', async () => {
    await assert.rejects(
      () => paymentService.handlePaymentCallback({ orderId: 'order-online', transactionId: 'TXN-3', amount: 51, status: 'Paid', callbackSecret: 'test-callback-secret' }),
      /Payment amount does not match order total/
    );
    await assert.rejects(
      () => paymentService.handlePaymentCallback({ orderId: 'order-online', amount: 50, status: 'Paid', callbackSecret: 'test-callback-secret' }),
      /provider message identity is required/
    );
  });

  it('rejects callbacks without the configured secret and preserves a paid order on later failure', async () => {
    await assert.rejects(
      () => paymentService.handlePaymentCallback({ orderId: 'order-online', transactionId: 'TXN-4', amount: 50, status: 'Paid' }),
      /Invalid payment callback secret/
    );
    paymentRepository.orders[0].paymentStatus = 'Paid';
    paymentRepository.orders[0].orderStatus = 'Pending';
    paymentRepository.attempts[0].paymentStatus = 'Paid';
    const result = await paymentService.handlePaymentCallback({
      orderId: 'order-online', transactionId: 'TXN-FAIL', providerMessageId: 'MSG-FAIL', amount: 50, status: 'Failed', callbackSecret: 'test-callback-secret',
    });
    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Paid');
  });
});
