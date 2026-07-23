const crypto = require('crypto');
const mongoose = require('mongoose');
const { AsyncLocalStorage } = require('node:async_hooks');

const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const PaymentCallbackEvent = require('../models/paymentCallbackEvent.model');
const RefundPending = require('../models/refundPending.model');
const { createPayOSGateway } = require('../config/payos');
const { logAudit } = require('../utils/auditLogger');
const { notificationService: defaultNotificationService } = require('./notification.service');

function toPaymentResponse(order, attempt, extra = {}) {
  return {
    orderId: String(order._id),
    orderCode: order.orderCode,
    attemptId: attempt ? String(attempt._id) : null,
    amount: attempt ? attempt.amount : order.totalAmount,
    currency: attempt ? attempt.currency || 'VND' : 'VND',
    paymentMethod: attempt ? attempt.paymentMethod : order.paymentMethod,
    paymentProvider: attempt ? attempt.paymentProvider : '',
    paymentStatus: attempt ? attempt.paymentStatus : order.paymentStatus,
    transactionId: attempt ? attempt.transactionId : '',
    providerOrderCode: attempt ? attempt.providerOrderCode : null,
    paymentLinkId: attempt ? attempt.paymentLinkId : '',
    checkoutUrl: attempt ? attempt.checkoutUrl : '',
    qrCode: attempt ? attempt.qrCode : '',
    expiresAt: attempt ? attempt.expiresAt : null,
    ...extra,
  };
}

function generateAttemptCode() {
  return `PAY-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function generateProviderOrderCode() {
  return (Date.now() * 1000) + crypto.randomInt(0, 1000);
}

function isReusablePayOSAttempt(attempt, now = new Date()) {
  if (!attempt || attempt.paymentProvider !== 'PAYOS' || attempt.paymentStatus !== 'Pending' || !attempt.checkoutUrl) return false;
  if (!attempt.expiresAt) return true;
  return new Date(attempt.expiresAt).getTime() > new Date(now).getTime() + 30_000;
}

function parsePayOSTransactionTime(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const isoValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)
    ? `${normalized.replace(' ', 'T')}+07:00`
    : normalized;
  const timestamp = new Date(isoValue);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function buildProviderEvidence(attempt, input, rawPayload, nextStatus) {
  const evidence = { paymentStatus: nextStatus };
  if (!attempt.transactionId && input.transactionId) evidence.transactionId = String(input.transactionId);
  if (!attempt.providerMessageId) evidence.providerMessageId = String(input.providerMessageId || input.transactionId || '');
  if (nextStatus === 'Paid' && !attempt.paidAt) evidence.paidAt = new Date();
  if (!attempt.rawResponse) evidence.rawResponse = rawPayload || input;
  if (!attempt.gatewayResponseCode && input.gatewayResponseCode !== undefined) {
    evidence.gatewayResponseCode = String(input.gatewayResponseCode || '');
  }
  if (!attempt.gatewayMessage && input.gatewayMessage !== undefined) {
    evidence.gatewayMessage = String(input.gatewayMessage || '');
  }
  return evidence;
}

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function createPassthroughTransactionManager() {
  return {
    async withTransaction(work) {
      return work(null);
    },
  };
}

function createModelPaymentRepository() {
  return {
    usesMongooseTransactions: true,
    async findOrderById(id, session) { return withOptionalSession(Order.findById(id), session).lean(); },
    async findPaymentByOrder(id, session) { return withOptionalSession(Payment.findOne({ orderId: id }), session).lean(); },
    async updatePayment(id, data, session) {
      return withOptionalSession(Payment.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean();
    },
    async updatePendingPayment(id, data, session) {
      return withOptionalSession(Payment.findOneAndUpdate(
        { _id: id, paymentStatus: { $in: ['Unpaid', 'Pending', 'Failed'] } },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async updateOrder(id, data, session) {
      return withOptionalSession(Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean();
    },
    async markMoneyObligationsUnsettled(id, session) {
      return withOptionalSession(Order.findByIdAndUpdate(
        id,
        { $set: { moneyObligationsSettled: false } },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async claimOrderPayment(id, data, session) {
      return withOptionalSession(Order.findOneAndUpdate(
        {
          _id: id,
          orderStatus: 'Pending',
          paymentStatus: { $in: ['Unpaid', 'Pending', 'Failed'] },
        },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async findLatestAttemptByOrder(id, session) {
      return withOptionalSession(PaymentAttempt.findOne({ orderId: id }).sort({ createdAt: -1 }), session).lean();
    },
    async findPrimaryPaidPaymentAttemptByOrder(id, session) {
      return withOptionalSession(
        PaymentAttempt.findOne({ orderId: id, paymentStatus: 'Paid' }).sort({ paidAt: 1, createdAt: 1, _id: 1 }),
        session
      ).lean();
    },
    async findPaymentAttemptById(id, session) {
      return withOptionalSession(PaymentAttempt.findById(id), session).lean();
    },
    async findPaymentAttemptByProviderOrderCode(paymentProvider, providerOrderCode, session) {
      return withOptionalSession(PaymentAttempt.findOne({ paymentProvider, providerOrderCode }), session).lean();
    },
    async createPaymentAttempt(data, session) {
      if (!session) return PaymentAttempt.create(data);
      const [attempt] = await PaymentAttempt.create([data], { session });
      return attempt;
    },
    async updatePaymentAttempt(id, data, session) {
      return withOptionalSession(PaymentAttempt.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean();
    },
    async findCallbackEvent(paymentProvider, providerMessageId, session) {
      return withOptionalSession(PaymentCallbackEvent.findOne({ paymentProvider, providerMessageId }), session).lean();
    },
    async claimCallbackEvent(id, staleBefore, session) {
      return withOptionalSession(PaymentCallbackEvent.findOneAndUpdate(
        {
          _id: id,
          $or: [
            { eventStatus: 'Received' },
            { eventStatus: 'Processing', processingStartedAt: { $lte: staleBefore } },
          ],
        },
        { eventStatus: 'Processing', processingStartedAt: new Date() },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async createCallbackEvent(data, session) {
      if (!session) return PaymentCallbackEvent.create(data);
      const [event] = await PaymentCallbackEvent.create([data], { session });
      return event;
    },
    async markCallbackEventProcessed(id, processingResult, session) {
      return withOptionalSession(
        PaymentCallbackEvent.findByIdAndUpdate(id, { eventStatus: 'Processed', processingResult }, { new: true }),
        session
      ).lean();
    },
    async upsertRefundPending(data, session) {
      const identity = data.obligationKey
        ? { obligationKey: data.obligationKey }
        : { orderId: data.orderId, obligationType: data.obligationType || 'PAYMENT_REVERSAL' };
      const refund = await withOptionalSession(
        RefundPending.findOneAndUpdate(identity, { $setOnInsert: data }, { new: true, upsert: true, runValidators: true }),
        session
      ).lean();
      if (refund?.orderId) {
        await Order.updateOne(
          { _id: refund.orderId },
          { $set: { moneyObligationsSettled: false } },
          session ? { session } : undefined
        );
      }
      return refund;
    },
  };
}

function createPaymentService({
  paymentRepository: suppliedPaymentRepository = createModelPaymentRepository(),
  auditLogger = { log: logAudit },
  notificationService = defaultNotificationService,
  callbackSecret = process.env.PAYMENT_CALLBACK_SECRET,
  payosGateway = createPayOSGateway(),
  callbackProcessingLeaseMs = Number(process.env.PAYMENT_CALLBACK_PROCESSING_LEASE_MS || 60_000),
  clock = () => new Date(),
  transactionManager = null,
} = {}) {
  const repositorySessionContext = new AsyncLocalStorage();
  const paymentRepository = new Proxy(suppliedPaymentRepository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args) => {
        const session = repositorySessionContext.getStore();
        return value.apply(target, session ? [...args, session] : args);
      };
    },
  });
  const callbackTransactionManager = transactionManager
    || (suppliedPaymentRepository.usesMongooseTransactions
      ? createModelTransactionManager()
      : createPassthroughTransactionManager());

  async function callbackReplay(paymentProvider, providerMessageId) {
    const existing = await paymentRepository.findCallbackEvent(paymentProvider, providerMessageId);
    if (!existing) return null;
    if (existing.eventStatus !== 'Processed' || !existing.processingResult) return null;
    return {
      ...existing.processingResult,
      callbackEventId: String(existing._id),
      idempotentReplay: true,
    };
  }

  async function persistCallbackResult(event, result) {
    return result;
  }

  function queueCallbackSideEffects(effects, {
    event,
    order,
    attempt,
    action,
    description,
    paymentStatus,
  }) {
    const eventPrefix = `PAYMENT_CALLBACK:${String(event._id)}`;
    effects.push(
      async () => {
        try {
          await auditLogger.log({
            userId: order.customerId,
            action,
            eventId: `${eventPrefix}:AUDIT`,
            targetEntity: 'PaymentAttempt',
            targetId: String(attempt._id),
            description,
          });
        } catch (error) {
          if (error?.code !== 11000) throw error;
        }
      },
      () => notificationService.notifyPaymentStatus({
        userId: order.customerId,
        orderCode: order.orderCode,
        paymentStatus,
        eventId: `${eventPrefix}:NOTIFICATION`,
      })
    );
  }

  async function processVerifiedPaymentCallback(input = {}) {
    const { callbackSecret: _callbackSecret, rawPayload, ...callbackPayload } = input;
    const paymentProvider = String(input.paymentProvider || 'MOCK').trim().toUpperCase();
    const providerMessageId = String(input.providerMessageId || input.transactionId || '').trim();
    if (!providerMessageId) throw new ApiError(400, 'Payment provider message identity is required');

    const replay = await callbackReplay(paymentProvider, providerMessageId);
    if (replay) return replay;

    const order = await paymentRepository.findOrderById(input.orderId);
    if (!order) throw new ApiError(404, 'Order not found');
    if (Number(input.amount) !== Number(order.totalAmount)) throw new ApiError(400, 'Payment amount does not match order total');
    const attempt = input.paymentAttemptId && paymentRepository.findPaymentAttemptById
      ? await paymentRepository.findPaymentAttemptById(input.paymentAttemptId)
      : await paymentRepository.findLatestAttemptByOrder(input.orderId);
    if (!attempt) throw new ApiError(404, 'Payment attempt not found');
    if (String(attempt.orderId) !== String(order._id)) throw new ApiError(400, 'Payment attempt does not belong to this order');
    if (String(attempt.paymentProvider || '').toUpperCase() !== paymentProvider) {
      throw new ApiError(400, 'Payment provider does not match the payment attempt', [], 'PAYMENT_PROVIDER_MISMATCH');
    }
    if (attempt.paymentMethod !== 'ONLINE') {
      throw new ApiError(400, 'Only online payment attempts accept provider callbacks', [], 'PAYMENT_METHOD_MISMATCH');
    }
    if (Number(attempt.amount) !== Number(input.amount)) {
      throw new ApiError(400, 'Payment amount does not match the payment attempt', [], 'PAYMENT_ATTEMPT_AMOUNT_MISMATCH');
    }
    if (input.providerOrderCode !== undefined && Number(input.providerOrderCode) !== Number(attempt.providerOrderCode)) {
      throw new ApiError(400, 'Provider order code does not match the payment attempt', [], 'PAYMENT_PROVIDER_ORDER_MISMATCH');
    }
    if (attempt.providerMessageId && String(attempt.providerMessageId) !== providerMessageId) {
      throw new ApiError(409, 'A payment attempt cannot be reused for another provider event', [], 'PAYMENT_ATTEMPT_REUSED');
    }
    if (attempt.transactionId && input.transactionId && String(attempt.transactionId) !== String(input.transactionId)) {
      throw new ApiError(409, 'A payment attempt cannot be reused for another transaction', [], 'PAYMENT_ATTEMPT_REUSED');
    }

    let event;
    try {
      event = await paymentRepository.createCallbackEvent({
        orderId: order._id,
        paymentAttemptId: attempt._id,
        paymentProvider,
        providerMessageId,
        rawPayload: rawPayload || callbackPayload,
      });
    } catch (error) {
      if (error && error.code === 11000) {
        const duplicate = await paymentRepository.findCallbackEvent(paymentProvider, providerMessageId);
        if (duplicate?.eventStatus === 'Processed' && duplicate.processingResult) {
          return callbackReplay(paymentProvider, providerMessageId);
        }
        if (duplicate) event = duplicate;
        else throw error;
      }
      if (!event) throw error;
    }

    if (paymentRepository.claimCallbackEvent) {
      const leaseMs = Number.isFinite(callbackProcessingLeaseMs) && callbackProcessingLeaseMs > 0 ? callbackProcessingLeaseMs : 60_000;
      const claimedEvent = await paymentRepository.claimCallbackEvent(event._id, new Date(Date.now() - leaseMs));
      if (!claimedEvent) {
        const processed = await callbackReplay(paymentProvider, providerMessageId);
        if (processed) return processed;
        throw new ApiError(409, 'Payment callback is already being processed');
      }
      event = claimedEvent;
    }

    const postCommitEffects = [];
    const callbackResult = await callbackTransactionManager.withTransaction((session) => (
      repositorySessionContext.run(session, async () => {
    postCommitEffects.length = 0;
    const currentOrder = await paymentRepository.findOrderById(input.orderId);
    if (!currentOrder) throw new ApiError(404, 'Order not found');
    const currentAttempt = input.paymentAttemptId && paymentRepository.findPaymentAttemptById
      ? await paymentRepository.findPaymentAttemptById(input.paymentAttemptId)
      : await paymentRepository.findLatestAttemptByOrder(input.orderId);
    if (!currentAttempt) throw new ApiError(404, 'Payment attempt not found');
    const order = currentOrder;
    const attempt = currentAttempt;

    const nextStatus = ['Paid', 'Failed', 'Cancelled'].includes(input.status) ? input.status : 'Failed';
    const orderDeadline = order.paymentDeadlineAt ? new Date(order.paymentDeadlineAt) : null;
    const providerPaidAt = parsePayOSTransactionTime(input.transactionDateTime) || new Date(clock());
    const paidAfterOrderDeadline = nextStatus === 'Paid'
      && orderDeadline
      && !Number.isNaN(orderDeadline.getTime())
      && providerPaidAt.getTime() >= orderDeadline.getTime();
    if (nextStatus === 'Paid' && order.paymentStatus === 'Paid') {
      if (attempt.paymentStatus === 'Paid') {
        const primaryAttempt = paymentRepository.findPrimaryPaidPaymentAttemptByOrder
          ? await paymentRepository.findPrimaryPaidPaymentAttemptByOrder(order._id)
          : null;
        if (!primaryAttempt || String(primaryAttempt._id) === String(attempt._id)) {
          const legacyPayment = await paymentRepository.findPaymentByOrder(order._id);
          if (legacyPayment && legacyPayment.paymentStatus !== 'Paid') {
            const paymentData = {
              paymentProvider,
              paymentStatus: 'Paid',
              ...(legacyPayment.transactionId ? {} : { transactionId: attempt.transactionId || input.transactionId || '' }),
              ...(legacyPayment.paidAt ? {} : { paidAt: attempt.paidAt || new Date() }),
              ...(legacyPayment.rawResponse ? {} : { rawResponse: rawPayload || callbackPayload }),
              ...(legacyPayment.providerMessageId ? {} : { providerMessageId }),
            };
            if (paymentRepository.updatePendingPayment) {
              await paymentRepository.updatePendingPayment(legacyPayment._id, paymentData);
            } else {
              await paymentRepository.updatePayment(legacyPayment._id, paymentData);
            }
          }
          const repairedResult = toPaymentResponse(order, attempt, { callbackEventId: String(event._id) });
          queueCallbackSideEffects(postCommitEffects, {
            event,
            order,
            attempt,
            action: 'PAYMENT_CALLBACK_PAID',
            description: `Payment callback Paid for ${order.orderCode}`,
            paymentStatus: 'Paid',
          });
          return persistCallbackResult(event, repairedResult);
        }
        const excessRefund = await paymentRepository.upsertRefundPending({
          orderId: order._id,
          paymentAttemptId: attempt._id,
          customerId: order.customerId,
          amount: Number(input.amount),
          currency: attempt.currency || 'VND',
          reason: 'Duplicate successful payment received after the order was already paid',
          status: 'RefundPending',
          obligationType: 'EXCESS_PAYMENT',
          obligationKey: `EXCESS_PAYMENT:${String(attempt._id)}`,
        });
        const replayableResult = toPaymentResponse(order, attempt, {
          callbackEventId: String(event._id),
          refundPending: true,
          duplicatePayment: true,
          refundPendingId: excessRefund?._id ? String(excessRefund._id) : null,
        });
        await persistCallbackResult(event, replayableResult);
        queueCallbackSideEffects(postCommitEffects, {
          event,
          order,
          attempt,
          action: 'PAYMENT_CALLBACK_DUPLICATE_PAID_REFUND_PENDING',
          description: `Duplicate successful payment requires refund for ${order.orderCode}`,
          paymentStatus: 'RefundPending',
        });
        return replayableResult;
      }
      const updatedAttempt = await paymentRepository.updatePaymentAttempt(attempt._id, {
        ...buildProviderEvidence(attempt, input, rawPayload || callbackPayload, 'Paid'),
      });
      await paymentRepository.upsertRefundPending({
        orderId: order._id,
        paymentAttemptId: updatedAttempt._id,
        customerId: order.customerId,
        amount: Number(input.amount),
        currency: updatedAttempt.currency || 'VND',
        reason: 'Duplicate successful payment received after the order was already paid',
        status: 'RefundPending',
        obligationType: 'EXCESS_PAYMENT',
        obligationKey: `EXCESS_PAYMENT:${String(updatedAttempt._id)}`,
      });
      const result = toPaymentResponse(order, updatedAttempt, { callbackEventId: String(event._id), refundPending: true, duplicatePayment: true });
      await persistCallbackResult(event, result);
      queueCallbackSideEffects(postCommitEffects, {
        event,
        order,
        attempt: updatedAttempt,
        action: 'PAYMENT_CALLBACK_DUPLICATE_PAID_REFUND_PENDING',
        description: `Duplicate successful payment requires refund for ${order.orderCode}`,
        paymentStatus: 'RefundPending',
      });
      return result;
    }
    const hasAlreadyPaid = order.paymentStatus === 'Paid' || attempt.paymentStatus === 'Paid';
    if (hasAlreadyPaid && nextStatus !== 'Paid') {
      return persistCallbackResult(event, toPaymentResponse(order, attempt, { callbackEventId: String(event._id) }));
    }

    const payosTransactionTime = parsePayOSTransactionTime(input.transactionDateTime);
    const paidAfterLinkExpiry = nextStatus === 'Paid'
      && attempt.expiresAt
      && payosTransactionTime
      && payosTransactionTime.getTime() > new Date(attempt.expiresAt).getTime();
    const isLatePaidCallback = nextStatus === 'Paid'
      && (order.orderStatus === 'Cancelled' || paidAfterLinkExpiry || paidAfterOrderDeadline);
    if (isLatePaidCallback) {
      const updatedAttempt = await paymentRepository.updatePaymentAttempt(
        attempt._id,
        buildProviderEvidence(attempt, input, rawPayload || callbackPayload, 'Paid'),
      );
      await paymentRepository.upsertRefundPending({
        orderId: order._id,
        paymentAttemptId: updatedAttempt._id,
        customerId: order.customerId,
        amount: order.totalAmount,
        currency: updatedAttempt.currency || 'VND',
        reason: paidAfterOrderDeadline
          ? 'Payment transaction occurred at or after the immutable order payment deadline'
          : paidAfterLinkExpiry
          ? 'Payment transaction occurred after the PayOS link expired'
          : `Late paid callback received after ${order.orderStatus.toLowerCase()} order`,
        status: 'RefundPending',
        obligationType: 'PAYMENT_REVERSAL',
        obligationKey: `PAYMENT_REVERSAL:${String(updatedAttempt._id)}`,
      });
      const result = toPaymentResponse(order, updatedAttempt, { callbackEventId: String(event._id), refundPending: true });
      await persistCallbackResult(event, result);
      queueCallbackSideEffects(postCommitEffects, {
        event,
        order,
        attempt: updatedAttempt,
        action: 'PAYMENT_CALLBACK_REFUND_PENDING',
        description: `Late payment callback requires refund for ${order.orderCode}`,
        paymentStatus: 'RefundPending',
      });
      return result;
    }

    const updatedAttempt = await paymentRepository.updatePaymentAttempt(
      attempt._id,
      buildProviderEvidence(attempt, input, rawPayload || callbackPayload, nextStatus),
    );
    let updatedOrder = null;
    if (nextStatus === 'Paid' && paymentRepository.claimOrderPayment) {
      updatedOrder = await paymentRepository.claimOrderPayment(order._id, {
        paymentStatus: 'Paid',
        orderStatus: order.orderStatus,
      });
      if (!updatedOrder) {
        const winningOrder = await paymentRepository.findOrderById(order._id);
        const obligationType = winningOrder.paymentStatus === 'Paid' ? 'EXCESS_PAYMENT' : 'PAYMENT_REVERSAL';
        const duplicatePayment = obligationType === 'EXCESS_PAYMENT';
        await paymentRepository.upsertRefundPending({
          orderId: winningOrder._id,
          paymentAttemptId: updatedAttempt._id,
          customerId: winningOrder.customerId,
          amount: Number(input.amount),
          currency: updatedAttempt.currency || 'VND',
          reason: duplicatePayment
            ? 'Duplicate successful payment received after the order was already paid'
            : `Paid callback received after ${winningOrder.orderStatus.toLowerCase()} order transition committed`,
          status: 'RefundPending',
          obligationType,
          obligationKey: `${obligationType}:${String(updatedAttempt._id)}`,
        });
        const result = toPaymentResponse(winningOrder, updatedAttempt, {
          callbackEventId: String(event._id),
          refundPending: true,
          ...(duplicatePayment ? { duplicatePayment: true } : {}),
        });
        await persistCallbackResult(event, result);
        queueCallbackSideEffects(postCommitEffects, {
          event,
          order: winningOrder,
          attempt: updatedAttempt,
          action: duplicatePayment ? 'PAYMENT_CALLBACK_DUPLICATE_PAID_REFUND_PENDING' : 'PAYMENT_CALLBACK_REFUND_PENDING',
          description: `${duplicatePayment ? 'Duplicate successful payment' : 'Late payment callback'} requires refund for ${winningOrder.orderCode}`,
          paymentStatus: 'RefundPending',
        });
        return result;
      }
    }
    const legacyPayment = await paymentRepository.findPaymentByOrder(order._id);
    if (legacyPayment) {
        const paymentData = {
          paymentProvider,
          paymentStatus: nextStatus,
          ...(legacyPayment.transactionId ? {} : { transactionId: input.transactionId || '' }),
          ...(legacyPayment.paidAt || nextStatus !== 'Paid' ? {} : { paidAt: new Date() }),
          ...(legacyPayment.rawResponse ? {} : { rawResponse: rawPayload || callbackPayload }),
          ...(legacyPayment.gatewayResponseCode ? {} : { gatewayResponseCode: String(input.gatewayResponseCode || '') }),
          ...(legacyPayment.gatewayMessage ? {} : { gatewayMessage: String(input.gatewayMessage || '') }),
          ...(legacyPayment.providerMessageId ? {} : { providerMessageId }),
        };
        if (paymentRepository.updatePendingPayment && nextStatus === 'Paid') {
          await paymentRepository.updatePendingPayment(legacyPayment._id, paymentData);
        } else {
          await paymentRepository.updatePayment(legacyPayment._id, paymentData);
        }
    }
    if (!updatedOrder) {
      updatedOrder = await paymentRepository.updateOrder(order._id, {
        paymentStatus: nextStatus,
        orderStatus: order.orderStatus,
      });
    }
    const result = toPaymentResponse(updatedOrder, updatedAttempt, { callbackEventId: String(event._id) });
    await persistCallbackResult(event, result);
    queueCallbackSideEffects(postCommitEffects, {
      event,
      order,
      attempt: updatedAttempt,
      action: `PAYMENT_CALLBACK_${nextStatus.toUpperCase()}`,
      description: `Payment callback ${nextStatus} for ${order.orderCode}`,
      paymentStatus: nextStatus,
    });
    return result;
      })
    ));

    for (const effect of postCommitEffects) await effect();
    if (paymentRepository.markCallbackEventProcessed) {
      await paymentRepository.markCallbackEventProcessed(event._id, callbackResult);
    }
    return callbackResult;
  }

  return {
    async createOnlinePaymentRequest(customerId, orderId) {
      const order = await paymentRepository.findOrderById(orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      if (order.paymentMethod !== 'ONLINE') throw new ApiError(400, 'Order is not an online payment order');
      if (order.paymentStatus === 'Paid') throw new ApiError(409, 'Order is already paid');
      if (order.orderStatus !== 'Pending') throw new ApiError(409, 'Order is not pending payment');
      const now = new Date(clock());
      const deadline = order.paymentDeadlineAt ? new Date(order.paymentDeadlineAt) : null;
      if (!deadline || Number.isNaN(deadline.getTime())) {
        throw new ApiError(409, 'Order payment deadline is missing or invalid', [], 'PAYMENT_DEADLINE_INVALID');
      }
      if (now.getTime() >= deadline.getTime()) {
        throw new ApiError(409, 'Đơn hàng đã hết thời hạn thanh toán trực tuyến', [], 'PAYMENT_DEADLINE_EXPIRED');
      }
      if (!Number.isSafeInteger(Number(order.totalAmount)) || Number(order.totalAmount) <= 0) {
        throw new ApiError(400, 'Số tiền thanh toán PayOS phải là số nguyên VND dương', [], 'PAYOS_INVALID_AMOUNT');
      }

      const latestAttempt = await paymentRepository.findLatestAttemptByOrder(order._id);
      if (isReusablePayOSAttempt(latestAttempt, now)) return toPaymentResponse(order, latestAttempt, { reused: true });
      if (!payosGateway.isConfigured({ requireRedirectUrls: true })) {
        throw new ApiError(503, 'payOS chưa được cấu hình trên máy chủ', [], 'PAYOS_NOT_CONFIGURED');
      }

      if (latestAttempt?.paymentProvider === 'PAYOS' && latestAttempt.paymentStatus === 'Pending') {
        const expired = latestAttempt.expiresAt && new Date(latestAttempt.expiresAt).getTime() <= Date.now();
        if (latestAttempt.paymentLinkId && payosGateway.cancelPaymentLink) {
          try {
            await payosGateway.cancelPaymentLink(latestAttempt.paymentLinkId, expired ? 'Payment link expired' : 'Payment link replaced');
          } catch {
            // A link that is already expired/cancelled can safely be retired locally.
          }
        }
        await paymentRepository.updatePaymentAttempt(latestAttempt._id, {
          paymentStatus: expired ? 'Expired' : 'Cancelled',
          gatewayMessage: expired ? 'PayOS payment link expired' : 'PayOS payment link replaced',
        });
      }

      const providerOrderCode = generateProviderOrderCode();
      let attempt;
      try {
        attempt = await paymentRepository.createPaymentAttempt({
          orderId: order._id,
          attemptCode: generateAttemptCode(),
          paymentMethod: 'ONLINE',
          paymentProvider: 'PAYOS',
          providerOrderCode,
          amount: Number(order.totalAmount),
          currency: 'VND',
          paymentStatus: 'Pending',
        });
      } catch (error) {
        if (error?.code === 11000) {
          const concurrentAttempt = await paymentRepository.findLatestAttemptByOrder(order._id);
          if (isReusablePayOSAttempt(concurrentAttempt, now)) return toPaymentResponse(order, concurrentAttempt, { reused: true });
          throw new ApiError(409, 'Một link thanh toán PayOS khác đang được tạo, vui lòng thử lại', [], 'PAYOS_LINK_CREATION_IN_PROGRESS');
        }
        throw error;
      }

      try {
        const paymentLink = await payosGateway.createPaymentLink({ order, providerOrderCode });
        const currentOrder = await paymentRepository.findOrderById(order._id);
        const orderStillAcceptsPayment = currentOrder
          && currentOrder.orderStatus === 'Pending'
          && ['Unpaid', 'Pending', 'Failed'].includes(currentOrder.paymentStatus);
        if (!orderStillAcceptsPayment) {
          if (paymentLink.paymentLinkId && payosGateway.cancelPaymentLink) {
            try {
              await payosGateway.cancelPaymentLink(paymentLink.paymentLinkId, 'Order state changed before payment link was persisted');
            } catch {
              // The provider may already have retired the link; local state is
              // still closed below.
            }
          }
          await paymentRepository.updatePaymentAttempt(attempt._id, {
            paymentStatus: 'Cancelled',
            gatewayMessage: 'Order state changed before payment link was persisted',
          });
          throw new ApiError(409, 'Order is no longer pending payment', [], 'PAYMENT_ORDER_STATE_CHANGED');
        }
        const updatedAttempt = await paymentRepository.updatePaymentAttempt(attempt._id, {
          paymentLinkId: paymentLink.paymentLinkId,
          checkoutUrl: paymentLink.checkoutUrl,
          qrCode: paymentLink.qrCode,
          expiresAt: paymentLink.expiredAt ? new Date(paymentLink.expiredAt * 1000) : null,
          rawResponse: paymentLink,
        });
        const legacyPayment = await paymentRepository.findPaymentByOrder(order._id);
        if (legacyPayment) {
          const paymentData = { paymentProvider: 'PAYOS', paymentStatus: 'Pending', rawResponse: paymentLink };
          if (paymentRepository.updatePendingPayment) {
            await paymentRepository.updatePendingPayment(legacyPayment._id, paymentData);
          } else {
            await paymentRepository.updatePayment(legacyPayment._id, paymentData);
          }
        }
        return toPaymentResponse(currentOrder, updatedAttempt);
      } catch (error) {
        if (error?.errorCode === 'PAYMENT_ORDER_STATE_CHANGED') throw error;
        await paymentRepository.updatePaymentAttempt(attempt._id, {
          paymentStatus: 'Failed',
          gatewayMessage: String(error?.message || 'Không thể tạo link thanh toán payOS'),
        });
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, 'Không thể tạo link thanh toán payOS', [], 'PAYOS_CREATE_PAYMENT_FAILED');
      }
    },

    async handlePaymentCallback(input = {}) {
      if (!callbackSecret) throw new ApiError(503, 'Payment callback secret is not configured');
      if (input.callbackSecret !== callbackSecret) throw new ApiError(401, 'Invalid payment callback secret');
      return processVerifiedPaymentCallback(input);
    },

    async handlePayOSWebhook(payload = {}) {
      let data;
      try {
        data = await payosGateway.verifyWebhook(payload);
      } catch {
        throw new ApiError(400, 'Webhook payOS không hợp lệ', [], 'PAYOS_INVALID_WEBHOOK_SIGNATURE');
      }

      const attempt = await paymentRepository.findPaymentAttemptByProviderOrderCode('PAYOS', Number(data.orderCode));
      if (!attempt) {
        return {
          paymentProvider: 'PAYOS',
          providerOrderCode: Number(data.orderCode),
          ignored: true,
          reason: 'PAYMENT_ATTEMPT_NOT_FOUND',
        };
      }

      return processVerifiedPaymentCallback({
        orderId: attempt.orderId,
        paymentAttemptId: attempt._id,
        paymentProvider: 'PAYOS',
        providerMessageId: `${data.paymentLinkId}:${data.reference || data.code}`,
        transactionId: data.reference || data.paymentLinkId,
        amount: Number(data.amount),
        status: data.code === '00' ? 'Paid' : 'Failed',
        gatewayResponseCode: data.code,
        gatewayMessage: data.desc,
        transactionDateTime: data.transactionDateTime,
        rawPayload: payload,
      });
    },
  };
}

module.exports = {
  createPaymentService,
  paymentService: createPaymentService(),
};
