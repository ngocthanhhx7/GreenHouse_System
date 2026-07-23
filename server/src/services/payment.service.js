const crypto = require('crypto');

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

function isReusablePayOSAttempt(attempt) {
  if (!attempt || attempt.paymentProvider !== 'PAYOS' || attempt.paymentStatus !== 'Pending' || !attempt.checkoutUrl) return false;
  if (!attempt.expiresAt) return true;
  return new Date(attempt.expiresAt).getTime() > Date.now() + 30_000;
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

function createModelPaymentRepository() {
  return {
    async findOrderById(id) { return Order.findById(id).lean(); },
    async findPaymentByOrder(id) { return Payment.findOne({ orderId: id }).lean(); },
    async updatePayment(id, data) { return Payment.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean(); },
    async updateOrder(id, data) { return Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean(); },
    async claimOrderPayment(id, data) {
      return Order.findOneAndUpdate(
        {
          _id: id,
          orderStatus: 'Pending',
          paymentStatus: { $in: ['Unpaid', 'Pending', 'Failed'] },
        },
        { $set: data },
        { new: true, runValidators: true }
      ).lean();
    },
    async findLatestAttemptByOrder(id) { return PaymentAttempt.findOne({ orderId: id }).sort({ createdAt: -1 }).lean(); },
    async findPaymentAttemptById(id) { return PaymentAttempt.findById(id).lean(); },
    async findPaymentAttemptByProviderOrderCode(paymentProvider, providerOrderCode) {
      return PaymentAttempt.findOne({ paymentProvider, providerOrderCode }).lean();
    },
    async createPaymentAttempt(data) { return PaymentAttempt.create(data); },
    async updatePaymentAttempt(id, data) { return PaymentAttempt.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean(); },
    async findCallbackEvent(paymentProvider, providerMessageId) {
      return PaymentCallbackEvent.findOne({ paymentProvider, providerMessageId }).lean();
    },
    async claimCallbackEvent(id, staleBefore) {
      return PaymentCallbackEvent.findOneAndUpdate(
        {
          _id: id,
          $or: [
            { eventStatus: 'Received' },
            { eventStatus: 'Processing', processingStartedAt: { $lte: staleBefore } },
          ],
        },
        { eventStatus: 'Processing', processingStartedAt: new Date() },
        { new: true, runValidators: true }
      ).lean();
    },
    async createCallbackEvent(data) { return PaymentCallbackEvent.create(data); },
    async markCallbackEventProcessed(id, processingResult) {
      return PaymentCallbackEvent.findByIdAndUpdate(id, { eventStatus: 'Processed', processingResult }, { new: true }).lean();
    },
    async upsertRefundPending(data) {
      const identity = data.obligationKey
        ? { obligationKey: data.obligationKey }
        : { orderId: data.orderId, obligationType: data.obligationType || 'PAYMENT_REVERSAL' };
      return RefundPending.findOneAndUpdate(identity, { $setOnInsert: data }, { new: true, upsert: true, runValidators: true }).lean();
    },
  };
}

function createPaymentService({
  paymentRepository = createModelPaymentRepository(),
  auditLogger = { log: logAudit },
  notificationService = defaultNotificationService,
  callbackSecret = process.env.PAYMENT_CALLBACK_SECRET,
  payosGateway = createPayOSGateway(),
  callbackProcessingLeaseMs = Number(process.env.PAYMENT_CALLBACK_PROCESSING_LEASE_MS || 60_000),
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

    const nextStatus = ['Paid', 'Failed', 'Cancelled'].includes(input.status) ? input.status : 'Failed';
    if (nextStatus === 'Paid' && order.paymentStatus === 'Paid') {
      if (attempt.paymentStatus === 'Paid') {
        return persistCallbackResult(event, toPaymentResponse(order, attempt, { callbackEventId: String(event._id) }));
      }
      const updatedAttempt = await paymentRepository.updatePaymentAttempt(attempt._id, {
        paymentStatus: 'Paid',
        transactionId: input.transactionId || attempt.transactionId,
        providerMessageId,
        paidAt: new Date(),
        rawResponse: rawPayload || callbackPayload,
        gatewayResponseCode: String(input.gatewayResponseCode || ''),
        gatewayMessage: String(input.gatewayMessage || ''),
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
      await auditLogger.log({ userId: order.customerId, action: 'PAYMENT_CALLBACK_DUPLICATE_PAID_REFUND_PENDING', targetEntity: 'PaymentAttempt', targetId: String(updatedAttempt._id), description: `Duplicate successful payment requires refund for ${order.orderCode}` });
      await notificationService.notifyPaymentStatus({ userId: order.customerId, orderCode: order.orderCode, paymentStatus: 'RefundPending' });
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
      && (order.orderStatus === 'Cancelled' || paidAfterLinkExpiry);
    if (isLatePaidCallback) {
      const updatedAttempt = await paymentRepository.updatePaymentAttempt(attempt._id, {
        paymentStatus: 'Paid',
        transactionId: input.transactionId || attempt.transactionId,
        providerMessageId,
        paidAt: new Date(),
        rawResponse: rawPayload || callbackPayload,
        gatewayResponseCode: String(input.gatewayResponseCode || ''),
        gatewayMessage: String(input.gatewayMessage || ''),
      });
      await paymentRepository.upsertRefundPending({
        orderId: order._id,
        paymentAttemptId: updatedAttempt._id,
        customerId: order.customerId,
        amount: order.totalAmount,
        currency: updatedAttempt.currency || 'VND',
        reason: paidAfterLinkExpiry
          ? 'Payment transaction occurred after the PayOS link expired'
          : `Late paid callback received after ${order.orderStatus.toLowerCase()} order`,
        status: 'RefundPending',
        obligationType: 'PAYMENT_REVERSAL',
        obligationKey: `PAYMENT_REVERSAL:${String(updatedAttempt._id)}`,
      });
      const result = toPaymentResponse(order, updatedAttempt, { callbackEventId: String(event._id), refundPending: true });
      await persistCallbackResult(event, result);
      await auditLogger.log({ userId: order.customerId, action: 'PAYMENT_CALLBACK_REFUND_PENDING', targetEntity: 'PaymentAttempt', targetId: String(updatedAttempt._id), description: `Late payment callback requires refund for ${order.orderCode}` });
      await notificationService.notifyPaymentStatus({ userId: order.customerId, orderCode: order.orderCode, paymentStatus: 'RefundPending' });
      return result;
    }

    const updatedAttempt = await paymentRepository.updatePaymentAttempt(attempt._id, {
      paymentStatus: nextStatus,
      transactionId: input.transactionId || attempt.transactionId,
      providerMessageId,
      paidAt: nextStatus === 'Paid' ? new Date() : null,
      rawResponse: rawPayload || callbackPayload,
      gatewayResponseCode: String(input.gatewayResponseCode || ''),
      gatewayMessage: String(input.gatewayMessage || ''),
    });
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
        await auditLogger.log({
          userId: winningOrder.customerId,
          action: duplicatePayment ? 'PAYMENT_CALLBACK_DUPLICATE_PAID_REFUND_PENDING' : 'PAYMENT_CALLBACK_REFUND_PENDING',
          targetEntity: 'PaymentAttempt',
          targetId: String(updatedAttempt._id),
          description: `${duplicatePayment ? 'Duplicate successful payment' : 'Late payment callback'} requires refund for ${winningOrder.orderCode}`,
        });
        await notificationService.notifyPaymentStatus({ userId: winningOrder.customerId, orderCode: winningOrder.orderCode, paymentStatus: 'RefundPending' });
        return result;
      }
    }
    const legacyPayment = await paymentRepository.findPaymentByOrder(order._id);
    if (legacyPayment) {
      await paymentRepository.updatePayment(legacyPayment._id, {
        paymentProvider,
        paymentStatus: nextStatus,
        transactionId: input.transactionId || legacyPayment.transactionId,
        paidAt: nextStatus === 'Paid' ? new Date() : null,
        rawResponse: rawPayload || callbackPayload,
        gatewayResponseCode: String(input.gatewayResponseCode || ''),
        gatewayMessage: String(input.gatewayMessage || ''),
        providerMessageId,
      });
    }
    if (!updatedOrder) {
      updatedOrder = await paymentRepository.updateOrder(order._id, {
        paymentStatus: nextStatus,
        orderStatus: order.orderStatus,
      });
    }
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
  }

  return {
    async createOnlinePaymentRequest(customerId, orderId) {
      const order = await paymentRepository.findOrderById(orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      if (order.paymentMethod !== 'ONLINE') throw new ApiError(400, 'Order is not an online payment order');
      if (order.paymentStatus === 'Paid') throw new ApiError(409, 'Order is already paid');
      if (order.orderStatus !== 'Pending') throw new ApiError(409, 'Order is not pending payment');
      if (!Number.isSafeInteger(Number(order.totalAmount)) || Number(order.totalAmount) <= 0) {
        throw new ApiError(400, 'Số tiền thanh toán PayOS phải là số nguyên VND dương', [], 'PAYOS_INVALID_AMOUNT');
      }

      const latestAttempt = await paymentRepository.findLatestAttemptByOrder(order._id);
      if (isReusablePayOSAttempt(latestAttempt)) return toPaymentResponse(order, latestAttempt, { reused: true });
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
          if (isReusablePayOSAttempt(concurrentAttempt)) return toPaymentResponse(order, concurrentAttempt, { reused: true });
          throw new ApiError(409, 'Một link thanh toán PayOS khác đang được tạo, vui lòng thử lại', [], 'PAYOS_LINK_CREATION_IN_PROGRESS');
        }
        throw error;
      }

      try {
        const paymentLink = await payosGateway.createPaymentLink({ order, providerOrderCode });
        const updatedAttempt = await paymentRepository.updatePaymentAttempt(attempt._id, {
          paymentLinkId: paymentLink.paymentLinkId,
          checkoutUrl: paymentLink.checkoutUrl,
          qrCode: paymentLink.qrCode,
          expiresAt: paymentLink.expiredAt ? new Date(paymentLink.expiredAt * 1000) : null,
          rawResponse: paymentLink,
        });
        const legacyPayment = await paymentRepository.findPaymentByOrder(order._id);
        if (legacyPayment) await paymentRepository.updatePayment(legacyPayment._id, { paymentProvider: 'PAYOS', paymentStatus: 'Pending', rawResponse: paymentLink });
        return toPaymentResponse(order, updatedAttempt);
      } catch (error) {
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
