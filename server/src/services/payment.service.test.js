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
      orderStatus: 'Pending',
      paymentDeadlineAt: new Date('2099-01-01T00:00:00.000Z'),
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
    async updatePendingPayment(id, data) {
      const payment = payments.find((entry) => (
        entry._id === id && ['Unpaid', 'Pending', 'Failed'].includes(entry.paymentStatus)
      ));
      if (!payment) return null;
      Object.assign(payment, data);
      return payment;
    },
    async updateOrder(id, data) {
      const order = orders.find((entry) => entry._id === id);
      Object.assign(order, data);
      return order;
    },
    async claimOrderPayment(id, data) {
      const order = orders.find((entry) => (
        entry._id === id
        && entry.orderStatus === 'Pending'
        && ['Unpaid', 'Pending', 'Failed'].includes(entry.paymentStatus)
      ));
      if (!order) return null;
      Object.assign(order, data);
      return order;
    },
    async findLatestAttemptByOrder(id) {
      return attempts.filter((attempt) => attempt.orderId === id).at(-1) || null;
    },
    async findPrimaryPaidPaymentAttemptByOrder(id) {
      return attempts.find((attempt) => attempt.orderId === id && attempt.paymentStatus === 'Paid') || null;
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

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(result.refundPending, true);
    assert.equal(paymentRepository.orders[0].orderStatus, 'Pending');
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Pending');
    assert.equal(paymentRepository.payments[0].paymentStatus, 'Pending');
    assert.equal(paymentRepository.attempts[0].paymentStatus, 'Paid');
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

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(result.duplicatePayment, true);
    assert.equal(result.refundPending, true);
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.attempts[1].paymentStatus, 'Paid');
    assert.equal(paymentRepository.refunds.length, 1);
    assert.equal(paymentRepository.refunds[0].obligationType, 'EXCESS_PAYMENT');
    assert.equal(paymentRepository.refunds[0].obligationKey, 'EXCESS_PAYMENT:attempt-2');
  });

  it('does not create a provider link at or after the immutable order deadline', async () => {
    paymentRepository.orders[0].paymentDeadlineAt = new Date('2020-01-01T00:00:00.000Z');

    await assert.rejects(
      () => paymentService.createOnlinePaymentRequest('customer-1', 'order-online'),
      (error) => error.errorCode === 'PAYMENT_DEADLINE_EXPIRED',
    );
    assert.equal(paymentRepository.attempts.length, 1);
  });

  it('retires a newly-created provider link if the order closes during link creation', async () => {
    payosGateway.createPaymentLink = async ({ providerOrderCode }) => {
      paymentRepository.orders[0].orderStatus = 'Cancelled';
      paymentRepository.orders[0].paymentStatus = 'Cancelled';
      return {
        paymentLinkId: `link-${providerOrderCode}`,
        checkoutUrl: `https://pay.payos.vn/web/${providerOrderCode}`,
        qrCode: 'payos-qr-payload',
        expiredAt: Math.floor(Date.now() / 1000) + 900,
      };
    };

    await assert.rejects(
      () => paymentService.createOnlinePaymentRequest('customer-1', 'order-online'),
      (error) => error.errorCode === 'PAYMENT_ORDER_STATE_CHANGED',
    );

    assert.equal(paymentRepository.attempts.at(-1).paymentStatus, 'Cancelled');
    assert.equal(payosGateway.cancelledLinks.length, 1);
    assert.equal(paymentRepository.payments[0].paymentStatus, 'Pending');
  });

  it('creates one EXCESS_PAYMENT obligation for each distinct later paid attempt without replaying side effects', async () => {
    paymentRepository.orders[0].paymentStatus = 'Paid';
    paymentRepository.orders[0].orderStatus = 'Pending';
    paymentRepository.payments[0].paymentStatus = 'Paid';
    paymentRepository.attempts[0].paymentStatus = 'Paid';
    paymentRepository.attempts.push(
      {
        _id: 'attempt-2',
        orderId: 'order-online',
        attemptCode: 'PAY-2',
        paymentMethod: 'ONLINE',
        paymentProvider: 'MOCK',
        paymentStatus: 'Pending',
        amount: 50,
        currency: 'VND',
      },
      {
        _id: 'attempt-3',
        orderId: 'order-online',
        attemptCode: 'PAY-3',
        paymentMethod: 'ONLINE',
        paymentProvider: 'MOCK',
        paymentStatus: 'Pending',
        amount: 50,
        currency: 'VND',
      }
    );
    const secondAttempt = {
      orderId: 'order-online',
      paymentAttemptId: 'attempt-2',
      transactionId: 'TXN-EXCESS-2',
      providerMessageId: 'MSG-EXCESS-2',
      amount: 50,
      status: 'Paid',
      callbackSecret: 'test-callback-secret',
    };
    const thirdAttempt = {
      orderId: 'order-online',
      paymentAttemptId: 'attempt-3',
      transactionId: 'TXN-EXCESS-3',
      providerMessageId: 'MSG-EXCESS-3',
      amount: 50,
      status: 'Paid',
      callbackSecret: 'test-callback-secret',
    };

    await paymentService.handlePaymentCallback(secondAttempt);
    await paymentService.handlePaymentCallback(secondAttempt);
    await paymentService.handlePaymentCallback(thirdAttempt);
    await paymentService.handlePaymentCallback(thirdAttempt);

    assert.deepEqual(
      paymentRepository.attempts.map(({ _id, paymentStatus }) => ({ _id, paymentStatus })),
      [
        { _id: 'attempt-1', paymentStatus: 'Paid' },
        { _id: 'attempt-2', paymentStatus: 'Paid' },
        { _id: 'attempt-3', paymentStatus: 'Paid' },
      ]
    );
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.payments[0].paymentStatus, 'Paid');
    assert.deepEqual(
      paymentRepository.refunds.map(({ obligationType, obligationKey }) => ({ obligationType, obligationKey })),
      [
        { obligationType: 'EXCESS_PAYMENT', obligationKey: 'EXCESS_PAYMENT:attempt-2' },
        { obligationType: 'EXCESS_PAYMENT', obligationKey: 'EXCESS_PAYMENT:attempt-3' },
      ]
    );
    assert.equal(paymentRepository.events.length, 2);
    assert.equal(auditLogger.entries.length, 2);
    assert.equal(notificationService.notifications.length, 2);
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

  it('commits callback business writes atomically and publishes side effects only after commit', async () => {
    const session = { id: 'payment-callback-session' };
    const seenSessions = [];
    let insideTransaction = false;
    let transactionCalls = 0;

    for (const methodName of [
      'updatePaymentAttempt',
      'claimOrderPayment',
      'updatePendingPayment',
      'markCallbackEventProcessed',
    ]) {
      const original = paymentRepository[methodName].bind(paymentRepository);
      paymentRepository[methodName] = async (...args) => {
        seenSessions.push({ methodName, session: args.at(-1) });
        return original(...args);
      };
    }

    const transactionalNotificationService = {
      notifications: [],
      async notifyPaymentStatus(input) {
        assert.equal(insideTransaction, false, 'notification must run after the business transaction commits');
        this.notifications.push(input);
      },
    };
    const transactionalAuditLogger = {
      entries: [],
      async log(input) {
        assert.equal(insideTransaction, false, 'audit publication must run after the business transaction commits');
        this.entries.push(input);
      },
    };
    const transactionalService = createPaymentService({
      paymentRepository,
      notificationService: transactionalNotificationService,
      auditLogger: transactionalAuditLogger,
      callbackSecret: 'test-callback-secret',
      payosGateway,
      transactionManager: {
        async withTransaction(work) {
          transactionCalls += 1;
          insideTransaction = true;
          try {
            return await work(session);
          } finally {
            insideTransaction = false;
          }
        },
      },
    });

    const result = await transactionalService.handlePaymentCallback({
      orderId: 'order-online',
      paymentAttemptId: 'attempt-1',
      transactionId: 'TXN-ATOMIC',
      providerMessageId: 'MSG-ATOMIC',
      amount: 50,
      status: 'Paid',
      callbackSecret: 'test-callback-secret',
    });

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(transactionCalls, 1);
    assert.deepEqual(
      seenSessions.map(({ methodName }) => methodName).sort(),
      ['claimOrderPayment', 'markCallbackEventProcessed', 'updatePaymentAttempt', 'updatePendingPayment'].sort(),
    );
    assert.ok(
      seenSessions
        .filter((entry) => entry.methodName !== 'markCallbackEventProcessed')
        .every((entry) => entry.session === session),
    );
    assert.notEqual(
      seenSessions.find((entry) => entry.methodName === 'markCallbackEventProcessed').session,
      session,
      'the callback is marked processed only after post-commit effects are queued',
    );
    assert.equal(transactionalAuditLogger.entries.length, 1);
    assert.equal(transactionalNotificationService.notifications.length, 1);
  });

  it('retries idempotent post-commit effects after notification enqueue fails without repeating business writes', async () => {
    const auditEvents = new Map();
    let notificationAttempts = 0;
    const resilientService = createPaymentService({
      paymentRepository,
      callbackSecret: 'test-callback-secret',
      payosGateway,
      callbackProcessingLeaseMs: 1,
      auditLogger: {
        async log(input) {
          if (!auditEvents.has(input.eventId)) auditEvents.set(input.eventId, input);
        },
      },
      notificationService: {
        async notifyPaymentStatus(input) {
          notificationAttempts += 1;
          if (notificationAttempts === 1) throw new Error('notification queue unavailable');
          return input;
        },
      },
      transactionManager: { async withTransaction(work) { return work({ id: 'retry-session' }); } },
    });
    const input = {
      orderId: 'order-online',
      paymentAttemptId: 'attempt-1',
      transactionId: 'TXN-POST-COMMIT-RETRY',
      providerMessageId: 'MSG-POST-COMMIT-RETRY',
      amount: 50,
      status: 'Paid',
      callbackSecret: 'test-callback-secret',
    };

    await assert.rejects(() => resilientService.handlePaymentCallback(input), /notification queue unavailable/);
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.attempts[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.events[0].eventStatus, 'Processing');

    paymentRepository.events[0].processingStartedAt = new Date(Date.now() - 1000);
    const replayed = await resilientService.handlePaymentCallback(input);

    assert.equal(replayed.paymentStatus, 'Paid');
    assert.equal(paymentRepository.events[0].eventStatus, 'Processed');
    assert.equal(auditEvents.size, 1);
    assert.equal(notificationAttempts, 2);
    assert.equal(paymentRepository.refunds.length, 0);
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
    paymentRepository.payments[0].paymentStatus = 'Cancelled';
    const input = { orderId: 'order-online', transactionId: 'TXN-LATE', providerMessageId: 'MSG-LATE', amount: 50, status: 'Paid', callbackSecret: 'test-callback-secret' };
    const result = await paymentService.handlePaymentCallback(input);
    await paymentService.handlePaymentCallback(input);

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(result.refundPending, true);
    assert.equal(paymentRepository.orders[0].orderStatus, 'Cancelled');
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Cancelled');
    assert.equal(paymentRepository.payments[0].paymentStatus, 'Cancelled');
    assert.equal(paymentRepository.attempts[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.attempts[0].transactionId, 'TXN-LATE');
    assert.equal(paymentRepository.refunds.length, 1);
    assert.equal(paymentRepository.refunds[0].status, 'RefundPending');
    assert.equal(paymentRepository.refunds[0].obligationType, 'PAYMENT_REVERSAL');
    assert.equal(paymentRepository.refunds[0].obligationKey, 'PAYMENT_REVERSAL:attempt-1');
    assert.equal(auditLogger.entries.length, 1);
    assert.equal(notificationService.notifications.length, 1);
  });

  it('repairs a missing excess-payment obligation when a worker crashed after persisting Paid evidence', async () => {
    paymentRepository.orders[0].paymentStatus = 'Paid';
    paymentRepository.payments[0].paymentStatus = 'Paid';
    Object.assign(paymentRepository.attempts[0], {
      paymentStatus: 'Paid',
      providerMessageId: 'MSG-PRIMARY',
      transactionId: 'TXN-PRIMARY',
      paidAt: new Date('2026-07-23T00:00:00.000Z'),
    });
    paymentRepository.attempts.push({
      _id: 'attempt-2',
      orderId: 'order-online',
      attemptCode: 'PAY-2',
      paymentMethod: 'ONLINE',
      paymentProvider: 'MOCK',
      paymentStatus: 'Paid',
      amount: 50,
      currency: 'VND',
      providerMessageId: 'MSG-CRASHED',
      transactionId: 'TXN-CRASHED',
      paidAt: new Date('2026-07-23T00:01:00.000Z'),
    });

    const result = await paymentService.handlePaymentCallback({
      orderId: 'order-online',
      paymentAttemptId: 'attempt-2',
      transactionId: 'TXN-CRASHED',
      providerMessageId: 'MSG-CRASHED',
      amount: 50,
      status: 'Paid',
      callbackSecret: 'test-callback-secret',
    });

    assert.equal(result.duplicatePayment, true);
    assert.equal(result.refundPending, true);
    assert.deepEqual(
      paymentRepository.refunds.map(({ obligationType, obligationKey }) => ({ obligationType, obligationKey })),
      [{ obligationType: 'EXCESS_PAYMENT', obligationKey: 'EXCESS_PAYMENT:attempt-2' }],
    );
  });

  it('repairs the legacy payment projection after Paid evidence won before a worker crash', async () => {
    paymentRepository.orders[0].paymentStatus = 'Paid';
    Object.assign(paymentRepository.attempts[0], {
      paymentStatus: 'Paid',
      providerMessageId: 'MSG-PRIMARY-CRASH',
      transactionId: 'TXN-PRIMARY-CRASH',
      paidAt: new Date('2026-07-23T00:00:00.000Z'),
    });
    paymentRepository.payments[0].paymentStatus = 'Pending';

    const result = await paymentService.handlePaymentCallback({
      orderId: 'order-online',
      paymentAttemptId: 'attempt-1',
      transactionId: 'TXN-PRIMARY-CRASH',
      providerMessageId: 'MSG-PRIMARY-CRASH',
      amount: 50,
      status: 'Paid',
      callbackSecret: 'test-callback-secret',
    });

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(paymentRepository.payments[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.refunds.length, 0);
  });

  it('lets a cancellation committed after the callback read win without losing paid provider evidence', async () => {
    const claimOrderPayment = paymentRepository.claimOrderPayment;
    paymentRepository.claimOrderPayment = async (id, data) => {
      paymentRepository.orders[0].orderStatus = 'Cancelled';
      paymentRepository.orders[0].paymentStatus = 'Cancelled';
      paymentRepository.payments[0].paymentStatus = 'Cancelled';
      return claimOrderPayment(id, data);
    };

    const result = await paymentService.handlePaymentCallback({
      orderId: 'order-online',
      paymentAttemptId: 'attempt-1',
      transactionId: 'TXN-CANCEL-RACE',
      providerMessageId: 'MSG-CANCEL-RACE',
      amount: 50,
      status: 'Paid',
      callbackSecret: 'test-callback-secret',
    });

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(result.refundPending, true);
    assert.equal(paymentRepository.orders[0].orderStatus, 'Cancelled');
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Cancelled');
    assert.equal(paymentRepository.payments[0].paymentStatus, 'Cancelled');
    assert.equal(paymentRepository.attempts[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.attempts[0].transactionId, 'TXN-CANCEL-RACE');
    assert.deepEqual(
      paymentRepository.refunds.map(({ obligationType, obligationKey }) => ({ obligationType, obligationKey })),
      [{ obligationType: 'PAYMENT_REVERSAL', obligationKey: 'PAYMENT_REVERSAL:attempt-1' }]
    );
    assert.equal(auditLogger.entries.length, 1);
    assert.equal(notificationService.notifications.length, 1);
  });

  it('preserves primary Paid after paid-order cancellation and refunds a distinct later paid attempt as excess', async () => {
    paymentRepository.orders[0].orderStatus = 'Cancelled';
    paymentRepository.orders[0].paymentStatus = 'Paid';
    paymentRepository.payments[0].paymentStatus = 'Paid';
    paymentRepository.attempts[0].paymentStatus = 'Paid';
    paymentRepository.attempts.push({
      _id: 'attempt-2',
      orderId: 'order-online',
      attemptCode: 'PAY-2',
      paymentMethod: 'ONLINE',
      paymentProvider: 'MOCK',
      paymentStatus: 'Pending',
      amount: 50,
      currency: 'VND',
    });
    const input = {
      orderId: 'order-online',
      paymentAttemptId: 'attempt-2',
      transactionId: 'TXN-PAID-CANCELLED-EXCESS',
      providerMessageId: 'MSG-PAID-CANCELLED-EXCESS',
      amount: 50,
      status: 'Paid',
      callbackSecret: 'test-callback-secret',
    };

    const result = await paymentService.handlePaymentCallback(input);
    await paymentService.handlePaymentCallback(input);

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(result.refundPending, true);
    assert.equal(result.duplicatePayment, true);
    assert.equal(paymentRepository.orders[0].orderStatus, 'Cancelled');
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.payments[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.attempts[1].paymentStatus, 'Paid');
    assert.deepEqual(
      paymentRepository.refunds.map(({ obligationType, obligationKey }) => ({ obligationType, obligationKey })),
      [{ obligationType: 'EXCESS_PAYMENT', obligationKey: 'EXCESS_PAYMENT:attempt-2' }]
    );
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

  it('rejects callbacks whose provider identity does not match the immutable attempt', async () => {
    await assert.rejects(
      () => paymentService.handlePaymentCallback({
        orderId: 'order-online',
        paymentAttemptId: 'attempt-1',
        paymentProvider: 'PAYOS',
        transactionId: 'TXN-WRONG-PROVIDER',
        providerMessageId: 'MSG-WRONG-PROVIDER',
        amount: 50,
        status: 'Paid',
        callbackSecret: 'test-callback-secret',
      }),
      (error) => error.errorCode === 'PAYMENT_PROVIDER_MISMATCH',
    );
    assert.equal(paymentRepository.events.length, 0);
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
