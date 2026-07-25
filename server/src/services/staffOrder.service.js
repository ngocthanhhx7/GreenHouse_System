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
const FulfillmentCycle = require('../models/fulfillmentCycle.model');
const Invoice = require('../models/invoice.model');
const DomainOutbox = require('../models/domainOutbox.model');
const { logAudit } = require('../utils/auditLogger');
const { canonicalEnvelope } = require('./domainEventProducer.service');
const {
  assignmentCoordinator: defaultAssignmentCoordinator,
} = require('./assignmentCoordination.service');

const INVOICE_ELIGIBLE_STATUSES = new Set(['Confirmed', 'Packed', 'Shipped', 'Delivered', 'DeliveryFailed']);

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

function requireStaffConfirmIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!key) {
    throw new ApiError(
      400,
      'Thiếu mã chống gửi lặp cho thao tác xác nhận đơn.',
      [],
      'STAFF_CONFIRM_IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  try {
    return normalizeIdempotencyKey(key);
  } catch (_error) {
    throw new ApiError(
      400,
      'Mã chống gửi lặp không hợp lệ.',
      [],
      'STAFF_CONFIRM_IDEMPOTENCY_KEY_INVALID',
    );
  }
}

function normalizeConfirmationNote(value) {
  const note = String(value || '').trim();
  if (note.length > 500) {
    throw new ApiError(
      400,
      'Ghi chú xác nhận không được vượt quá 500 ký tự.',
      [],
      'VALIDATION_ERROR',
    );
  }
  return note;
}

function hashCommand(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isConfirmationWriteConflict(error) {
  return Boolean(
    error?.code === 11000
    || error?.errorLabels?.includes('TransientTransactionError')
    || error?.errorLabels?.includes('UnknownTransactionCommitResult')
    || /write conflict|duplicate key|transaction.*conflict/i.test(error?.message || ''),
  );
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
    customerCollectionEvidenceId: order.customerCollectionEvidenceId || '',
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
    confirmedBy: order.confirmedBy ? String(order.confirmedBy) : null,
    confirmedAt: order.confirmedAt || null,
    createdAt: order.createdAt,
  };
}

function toOrderDetail(order, details = []) {
  return { ...toOrderSummary(order), details };
}

function toStockExportRequest(request, details = []) {
  return {
    id: String(request._id),
    orderId: String(request.orderId),
    cycleId: request.cycleId ? String(request.cycleId) : null,
    requestKind: request.requestKind,
    requestedBy: String(request.requestedBy),
    status: request.status,
    note: request.note || '',
    createdAt: request.createdAt,
    items: details.map((detail) => ({
      orderDetailId: String(detail._id),
      productId: String(detail.productId),
      productNameSnapshot: detail.productNameSnapshot,
      quantity: Number(detail.quantity),
    })),
  };
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
          $or: [
            { paymentMethod: 'COD', paymentStatus: 'Unpaid' },
            { paymentMethod: 'ONLINE', paymentStatus: 'Paid' },
          ],
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
        StockExportRequest.findOne({ orderId, status: { $in: ['Pending', 'Processing', 'Failed'] } }),
        session
      ).lean();
    },
    async findInitialStockExportRequest(orderId, session) {
      return withOptionalSession(
        StockExportRequest.findOne({ orderId, requestKind: 'Initial' }),
        session,
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
        status: 'Completed',
      }), session).lean();
    },
    async findInitialFulfillmentCycle(orderId, session) {
      return withOptionalSession(
        FulfillmentCycle.findOne({ orderId, cycleNumber: 1, cycleType: 'Initial' }),
        session,
      ).lean();
    },
    async createFulfillmentCycle(data, session) {
      const [cycle] = await FulfillmentCycle.create([data], session ? { session } : undefined);
      return cycle.toObject();
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
    async enqueuePostCommitWork(data, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          { identityKey: data.identityKey },
          { $setOnInsert: data },
          { upsert: true, new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
  };
}

function createStaffOrderService({
  orderRepository = createModelOrderRepository(),
  auditLogger = { log: logAudit },
  transactionManager = createModelTransactionManager(),
  assignmentCoordinator = defaultAssignmentCoordinator,
} = {}) {
  async function getOrderOrThrow(orderId, session) {
    const order = await orderRepository.findOrderById(orderId, session);
    if (!order) throw new ApiError(404, 'Order not found');
    return order;
  }

  async function writeConfirmationAudit(staffId, order, request, note, idempotencyKey, session) {
    await auditLogger.log({
      actorType: 'User',
      actorId: String(staffId),
      actorRole: 'Staff',
      source: 'Application',
      action: 'STAFF_ORDER_CONFIRM',
      targetType: 'Order',
      targetId: String(order._id),
      outcome: 'Success',
      correlationId: idempotencyKey,
      businessEventId: `order:${String(order._id)}:confirmed`,
      previousState: 'Pending',
      newState: 'Confirmed',
      reasonCode: 'ORDER_CONFIRMED',
      reason: `Staff confirmed order ${order.orderCode}. ${note}`.trim(),
      safeFacts: {
        orderCode: order.orderCode,
        stockExportRequestId: String(request._id),
        requestKind: request.requestKind,
      },
    }, session);
  }

  async function writeCancellationAudit(
    staffId,
    order,
    previousState,
    cancelReason,
    businessEventId,
    correlationId,
    timestamp,
    session,
  ) {
    await auditLogger.log({
      actorType: 'User',
      actorId: String(staffId),
      actorRole: 'Staff',
      source: 'Application',
      action: 'STAFF_ORDER_CANCEL',
      targetType: 'Order',
      targetId: String(order._id),
      outcome: 'Success',
      businessEventId,
      correlationId,
      previousState,
      newState: 'Cancelled',
      reasonCode: 'STAFF_ORDER_CANCELLED',
      reason: cancelReason,
      safeFacts: { orderCode: order.orderCode },
      timestamp,
    }, session);
  }

  async function assertExactReservation(details, session) {
    if (!details.length || !orderRepository.listReservationsByOrder) {
      throw new ApiError(
        409,
        'Đơn chưa có dữ liệu giữ hàng đầy đủ.',
        [],
        'ORDER_CONFIRM_RESERVATION_MISSING',
      );
    }

    const reservations = await orderRepository.listReservationsByOrder(details[0].orderId, session);
    const byDetail = new Map();
    for (const reservation of reservations || []) {
      const key = String(reservation.orderDetailId);
      const rows = byDetail.get(key) || [];
      rows.push(reservation);
      byDetail.set(key, rows);
    }

    const requiredByProduct = new Map();
    for (const detail of details) {
      const quantity = Number(detail.quantity);
      const rows = byDetail.get(String(detail._id)) || [];
      if (
        rows.length !== 1
        || String(rows[0].orderId) !== String(detail.orderId)
        || String(rows[0].productId) !== String(detail.productId)
        || Number(rows[0].quantity) !== quantity
        || rows[0].status !== 'Reserved'
      ) {
        throw new ApiError(
          409,
          'Dữ liệu giữ hàng của đơn không còn đầy đủ.',
          [],
          'ORDER_CONFIRM_RESERVATION_MISSING',
        );
      }
      const productId = String(detail.productId);
      requiredByProduct.set(productId, (requiredByProduct.get(productId) || 0) + quantity);
    }

    if (byDetail.size !== details.length) {
      throw new ApiError(
        409,
        'Dữ liệu giữ hàng của đơn không khớp chi tiết đơn.',
        [],
        'ORDER_CONFIRM_RESERVATION_MISSING',
      );
    }

    for (const [productId, quantity] of requiredByProduct) {
      const inventory = await orderRepository.findInventoryByProductId(productId, session);
      const sellable = Number(inventory?.sellableQuantity ?? inventory?.stockQuantity ?? 0);
      const reserved = Number(inventory?.reservedQuantity || 0);
      if (!inventory || inventory.inventoryHealth !== 'Normal' || sellable < quantity || reserved < quantity) {
        throw new ApiError(
          409,
          'Số lượng giữ hàng không còn đủ để xác nhận.',
          [],
          'ORDER_CONFIRM_RESERVATION_MISSING',
        );
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
      const [details, initialStockExportRequest, openStockExportRequest, completedStockExportRequest] = await Promise.all([
        orderRepository.listOrderDetails(orderId),
        orderRepository.findInitialStockExportRequest
          ? orderRepository.findInitialStockExportRequest(orderId)
          : null,
        orderRepository.findOpenStockExportRequest ? orderRepository.findOpenStockExportRequest(orderId) : null,
        orderRepository.findCompletedStockExportRequest
          ? orderRepository.findCompletedStockExportRequest(orderId)
          : null,
      ]);
      const stockExportRequest = initialStockExportRequest || openStockExportRequest || completedStockExportRequest;
      return {
        ...toOrderDetail(order, details),
        stockExportRequest: stockExportRequest ? toStockExportRequest(stockExportRequest, details) : null,
      };
    },

    async confirmOrder(staffId, orderId, input = {}) {
      const note = normalizeConfirmationNote(input.note);
      const idempotencyKey = requireStaffConfirmIdempotencyKey(input.idempotencyKey);
      const requestHash = hashCommand({ note });

      try {
        const result = await transactionManager.withTransaction(async (session) => {
          await assignmentCoordinator.coordinate({
            userId: staffId,
            expectedRole: 'Staff',
            session,
          });
          const order = await getOrderOrThrow(orderId, session);

          if (order.staffConfirmIdempotencyKey === idempotencyKey) {
            if (order.staffConfirmRequestHash !== requestHash) {
              throw new ApiError(
                409,
                'Mã xác nhận đã được dùng cho nội dung khác.',
                [],
                'ORDER_CONFIRM_KEY_REUSED',
              );
            }
            const details = await orderRepository.listOrderDetails(orderId, session);
            const request = await orderRepository.findInitialStockExportRequest(orderId, session);
            if (!request) {
              throw new ApiError(
                409,
                'Không tìm thấy kết quả xác nhận đã ghi nhận.',
                [],
                'ORDER_CONFIRM_STALE_STATE',
              );
            }
            return { updated: order, details, stockExportRequest: request, idempotentReplay: true };
          }

          if (order.orderStatus !== 'Pending') {
            throw new ApiError(
              409,
              'Đơn đã đổi trạng thái, không thể xác nhận lại.',
              [],
              'ORDER_CONFIRM_STALE_STATE',
            );
          }

          const paymentValid = (
            (order.paymentMethod === 'COD' && order.paymentStatus === 'Unpaid')
            || (order.paymentMethod === 'ONLINE' && order.paymentStatus === 'Paid')
          );
          if (!paymentValid) {
            throw new ApiError(
              409,
              'Trạng thái thanh toán chưa phù hợp để xác nhận đơn.',
              [],
              'ORDER_CONFIRM_PAYMENT_INVALID',
            );
          }

          const payment = await orderRepository.findPaymentByOrderId(orderId, session);
          if (
            !payment
            || payment.paymentMethod !== order.paymentMethod
            || payment.paymentStatus !== order.paymentStatus
          ) {
            throw new ApiError(
              409,
              'Dữ liệu thanh toán của đơn không còn hợp lệ.',
              [],
              'ORDER_CONFIRM_PAYMENT_INVALID',
            );
          }

          const details = await orderRepository.listOrderDetails(orderId, session);
          if (!details.length) {
            throw new ApiError(
              409,
              'Đơn chưa có sản phẩm để xác nhận.',
              [],
              'ORDER_CONFIRM_RESERVATION_MISSING',
            );
          }
          await assertExactReservation(details, session);

          const initialRequest = await orderRepository.findInitialStockExportRequest(orderId, session);
          if (initialRequest) {
            throw new ApiError(
              409,
              'Đơn đã có phiếu xuất kho ban đầu.',
              [],
              'ORDER_CONFIRM_STALE_STATE',
            );
          }

          const updated = await orderRepository.claimStaffConfirmation(
            orderId,
            {
              orderStatus: 'Confirmed',
              confirmedBy: staffId,
              confirmedAt: new Date(),
              staffConfirmIdempotencyKey: idempotencyKey,
              staffConfirmRequestHash: requestHash,
            },
            session,
          );
          if (!updated) {
            throw new ApiError(
              409,
              'Đơn đã được xử lý bởi yêu cầu khác.',
              [],
              'ORDER_CONFIRM_CONCURRENT',
            );
          }

          let cycle = orderRepository.findInitialFulfillmentCycle
            ? await orderRepository.findInitialFulfillmentCycle(orderId, session)
            : null;
          if (!cycle) {
            cycle = await orderRepository.createFulfillmentCycle({
              cycleKey: `fulfillment:${String(orderId)}:1`,
              orderId,
              cycleNumber: 1,
              cycleType: 'Initial',
              status: 'AwaitingExport',
              commandKey: idempotencyKey,
              createdBy: staffId,
            }, session);
          }
          const stockExportRequest = await orderRepository.createStockExportRequest({
            orderId,
            cycleId: cycle._id,
            requestKind: 'Initial',
            requestedBy: staffId,
            status: 'Pending',
            note,
          }, session);
          await writeConfirmationAudit(
            staffId,
            updated,
            stockExportRequest,
            note,
            idempotencyKey,
            session,
          );
          return { updated, details, stockExportRequest, idempotentReplay: false };
        });

        return {
          ...toOrderDetail(result.updated, result.details),
          stockExportRequest: result.stockExportRequest
            ? toStockExportRequest(result.stockExportRequest, result.details)
            : null,
          idempotentReplay: Boolean(result.idempotentReplay),
        };
      } catch (error) {
        if (!isConfirmationWriteConflict(error)) throw error;
        const committed = await orderRepository.findOrderById(orderId);
        if (
          committed
          && committed.staffConfirmIdempotencyKey === idempotencyKey
          && committed.staffConfirmRequestHash === requestHash
        ) {
          const details = await orderRepository.listOrderDetails(orderId);
          const request = await orderRepository.findInitialStockExportRequest(orderId);
          return {
            ...toOrderDetail(committed, details),
            stockExportRequest: request ? toStockExportRequest(request, details) : null,
            idempotentReplay: true,
          };
        }
        throw new ApiError(
          409,
          'Đơn đã được xử lý bởi yêu cầu khác.',
          [],
          'ORDER_CONFIRM_CONCURRENT',
        );
      }
    },

    async cancelOrder(staffId, orderId, input = {}) {
      const cancelReason = String(input.cancelReason || '').trim();
      if (!cancelReason) throw new ApiError(400, 'Cancel reason is required');
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const requestHash = hashCommand({ cancelReason });
      const result = await transactionManager.withTransaction(async (session) => {
        await assignmentCoordinator.coordinate({
          userId: staffId,
          expectedRole: 'Staff',
          session,
        });
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
        if (!orderRepository.enqueuePostCommitWork) {
          throw new Error('Canonical DomainOutbox repository is required for Staff cancellation');
        }
        const cancelledAt = new Date();
        const businessEventId = `order:${String(orderId)}:staff-cancelled`;
        const correlationId = idempotencyKey || businessEventId;
        await writeCancellationAudit(
          staffId,
          updated,
          order.orderStatus,
          cancelReason,
          businessEventId,
          correlationId,
          cancelledAt,
          session,
        );
        await orderRepository.enqueuePostCommitWork(canonicalEnvelope({
          identityKey: `notification:${businessEventId}:customer`,
          businessEventId,
          eventType: 'ORDER_CANCELLED',
          aggregateType: 'Order',
          aggregateId: String(orderId),
          occurredAt: cancelledAt,
          recipientId: String(order.customerId),
          targetCollection: 'Order',
          targetId: String(orderId),
          displayValues: { orderCode: order.orderCode },
        }, () => cancelledAt), session);
        return { updated, details, idempotentReplay: false };
      });
      return { ...toOrderDetail(result.updated, result.details), idempotentReplay: Boolean(result.idempotentReplay) };
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
