const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Inventory = require('../models/inventory.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const RefundPending = require('../models/refundPending.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const OrderReservation = require('../models/orderReservation.model');
const Invoice = require('../models/invoice.model');
const { logAudit } = require('../utils/auditLogger');
const { canTransitionOrderStatus, getAllowedOrderStatusTransitions } = require('../utils/orderStateMachine');

const INVOICE_ELIGIBLE_STATUSES = new Set(['Confirmed', 'StockExportRequested', 'Packed', 'Shipped', 'Delivered']);
const RETURN_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function normalizeIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9:._-]+$/.test(key)) {
    throw new ApiError(400, 'Idempotency-Key must be 8-128 characters using letters, numbers, ., _, :, or -');
  }
  return key;
}

function hashCommand(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

function toOrderSummary(order) {
  return {
    id: String(order._id),
    orderCode: order.orderCode,
    customerId: String(order.customerId),
    totalAmount: order.totalAmount,
    subtotal: order.subtotal || 0,
    shippingFee: order.shippingFee || 0,
    currency: order.currency || 'VND',
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    codExpectedAmount: Number(order.codExpectedAmount ?? order.totalAmount ?? 0),
    customerCollectedAmount: Number(order.customerCollectedAmount || 0),
    customerCollectedAt: order.customerCollectedAt || null,
    carrierSettlementAmount: Number(order.carrierSettlementAmount || 0),
    carrierSettledAt: order.carrierSettledAt || null,
    codDiscrepancyStatus: order.codDiscrepancyStatus || 'None',
    codRecoveryReceiptId: order.codRecoveryReceiptId || '',
    codRecoveryReceivedAt: order.codRecoveryReceivedAt || null,
    settlementReconciliationStatus: order.settlementReconciliationStatus || 'NotApplicable',
    completedSaleAt: order.completedSaleAt || null,
    returnDeadlineAt: order.returnDeadlineAt || null,
    exchangeDeadlineAt: order.exchangeDeadlineAt || null,
    shippingAddress: order.shippingAddress,
    receiverName: order.receiverName || '',
    receiverPhone: order.receiverPhone || '',
    cancelReason: order.cancelReason || '',
    createdAt: order.createdAt,
  };
}

function toOrderDetail(order, details = []) {
  return { ...toOrderSummary(order), allowedNextStatuses: getAllowedOrderStatusTransitions(order.orderStatus), details };
}

function toStockExportRequest(request) {
  return { id: String(request._id), orderId: String(request.orderId), requestedBy: String(request.requestedBy), status: request.status, note: request.note || '', createdAt: request.createdAt };
}

function toInvoiceResponse(invoice, order) {
  return {
    id: String(invoice._id), orderId: String(invoice.orderId), invoiceCode: invoice.invoiceCode,
    issuedBy: String(invoice.issuedBy), issuedAt: invoice.issuedAt, currency: invoice.currency,
    subtotal: invoice.subtotal, shippingFee: invoice.shippingFee, totalAmount: invoice.totalAmount,
    receiverName: invoice.receiverName || '', receiverPhone: invoice.receiverPhone || '', shippingAddress: invoice.shippingAddress,
    items: invoice.items || [],
    order: order ? toOrderSummary(order) : null,
  };
}

function generateInvoiceCode() {
  return `INV-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function createModelOrderRepository() {
  return {
    async listOrders(query = {}) {
      const filter = {};
      if (query.status) filter.orderStatus = query.status;
      if (query.dateFrom || query.dateTo) {
        filter.createdAt = {};
        if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
        if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
      }
      return Order.find(filter).sort({ createdAt: -1 }).lean();
    },
    async findOrderById(id, session) { return withOptionalSession(Order.findById(id), session).lean(); },
    async listOrderDetails(orderId, session) { return withOptionalSession(OrderDetail.find({ orderId }), session).lean(); },
    async updateOrder(id, data, session) { return withOptionalSession(Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async claimStaffConfirmation(id, data, session) {
      return withOptionalSession(Order.findOneAndUpdate(
        {
          _id: id,
          orderStatus: 'Pending',
          $or: [{ paymentMethod: 'COD' }, { paymentStatus: 'Paid' }],
        },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async claimStaffCancellation(id, expectedPaymentStatus, data, session) {
      return withOptionalSession(Order.findOneAndUpdate(
        { _id: id, orderStatus: { $in: ['Pending', 'Confirmed'] }, paymentStatus: expectedPaymentStatus },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async releaseReservation(productId, quantity, session) {
      return withOptionalSession(Inventory.findOneAndUpdate(
        { productId, reservedQuantity: { $gte: Number(quantity) } },
        { $inc: { reservedQuantity: -Number(quantity) } },
        { new: true, runValidators: true }
      ), session).lean();
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
    async listReservationsByOrder(orderId, session) {
      return withOptionalSession(
        OrderReservation.find({ orderId, status: 'Reserved' }),
        session
      ).lean();
    },
    async findInventoryByProductId(productId, session) {
      return withOptionalSession(Inventory.findOne({ productId }), session).lean();
    },
    async findOpenStockExportRequest(orderId, session) {
      return withOptionalSession(
        StockExportRequest.findOne({ orderId, status: { $in: ['Pending', 'Approved', 'Processing'] } }),
        session
      ).lean();
    },
    async cancelOpenStockExportRequest(orderId, data, session) {
      return withOptionalSession(StockExportRequest.findOneAndUpdate(
        { orderId, status: { $in: ['Pending', 'Approved'] } },
        { $set: { status: 'Cancelled', ...data } },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async findCompletedStockExportRequest(orderId, session) {
      return withOptionalSession(StockExportRequest.findOne({
        orderId,
        $or: [{ status: 'Exported' }, { exportedAt: { $ne: null } }],
      }), session).lean();
    },
    async createStockExportRequest(data, session) {
      if (!session) return StockExportRequest.create(data);
      const [request] = await StockExportRequest.create([data], { session });
      return request;
    },
    async claimStockExportOrder(id, data, session) {
      return withOptionalSession(
        Order.findOneAndUpdate(
          { _id: id, orderStatus: 'Confirmed' },
          { $set: data },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async findPaymentByOrderId(orderId, session) { return withOptionalSession(Payment.findOne({ orderId }), session).lean(); },
    async updatePayment(id, data, session) { return withOptionalSession(Payment.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async findLatestPaymentAttemptByOrder(orderId, session) { return withOptionalSession(PaymentAttempt.findOne({ orderId }).sort({ createdAt: -1 }), session).lean(); },
    async findPrimaryPaidPaymentAttemptByOrder(orderId, session) {
      return withOptionalSession(PaymentAttempt.findOne({ orderId, paymentStatus: 'Paid' }).sort({ createdAt: 1, _id: 1 }), session).lean();
    },
    async updatePaymentAttempt(id, data, session) { return withOptionalSession(PaymentAttempt.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean(); },
    async upsertRefundPending(data, session) {
      const identity = data.obligationKey
        ? { obligationKey: data.obligationKey }
        : { orderId: data.orderId, obligationType: data.obligationType || 'PAYMENT_REVERSAL' };
      const refund = await withOptionalSession(
        RefundPending.findOneAndUpdate(identity, { $setOnInsert: data }, { new: true, upsert: true, runValidators: true }),
        session
      ).lean();
      if (refund?.orderId) {
        await withOptionalSession(
          Order.findByIdAndUpdate(refund.orderId, { $set: { moneyObligationsSettled: false } }, { new: true }),
          session
        ).lean();
      }
      return refund;
    },
    async updateRefundPending(id, data, session) {
      return withOptionalSession(RefundPending.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean();
    },
    async findRefundRequestByObligationKey(orderId, obligationKey, session) {
      return withOptionalSession(ReturnRefundRequest.findOne({ orderId, obligationKey }), session).lean();
    },
    async createRefundRequest(data, session) {
      const [request] = await ReturnRefundRequest.create([data], session ? { session } : undefined);
      return request.toObject();
    },
    async updateRefundRequest(id, data, session) {
      return withOptionalSession(ReturnRefundRequest.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean();
    },
    async findInvoiceByOrderId(orderId) { return Invoice.findOne({ orderId }).lean(); },
    async createInvoice(data) { return Invoice.create(data); },
  };
}

function createStaffOrderService({ orderRepository = createModelOrderRepository(), auditLogger = { log: logAudit }, transactionManager = createModelTransactionManager() } = {}) {
  async function getOrderOrThrow(orderId, session) {
    const order = await orderRepository.findOrderById(orderId, session);
    if (!order) throw new ApiError(404, 'Order not found');
    return order;
  }

  async function writeAudit(staffId, action, order, description) {
    await auditLogger.log({ userId: staffId, action, targetEntity: 'Order', targetId: String(order._id), description });
  }

  async function assertExactReservation(details, session) {
    if (!orderRepository.findInventoryByProductId) return;
    if (orderRepository.listReservationsByOrder) {
      const reservations = await orderRepository.listReservationsByOrder(details[0]?.orderId, session);
      const ownedByDetail = new Map((reservations || []).map((reservation) => [String(reservation.orderDetailId), Number(reservation.quantity)]));
      for (const detail of details) {
        if ((ownedByDetail.get(String(detail._id)) || 0) < Number(detail.quantity || 0)) {
          throw new ApiError(409, 'Order exact reservation is no longer intact');
        }
      }
      return;
    }
    const requiredByProduct = new Map();
    for (const detail of details) {
      const productId = String(detail.productId);
      requiredByProduct.set(productId, (requiredByProduct.get(productId) || 0) + Number(detail.quantity || 0));
    }
    for (const [productId, quantity] of requiredByProduct) {
      const inventory = await orderRepository.findInventoryByProductId(productId, session);
      if (!inventory
        || Number(inventory.stockQuantity || 0) < quantity
        || Number(inventory.reservedQuantity || 0) < quantity) {
        throw new ApiError(409, 'Order exact reservation is no longer intact');
      }
    }
  }

  async function buildRefundHandoff(order, reason, session, paymentAttempt) {
    const attempt = paymentAttempt || await orderRepository.findPrimaryPaidPaymentAttemptByOrder(order._id, session);
    if (!attempt) throw new ApiError(409, 'A payment attempt is required before creating a refund hand-off');
    const obligationKey = `PAYMENT_REVERSAL:${String(attempt._id)}`;
    const refund = await orderRepository.upsertRefundPending({
      orderId: order._id,
      paymentAttemptId: attempt._id,
      customerId: order.customerId,
      amount: order.totalAmount,
      currency: order.currency || attempt.currency || 'VND',
      reason,
      status: 'RefundPending',
      obligationType: 'PAYMENT_REVERSAL',
      obligationKey,
    }, session);
    if (!refund?.returnRefundRequestId && orderRepository.createRefundRequest) {
      let request = orderRepository.findRefundRequestByObligationKey
        ? await orderRepository.findRefundRequestByObligationKey(order._id, obligationKey, session)
        : null;
      if (!request) {
        request = await orderRepository.createRefundRequest({
          orderId: order._id,
          requestCode: `CAN-${order.orderCode}-${crypto.createHash('sha256').update(obligationKey).digest('hex').slice(0, 12).toUpperCase()}`,
          customerId: order.customerId,
          paymentId: null,
          obligationKey,
          reason,
          status: 'ReadyForRefund',
          refundAmount: Number(order.totalAmount),
          requestedAt: new Date(),
        }, session);
      }
      if (orderRepository.updateRefundPending) {
        await orderRepository.updateRefundPending(refund._id, { returnRefundRequestId: request._id }, session);
      }
      if (orderRepository.updateRefundRequest) {
        await orderRepository.updateRefundRequest(request._id, { refundPendingId: refund._id }, session);
      }
      return { ...refund, returnRefundRequestId: request._id };
    }
    return refund;
  }

  async function releaseOrderReservation(order, detail, session, reason) {
    if (orderRepository.claimReservationRelease) {
      const claimed = await orderRepository.claimReservationRelease(order._id, detail._id, reason, session);
      if (!claimed) return null;
    }
    return orderRepository.releaseReservation(detail.productId, detail.quantity, session);
  }

  return {
    async listOrders(query = {}) {
      const orders = await orderRepository.listOrders(query);
      return { items: orders.map(toOrderSummary), total: orders.length };
    },

    async getOrder(orderId) {
      const order = await getOrderOrThrow(orderId);
      const [details, stockExportRequest] = await Promise.all([
        orderRepository.listOrderDetails(orderId),
        orderRepository.findOpenStockExportRequest ? orderRepository.findOpenStockExportRequest(orderId) : null,
      ]);
      return {
        ...toOrderDetail(order, details),
        stockExportRequest: stockExportRequest ? toStockExportRequest(stockExportRequest) : null,
      };
    },

    async confirmOrder(staffId, orderId, input = {}) {
      const note = String(input.note || '').trim();
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const requestHash = hashCommand({ note });
      const result = await transactionManager.withTransaction(async (session) => {
        const order = await getOrderOrThrow(orderId, session);
        if (idempotencyKey && order.staffConfirmIdempotencyKey) {
          if (order.staffConfirmIdempotencyKey !== idempotencyKey || order.staffConfirmRequestHash !== requestHash) {
            throw new ApiError(409, 'Staff confirmation idempotency key was reused with different details');
          }
          const [details, existingRequest] = await Promise.all([
            orderRepository.listOrderDetails(orderId, session),
            orderRepository.findOpenStockExportRequest ? orderRepository.findOpenStockExportRequest(orderId, session) : null,
          ]);
          return { updated: order, details, stockExportRequest: existingRequest, idempotentReplay: true };
        }
        if (order.paymentMethod === 'ONLINE' && order.paymentStatus !== 'Paid') throw new ApiError(409, 'Online order must be paid before confirmation');
        if (order.orderStatus !== 'Pending') throw new ApiError(409, 'Only Pending orders can be confirmed');
        const details = await orderRepository.listOrderDetails(orderId, session);
        await assertExactReservation(details, session);
        const updated = await orderRepository.claimStaffConfirmation(
          orderId,
          {
            orderStatus: 'Confirmed',
            confirmedAt: new Date(),
            ...(idempotencyKey ? {
              staffConfirmIdempotencyKey: idempotencyKey,
              staffConfirmRequestHash: requestHash,
            } : {}),
          },
          session
        );
        if (!updated) throw new ApiError(409, 'Order changed while confirmation was being processed');
        const existingRequest = orderRepository.findOpenStockExportRequest
          ? await orderRepository.findOpenStockExportRequest(orderId, session)
          : null;
        let stockExportRequest = existingRequest;
        if (!stockExportRequest) {
          stockExportRequest = await orderRepository.createStockExportRequest({
            orderId,
            requestedBy: staffId,
            status: 'Pending',
            note,
          }, session);
        }
        return { updated, details, stockExportRequest, idempotentReplay: false };
      });
      if (!result.idempotentReplay) {
        await writeAudit(staffId, 'STAFF_ORDER_CONFIRM', result.updated, `Staff confirmed order ${result.updated.orderCode}. ${note}`.trim());
      }
      return {
        ...toOrderDetail(result.updated, result.details),
        stockExportRequest: result.stockExportRequest ? toStockExportRequest(result.stockExportRequest) : null,
        idempotentReplay: Boolean(result.idempotentReplay),
      };
    },

    async requestStockExport(staffId, orderId, input = {}) {
      const result = await transactionManager.withTransaction(async (session) => {
        const order = await getOrderOrThrow(orderId, session);
        const existing = await orderRepository.findOpenStockExportRequest(orderId, session);
        if (existing) throw new ApiError(409, 'Stock export request already exists');
        if (order.orderStatus !== 'Confirmed') throw new ApiError(409, 'Only Confirmed orders can request stock export');
        const updated = orderRepository.claimStockExportOrder
          ? await orderRepository.claimStockExportOrder(orderId, { orderStatus: 'StockExportRequested' }, session)
          : await orderRepository.updateOrder(orderId, { orderStatus: 'StockExportRequested' }, session);
        if (!updated) throw new ApiError(409, 'Order changed while requesting stock export');
        const request = await orderRepository.createStockExportRequest({
          orderId,
          requestedBy: staffId,
          status: 'Pending',
          note: String(input.note || '').trim(),
        }, session);
        return { order: updated, request };
      });
      const updated = result.order;
      const request = result.request;
      await writeAudit(staffId, 'STAFF_STOCK_EXPORT_REQUEST', updated, `Staff requested stock export for ${updated.orderCode}`);
      return { order: toOrderSummary(updated), stockExportRequest: toStockExportRequest(request) };
    },

    async updateStatus(staffId, orderId, input = {}) {
      const order = await getOrderOrThrow(orderId);
      const nextStatus = input.nextStatus;
      if (nextStatus === 'StockExportRequested') {
        throw new ApiError(409, 'Use the stock export request action before entering StockExportRequested');
      }
      if (!canTransitionOrderStatus(order.orderStatus, nextStatus)) throw new ApiError(409, 'Invalid order status transition');
      const transitionAt = new Date();
      const timestamps = nextStatus === 'Shipped' ? { shippedAt: transitionAt } : nextStatus === 'Delivered' ? {
        deliveredAt: transitionAt,
        returnDeadlineAt: new Date(transitionAt.getTime() + RETURN_WINDOW_MS),
        exchangeDeadlineAt: new Date(transitionAt.getTime() + RETURN_WINDOW_MS),
        ...(order.paymentMethod === 'COD' ? {
          codExpectedAmount: Number(order.codExpectedAmount ?? order.totalAmount),
          codDiscrepancyStatus: order.paymentStatus === 'Paid' ? 'Resolved' : 'Open',
          ...(order.paymentStatus === 'Paid' ? {} : { codDiscrepancyOpenedAt: transitionAt }),
        } : {}),
      } : {};
      const updated = await orderRepository.updateOrder(orderId, { orderStatus: nextStatus, ...timestamps });
      await writeAudit(staffId, 'STAFF_ORDER_STATUS_UPDATE', updated, `Staff updated order ${updated.orderCode} to ${nextStatus}`);
      return toOrderDetail(updated, await orderRepository.listOrderDetails(orderId));
    },

    async cancelOrder(staffId, orderId, input = {}) {
      const cancelReason = String(input.cancelReason || '').trim();
      if (!cancelReason) throw new ApiError(400, 'Cancel reason is required');
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const requestHash = hashCommand({ cancelReason });
      const result = await transactionManager.withTransaction(async (session) => {
        const order = await getOrderOrThrow(orderId, session);
        if (idempotencyKey && order.staffCancelIdempotencyKey) {
          if (order.staffCancelIdempotencyKey !== idempotencyKey || order.staffCancelRequestHash !== requestHash) {
            throw new ApiError(409, 'Staff cancellation idempotency key was reused with different details');
          }
          return {
            updated: order,
            details: await orderRepository.listOrderDetails(orderId, session),
            idempotentReplay: true,
          };
        }
        if (!['Pending', 'Confirmed'].includes(order.orderStatus)) throw new ApiError(409, 'Only Pending or Confirmed orders can be cancelled before stock export');
        const completedExport = await orderRepository.findCompletedStockExportRequest(order._id, session);
        if (completedExport) throw new ApiError(409, 'Stock export is complete; the order can no longer be cancelled');
        const openExport = orderRepository.findOpenStockExportRequest
          ? await orderRepository.findOpenStockExportRequest(order._id, session)
          : null;
        if (openExport?.status === 'Processing') {
          throw new ApiError(409, 'Stock export is already Processing; cancellation is rejected atomically');
        }

        const isPaid = order.paymentStatus === 'Paid';
        const attempt = isPaid ? await orderRepository.findPrimaryPaidPaymentAttemptByOrder(order._id, session) : null;
        if (isPaid && !attempt) throw new ApiError(409, 'A payment attempt is required before cancelling a paid order');
        const nextPaymentStatus = order.paymentStatus === 'Pending' ? 'Cancelled' : order.paymentStatus;
        const cancelData = {
          orderStatus: 'Cancelled',
          paymentStatus: nextPaymentStatus,
          cancelReason,
          ...(idempotencyKey ? {
            staffCancelIdempotencyKey: idempotencyKey,
            staffCancelRequestHash: requestHash,
          } : {}),
        };
        const updated = orderRepository.claimStaffCancellation
          ? await orderRepository.claimStaffCancellation(orderId, order.paymentStatus, cancelData, session)
          : await orderRepository.updateOrder(orderId, cancelData, session);
        if (!updated) throw new ApiError(409, 'Order changed while cancellation was being processed');

        if (orderRepository.cancelOpenStockExportRequest) {
          await orderRepository.cancelOpenStockExportRequest(order._id, {
            processedBy: staffId,
            note: `Cancelled with order: ${cancelReason}`,
          }, session);
        }

        if (isPaid) {
          await buildRefundHandoff(order, `Staff cancellation: ${cancelReason}`, session, attempt);
        }

        const details = await orderRepository.listOrderDetails(orderId, session);
        for (const detail of details) {
          const released = await releaseOrderReservation(order, detail, session, `Staff cancellation: ${cancelReason}`);
          if (orderRepository.claimReservationRelease && !released) {
            throw new ApiError(409, 'Order reservation lineage is missing or already released');
          }
          if (!released) throw new ApiError(409, 'Order reservation could not be released');
        }
        return { updated, details };
      });
      if (!result.idempotentReplay) {
        await writeAudit(staffId, 'STAFF_ORDER_CANCEL', result.updated, `Staff cancelled ${result.updated.orderCode}: ${cancelReason}`);
      }
      return { ...toOrderDetail(result.updated, result.details), idempotentReplay: Boolean(result.idempotentReplay) };
    },

    async markCodCollected(staffId, orderId, input = {}) {
      await getOrderOrThrow(orderId);
      throw new ApiError(409, 'Carrier evidence is required; Staff cannot mark COD as collected');
    },

    async getInvoice(staffId, orderId) {
      const order = await getOrderOrThrow(orderId);
      if (!INVOICE_ELIGIBLE_STATUSES.has(order.orderStatus)) throw new ApiError(409, 'Invoice is only available after order confirmation');
      const existing = await orderRepository.findInvoiceByOrderId(order._id);
      if (existing) return toInvoiceResponse(existing, order);
      const details = await orderRepository.listOrderDetails(orderId);
      const invoicePayload = {
        orderId: order._id,
        invoiceCode: generateInvoiceCode(),
        issuedBy: staffId,
        issuedAt: new Date(),
        currency: order.currency || 'VND',
        subtotal: Number(order.subtotal || order.totalAmount || 0),
        shippingFee: Number(order.shippingFee || 0),
        totalAmount: Number(order.totalAmount || 0),
        receiverName: order.receiverName || '',
        receiverPhone: order.receiverPhone || '',
        shippingAddress: order.shippingAddress,
        items: details.map((detail) => ({
          orderDetailId: detail._id,
          productId: detail.productId,
          productNameSnapshot: detail.productNameSnapshot,
          productSkuSnapshot: detail.productSkuSnapshot || '',
          unitSnapshot: detail.unitSnapshot || '',
          productImageSnapshot: detail.productImageSnapshot || '',
          priceSnapshot: detail.priceSnapshot,
          quantity: detail.quantity,
          subtotal: detail.subtotal,
        })),
      };
      try {
        return toInvoiceResponse(await orderRepository.createInvoice(invoicePayload), order);
      } catch (error) {
        if (error && error.code === 11000) {
          const replay = await orderRepository.findInvoiceByOrderId(order._id);
          if (replay) return toInvoiceResponse(replay, order);
        }
        throw error;
      }
    },
  };
}

module.exports = { createStaffOrderService, staffOrderService: createStaffOrderService() };
