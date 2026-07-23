const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');

const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const Inventory = require('../models/inventory.model');
const OrderReservation = require('../models/orderReservation.model');
const DomainOutbox = require('../models/domainOutbox.model');
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
    async claimReservationRelease(orderId, orderDetailId, reason, session) {
      return withOptionalSession(
        OrderReservation.findOneAndUpdate(
          { orderId, orderDetailId, status: 'Reserved' },
          { $set: { status: 'Released', releasedAt: new Date(), releaseReason: reason } },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async enqueuePostCommitWork(data, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          { identityKey: data.identityKey },
          { $setOnInsert: data },
          { upsert: true, new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async listPendingPostCommitWork(eventTypes, staleBefore, session) {
      return withOptionalSession(
        DomainOutbox.find({
          eventType: { $in: eventTypes },
          $or: [
            { status: { $in: ['Pending', 'Failed'] } },
            { status: 'Processing', processingStartedAt: { $lte: staleBefore } },
          ],
        }).sort({ createdAt: 1 }),
        session
      ).lean();
    },
    async claimPostCommitWork(id, staleBefore, now, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          {
            _id: id,
            $or: [
              { status: { $in: ['Pending', 'Failed'] } },
              { status: 'Processing', processingStartedAt: { $lte: staleBefore } },
            ],
          },
          {
            $set: { status: 'Processing', processingStartedAt: now, lastError: '' },
            $inc: { attemptCount: 1 },
          },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async markPostCommitWorkDone(id, processingStartedAt, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          { _id: id, status: 'Processing', processingStartedAt },
          { $set: { status: 'Completed', completedAt: new Date(), processingStartedAt: null, lastError: '' } },
          { new: true }
        ),
        session
      ).lean();
    },
    async markPostCommitWorkFailed(id, processingStartedAt, error, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          { _id: id, status: 'Processing', processingStartedAt },
          { $set: { status: 'Failed', processingStartedAt: null, lastError: String(error?.message || error || '') } },
          { new: true }
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
  const localPostCommitWork = new Map();

  async function runPostCommitWork(item) {
    const { eventType, payload } = item;
    if (eventType === 'ORDER_PAYMENT_EXPIRED_AUDIT') {
      await auditLogger.log(payload);
    } else if (eventType === 'ORDER_PAYMENT_EXPIRED_NOTIFICATION') {
      await notificationPublisher.publish(payload);
    }
  }

  async function drainPostCommitWork() {
    const drainStartedAt = new Date(clock());
    const staleBefore = new Date(drainStartedAt.getTime() - 60_000);
    const items = [
      ...localPostCommitWork.values(),
      ...(repository.listPendingPostCommitWork
        ? await repository.listPendingPostCommitWork([
          'ORDER_PAYMENT_EXPIRED_AUDIT',
          'ORDER_PAYMENT_EXPIRED_NOTIFICATION',
        ], staleBefore)
        : []),
    ];
    const seen = new Set();
    for (const item of items) {
      const key = String(item.identityKey || item._id || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const now = new Date(clock());
      const claimed = item._id && repository.claimPostCommitWork
        ? await repository.claimPostCommitWork(
          item._id,
          staleBefore,
          now
        )
        : item;
      if (!claimed) {
        localPostCommitWork.delete(key);
        continue;
      }
      try {
        await runPostCommitWork(claimed);
        localPostCommitWork.delete(key);
        if (claimed._id && repository.markPostCommitWorkDone) {
          await repository.markPostCommitWorkDone(claimed._id, claimed.processingStartedAt);
        }
      } catch (error) {
        localPostCommitWork.set(key, { ...claimed, lastError: error.message });
        if (claimed._id && repository.markPostCommitWorkFailed) {
          try {
            await repository.markPostCommitWorkFailed(
              claimed._id,
              claimed.processingStartedAt,
              error
            );
          } catch {
            // Keep the local copy as a bounded-process fallback if the
            // persistence path is itself unavailable.
          }
        }
      }
    }
  }

  async function schedulePostCommitWork(eventType, payload, session) {
    const identityKey = `${eventType}:${payload.eventId}`;
    const item = { identityKey, eventType, payload, status: 'Pending' };
    if (repository.enqueuePostCommitWork) {
      // The durable row is queried after commit. Mirroring it before commit
      // could publish an expiry event even when the transaction rolls back.
      await repository.enqueuePostCommitWork(item, session);
      return;
    }
    // Legacy/in-memory repositories without an outbox remain process-bounded;
    // the model repository always takes the durable branch above.
    localPostCommitWork.set(identityKey, item);
  }

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
        if (repository.claimReservationRelease) {
          const reservation = await repository.claimReservationRelease(
            claimed._id,
            detail._id,
            'Online payment deadline expired',
            session
          );
          if (!reservation) {
            throw new ApiError(409, 'Order reservation lineage is missing or already released');
          }
        }
        const released = await inventoryRepository.release(detail.productId, detail.quantity, session);
        if (!released) throw new Error(`Order ${claimed.orderCode} reservation could not be released`);
      }
      await schedulePostCommitWork('ORDER_PAYMENT_EXPIRED_AUDIT', {
        eventId: `ORDER_PAYMENT_EXPIRED:AUDIT:${String(claimed._id)}`,
        userId: claimed.customerId,
        action: 'ORDER_PAYMENT_EXPIRED',
        targetEntity: 'Order',
        targetId: String(claimed._id),
        description: `Online payment deadline expired: ${claimed.orderCode}`,
      }, session);
      await schedulePostCommitWork('ORDER_PAYMENT_EXPIRED_NOTIFICATION', {
        eventId: `ORDER_PAYMENT_EXPIRED:${String(claimed._id)}`,
        userId: claimed.customerId,
        orderId: String(claimed._id),
        orderCode: claimed.orderCode,
      }, session);
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
    // Durable records were written in the same transaction as the expiry.
    // Execute them only after the transaction commits.
    await drainPostCommitWork();
    return true;
  }

  return {
    drainPostCommitWork,
    async expireOverdueOrders({ limit = 100 } = {}) {
      await drainPostCommitWork();
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
