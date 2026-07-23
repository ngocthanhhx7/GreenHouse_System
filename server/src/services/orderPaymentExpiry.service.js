const mongoose = require('mongoose');

const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const Inventory = require('../models/inventory.model');
const { createPayOSGateway } = require('../config/payos');
const { logAudit } = require('../utils/auditLogger');
const { notificationService } = require('./notification.service');

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function createModelRepository() {
  return {
    async listDueOnlineOrders(now, limit = 100, session) {
      return withOptionalSession(
        Order.find({
          paymentMethod: 'ONLINE',
          orderStatus: 'Pending',
          paymentStatus: 'Pending',
          paymentDeadlineAt: { $lte: now },
        }).sort({ paymentDeadlineAt: 1, _id: 1 }).limit(limit),
        session
      ).lean();
    },
    async claimExpiry(id, now, data, session) {
      return withOptionalSession(
        Order.findOneAndUpdate(
          {
            _id: id,
            paymentMethod: 'ONLINE',
            orderStatus: 'Pending',
            paymentStatus: 'Pending',
            paymentDeadlineAt: { $lte: now },
          },
          { $set: data },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async listOrderDetails(orderId, session) {
      return withOptionalSession(OrderDetail.find({ orderId }).sort({ createdAt: 1, _id: 1 }), session).lean();
    },
    async cancelPendingPayment(orderId, session) {
      return withOptionalSession(
        Payment.findOneAndUpdate(
          { orderId, paymentStatus: 'Pending' },
          { $set: { paymentStatus: 'Cancelled' } },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async expireActivePaymentAttempt(orderId, session) {
      return withOptionalSession(
        PaymentAttempt.findOneAndUpdate(
          { orderId, paymentStatus: 'Pending' },
          { $set: { paymentStatus: 'Expired' } },
          { new: true, sort: { createdAt: -1, _id: -1 }, runValidators: true }
        ),
        session
      ).lean();
    },
  };
}

function createModelInventoryRepository() {
  return {
    async release(productId, quantity, session) {
      return withOptionalSession(
        Inventory.findOneAndUpdate(
          { productId, reservedQuantity: { $gte: Number(quantity) } },
          { $inc: { reservedQuantity: -Number(quantity) } },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
  };
}

function createOrderPaymentExpiryService({
  repository = createModelRepository(),
  transactionManager = createModelTransactionManager(),
  inventoryRepository = createModelInventoryRepository(),
  auditLogger = { log: logAudit },
  notificationPublisher = {
    async publish({ userId, orderId, orderCode }) {
      return notificationService.createInAppNotification({
        userId,
        type: 'ORDER_PAYMENT_EXPIRED',
        subject: `Thanh toán đơn ${orderCode} đã hết hạn`,
        content: `Đơn hàng ${orderCode} đã được hủy vì quá thời hạn thanh toán trực tuyến.`,
        eventId: `ORDER_PAYMENT_EXPIRED:${orderId}`,
        targetCollection: 'Order',
        targetId: orderId,
      });
    },
  },
  payosGateway = createPayOSGateway(),
  clock = () => new Date(),
} = {}) {
  async function expireCandidate(candidate, now) {
    const expired = await transactionManager.withTransaction(async (session) => {
      // The conditional claim is the linearization point: payment evidence that wins first
      // changes the Order payment status and makes this expiry a no-op.
      const claimed = await repository.claimExpiry(candidate._id, now, {
        orderStatus: 'Cancelled',
        paymentStatus: 'Cancelled',
        cancelReason: 'Online payment deadline expired',
      }, session);
      if (!claimed) return null;

      const details = await repository.listOrderDetails(claimed._id, session);
      await repository.cancelPendingPayment(claimed._id, session);
      const expiredAttempt = await repository.expireActivePaymentAttempt(claimed._id, session);
      for (const detail of details) {
        const released = await inventoryRepository.release(detail.productId, detail.quantity, session);
        if (!released) throw new Error(`Order ${claimed.orderCode} reservation could not be released`);
      }
      return { order: claimed, expiredAttempt };
    });

    if (!expired) return false;
    if (expired.expiredAttempt?.paymentLinkId && payosGateway?.cancelPaymentLink) {
      try {
        await payosGateway.cancelPaymentLink(
          expired.expiredAttempt.paymentLinkId,
          'Order payment deadline expired',
        );
      } catch {
        // The immutable local expiry already won. Provider retirement is
        // best-effort and late paid evidence is handled as a refund
        // obligation by the callback service.
      }
    }
    const expiredOrder = expired.order;
    // Side effects intentionally follow the committed transition, never the transaction body.
    await auditLogger.log({
      userId: expiredOrder.customerId,
      action: 'ORDER_PAYMENT_EXPIRED',
      targetEntity: 'Order',
      targetId: String(expiredOrder._id),
      description: `Online payment deadline expired: ${expiredOrder.orderCode}`,
    });
    await notificationPublisher.publish({
      userId: expiredOrder.customerId,
      orderId: String(expiredOrder._id),
      orderCode: expiredOrder.orderCode,
      eventId: `ORDER_PAYMENT_EXPIRED:${String(expiredOrder._id)}`,
    });
    return true;
  }

  return {
    async expireOverdueOrders({ limit = 100 } = {}) {
      const now = new Date(clock());
      const candidates = await repository.listDueOnlineOrders(now, limit);
      let expired = 0;
      for (const candidate of candidates) {
        if (await expireCandidate(candidate, now)) expired += 1;
      }
      return { expired };
    },
  };
}

module.exports = {
  createModelRepository,
  createOrderPaymentExpiryService,
  orderPaymentExpiryService: createOrderPaymentExpiryService(),
};
