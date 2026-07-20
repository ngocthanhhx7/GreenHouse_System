const crypto = require('crypto');
const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const PaymentCallbackEvent = require('../models/paymentCallbackEvent.model');
const RefundPending = require('../models/refundPending.model');
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
    paymentStatus: attempt ? attempt.paymentStatus : order.paymentStatus,
    transactionId: attempt ? attempt.transactionId : '',
    ...extra,
  };
}

function generateAttemptCode() {
  return `PAY-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function createModelPaymentRepository() {
  return {
    async findOrderById(id) { return Order.findById(id).lean(); },
    async findPaymentByOrder(id) { return Payment.findOne({ orderId: id }).lean(); },
    async updatePayment(id, data) { return Payment.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean(); },
    async updateOrder(id, data) { return Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean(); },
    async findLatestAttemptByOrder(id) { return PaymentAttempt.findOne({ orderId: id }).sort({ createdAt: -1 }).lean(); },
    async findPaymentAttemptById(id) { return PaymentAttempt.findById(id).lean(); },
    async createPaymentAttempt(data) { return PaymentAttempt.create(data); },
    async updatePaymentAttempt(id, data) { return PaymentAttempt.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean(); },
    async findCallbackEvent(paymentProvider, providerMessageId) {
      return PaymentCallbackEvent.findOne({ paymentProvider, providerMessageId }).lean();
    },
    async claimCallbackEvent(id) {
      return PaymentCallbackEvent.findOneAndUpdate(
        { _id: id, eventStatus: 'Received' },
        { eventStatus: 'Processing', processingStartedAt: new Date() },
        { new: true, runValidators: true }
      ).lean();
    },
    async createCallbackEvent(data) { return PaymentCallbackEvent.create(data); },
    async markCallbackEventProcessed(id, processingResult) {
      return PaymentCallbackEvent.findByIdAndUpdate(id, { eventStatus: 'Processed', processingResult }, { new: true }).lean();
    },
    async upsertRefundPending(data) {
      return RefundPending.findOneAndUpdate({ orderId: data.orderId }, { $setOnInsert: data }, { new: true, upsert: true, runValidators: true }).lean();
    },
  };
}

function createPaymentService({
  paymentRepository = createModelPaymentRepository(),
  auditLogger = { log: logAudit },
  notificationService = defaultNotificationService,
  callbackSecret = process.env.PAYMENT_CALLBACK_SECRET,
} = {}) {
  async function callbackReplay(paymentProvider, providerMessageId) {
    const existing = await paymentRepository.findCallbackEvent(paymentProvider, providerMessageId);
    if (!existing) return null;
    if (existing.eventStatus !== 'Processed' || !existing.processingResult) return null;
    const order = await paymentRepository.findOrderById(existing.orderId);
    const attempt = existing.paymentAttemptId && paymentRepository.findPaymentAttemptById
      ? await paymentRepository.findPaymentAttemptById(existing.paymentAttemptId)
      : await paymentRepository.findLatestAttemptByOrder(existing.orderId);
    return toPaymentResponse(order, attempt, { callbackEventId: String(existing._id), idempotentReplay: true });
  }

  async function persistCallbackResult(event, result) {
    if (paymentRepository.markCallbackEventProcessed) {
      await paymentRepository.markCallbackEventProcessed(event._id, result);
    }
    return result;
  }

  return {
    async createOnlinePaymentRequest(customerId, orderId) {
      const order = await paymentRepository.findOrderById(orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      if (order.paymentMethod !== 'ONLINE') throw new ApiError(400, 'Order is not an online payment order');
      if (order.paymentStatus === 'Paid') throw new ApiError(409, 'Order is already paid');
      if (order.orderStatus !== 'WaitingForPayment') throw new ApiError(409, 'Order is not waiting for payment');

      const attempt = await paymentRepository.createPaymentAttempt({
        orderId: order._id,
        attemptCode: generateAttemptCode(),
        paymentMethod: 'ONLINE',
        paymentProvider: 'MOCK',
        amount: order.totalAmount,
        currency: 'VND',
        paymentStatus: 'Pending',
      });
      return toPaymentResponse(order, attempt, { mockPaymentUrl: `/payments/mock/${orderId}?amount=${attempt.amount}` });
    },

    async handlePaymentCallback(input = {}) {
      if (!callbackSecret) throw new ApiError(503, 'Payment callback secret is not configured');
      if (input.callbackSecret !== callbackSecret) throw new ApiError(401, 'Invalid payment callback secret');
      const { callbackSecret: _callbackSecret, ...callbackPayload } = input;
      const paymentProvider = String(input.paymentProvider || 'MOCK').trim();
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

      let event;
      try {
        event = await paymentRepository.createCallbackEvent({
          orderId: order._id,
          paymentAttemptId: attempt._id,
          paymentProvider,
          providerMessageId,
          rawPayload: callbackPayload,
        });
      } catch (error) {
        if (error && error.code === 11000) {
          const duplicate = await paymentRepository.findCallbackEvent(paymentProvider, providerMessageId);
          if (duplicate?.eventStatus === 'Processed' && duplicate.processingResult) {
            return callbackReplay(paymentProvider, providerMessageId);
          }
          if (duplicate) {
            event = duplicate;
          } else {
            throw error;
          }
        }
        if (!event) throw error;
      }

      if (paymentRepository.claimCallbackEvent) {
        const claimedEvent = await paymentRepository.claimCallbackEvent(event._id);
        if (!claimedEvent) {
          const processed = await callbackReplay(paymentProvider, providerMessageId);
          if (processed) return processed;
          throw new ApiError(409, 'Payment callback is already being processed');
        }
        event = claimedEvent;
      }

      const nextStatus = ['Paid', 'Failed', 'Cancelled'].includes(input.status) ? input.status : 'Failed';
      const hasAlreadyPaid = order.paymentStatus === 'Paid' || attempt.paymentStatus === 'Paid';
      if (hasAlreadyPaid && nextStatus !== 'Paid') {
        return persistCallbackResult(event, toPaymentResponse(order, attempt, { callbackEventId: String(event._id) }));
      }

      const isLatePaidCallback = nextStatus === 'Paid' && ['Cancelled', 'Expired'].includes(order.orderStatus);
      if (isLatePaidCallback) {
        const refundStatus = 'RefundPending';
        const updatedAttempt = await paymentRepository.updatePaymentAttempt(attempt._id, {
          paymentStatus: refundStatus,
          transactionId: input.transactionId || attempt.transactionId,
          providerMessageId,
          paidAt: new Date(),
          rawResponse: callbackPayload,
          gatewayResponseCode: String(input.gatewayResponseCode || ''),
          gatewayMessage: String(input.gatewayMessage || ''),
        });
        const legacyPayment = await paymentRepository.findPaymentByOrder(order._id);
        if (legacyPayment) await paymentRepository.updatePayment(legacyPayment._id, { paymentStatus: refundStatus, transactionId: input.transactionId || legacyPayment.transactionId, rawResponse: callbackPayload });
        const updatedOrder = await paymentRepository.updateOrder(order._id, { paymentStatus: refundStatus });
        await paymentRepository.upsertRefundPending({
          orderId: order._id,
          paymentAttemptId: updatedAttempt._id,
          customerId: order.customerId,
          amount: order.totalAmount,
          currency: updatedAttempt.currency || 'VND',
          reason: `Late paid callback received after ${order.orderStatus.toLowerCase()} order`,
          status: 'RefundPending',
        });
        const result = toPaymentResponse(updatedOrder, updatedAttempt, { callbackEventId: String(event._id), refundPending: true });
        await persistCallbackResult(event, result);
        await auditLogger.log({ userId: order.customerId, action: 'PAYMENT_CALLBACK_REFUND_PENDING', targetEntity: 'PaymentAttempt', targetId: String(updatedAttempt._id), description: `Late payment callback requires refund for ${order.orderCode}` });
        await notificationService.notifyPaymentStatus({ userId: order.customerId, orderCode: order.orderCode, paymentStatus: refundStatus });
        return result;
      }

      const updatedAttempt = await paymentRepository.updatePaymentAttempt(attempt._id, {
        paymentStatus: nextStatus,
        transactionId: input.transactionId || attempt.transactionId,
        providerMessageId,
        paidAt: nextStatus === 'Paid' ? new Date() : null,
        rawResponse: callbackPayload,
        gatewayResponseCode: String(input.gatewayResponseCode || ''),
        gatewayMessage: String(input.gatewayMessage || ''),
      });
      const legacyPayment = await paymentRepository.findPaymentByOrder(order._id);
      if (legacyPayment) {
        await paymentRepository.updatePayment(legacyPayment._id, {
          paymentStatus: nextStatus,
          transactionId: input.transactionId || legacyPayment.transactionId,
          paidAt: nextStatus === 'Paid' ? new Date() : null,
          rawResponse: callbackPayload,
        });
      }
      const updatedOrder = await paymentRepository.updateOrder(order._id, {
        paymentStatus: nextStatus,
        orderStatus: nextStatus === 'Paid' && order.orderStatus === 'WaitingForPayment' ? 'Pending' : order.orderStatus,
      });
      const result = toPaymentResponse(updatedOrder, updatedAttempt, { callbackEventId: String(event._id) });
      await persistCallbackResult(event, result);
      await auditLogger.log({
        userId: order.customerId,
        action: `PAYMENT_CALLBACK_${nextStatus.toUpperCase()}`,
        targetEntity: 'PaymentAttempt',
        targetId: String(updatedAttempt._id),
        description: `Payment callback ${nextStatus} for ${order.orderCode}`,
      });
      await notificationService.notifyPaymentStatus({ userId: order.customerId, orderCode: order.orderCode, paymentStatus: nextStatus });
      return result;
    },
  };
}

module.exports = {
  createPaymentService,
  paymentService: createPaymentService(),
};
