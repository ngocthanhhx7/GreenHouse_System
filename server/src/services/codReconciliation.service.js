const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const CodEvidence = require('../models/codEvidence.model');
const CodRecoveryReceipt = require('../models/codRecoveryReceipt.model');
const OrderDetail = require('../models/orderDetail.model');
const RefundPending = require('../models/refundPending.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const ExchangeCase = require('../models/exchangeCase.model');
const { logAudit } = require('../utils/auditLogger');
const {
  afterSalesLockService: modelAfterSalesLockService,
} = require('./afterSalesLock.service');

const MAX_EVENT_ID_LENGTH = 160;

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
    async findOrderById(id, session) { return withOptionalSession(Order.findById(id), session).lean(); },
    async findEvidenceByEventId(eventId, session) { return withOptionalSession(CodEvidence.findOne({ eventId }), session).lean(); },
    async findCollectionEvidenceByOrder(orderId, session) {
      return withOptionalSession(CodEvidence.findOne({ orderId, eventType: 'COLLECTION' }).sort({ occurredAt: 1 }), session).lean();
    },
    async listSettlementEvidenceByOrder(orderId, session) {
      return withOptionalSession(CodEvidence.find({ orderId, eventType: 'SETTLEMENT' }).sort({ occurredAt: 1 }), session).lean();
    },
    async createEvidence(data, session) {
      const [created] = await CodEvidence.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async updateOrder(id, data, session) { return withOptionalSession(Order.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean(); },
    async claimCodRecoveryClosure(id, data, session) {
      return withOptionalSession(
        Order.findOneAndUpdate(
          { _id: id, orderStatus: 'Delivered', codDiscrepancyStatus: 'RecoveryInProgress' },
          { $set: data },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async findPaymentByOrderId(orderId, session) { return withOptionalSession(Payment.findOne({ orderId }), session).lean(); },
    async updatePayment(id, data, session) { return withOptionalSession(Payment.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean(); },
    async findLatestPaymentAttemptByOrder(orderId, session) { return withOptionalSession(PaymentAttempt.findOne({ orderId }).sort({ createdAt: -1 }), session).lean(); },
    async updatePaymentAttempt(id, data, session) { return withOptionalSession(PaymentAttempt.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean(); },
    async findHeldRequestByOrder(orderId, session) {
      const returnRequest = await withOptionalSession(ReturnRefundRequest.findOne({
        orderId,
        status: { $in: ['AwaitingCODReconciliation', 'CODRecoveryInProgress'] },
      }), session).lean();
      if (returnRequest) return { ...returnRequest, _caseType: 'RETURN_REFUND' };
      const exchange = await withOptionalSession(ExchangeCase.findOne({
        orderId,
        status: { $in: ['AwaitingCODReconciliation', 'CODRecoveryInProgress'] },
      }), session).lean();
      return exchange ? { ...exchange, _caseType: 'EXCHANGE' } : null;
    },
    async findTerminalClosedRequestByOrder(orderId, session) {
      const returnRequest = await withOptionalSession(ReturnRefundRequest.findOne({
        orderId,
        status: 'ClosedByCODRecovery',
      }), session).lean();
      if (returnRequest) return { ...returnRequest, _caseType: 'RETURN_REFUND' };
      const exchange = await withOptionalSession(ExchangeCase.findOne({
        orderId,
        status: 'ClosedByCODRecovery',
      }), session).lean();
      return exchange ? { ...exchange, _caseType: 'EXCHANGE' } : null;
    },
    async updateRequest(id, data, session) {
      const updatedReturn = await withOptionalSession(ReturnRefundRequest.findByIdAndUpdate(
        id,
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
      if (updatedReturn) return updatedReturn;
      return withOptionalSession(ExchangeCase.findByIdAndUpdate(
        id,
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async findRefundByObligationKey(obligationKey, session) { return withOptionalSession(RefundPending.findOne({ obligationKey }), session).lean(); },
    async upsertRefundPending(data, session) {
      return withOptionalSession(
        RefundPending.findOneAndUpdate(
          { obligationKey: data.obligationKey },
          { $setOnInsert: data },
          { new: true, upsert: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async listOrderDetails(orderId, session) { return withOptionalSession(OrderDetail.find({ orderId }).sort({ createdAt: 1 }), session).lean(); },
    async findRecoveryReceiptById(receiptId, session) { return withOptionalSession(CodRecoveryReceipt.findOne({ receiptId }), session).lean(); },
    async findRecoveryReceiptByOrder(orderId, session) { return withOptionalSession(CodRecoveryReceipt.findOne({ orderId }), session).lean(); },
    async listRecoveryCandidates() {
      return Order.find({
        paymentMethod: 'COD',
        orderStatus: 'Delivered',
        codDiscrepancyStatus: 'Open',
        customerCollectionEvidenceId: { $type: 'string', $gt: '' },
        $expr: { $lt: ['$customerCollectedAmount', '$codExpectedAmount'] },
      }).sort({ deliveredAt: 1 }).lean();
    },
    async createRecoveryReceipt(data, session) {
      const [created] = await CodRecoveryReceipt.create([data], session ? { session } : undefined);
      return created.toObject();
    },
  };
}

function normalizeEventId(value) {
  const eventId = String(value || '').trim();
  if (!eventId || eventId.length > MAX_EVENT_ID_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(eventId)) {
    throw new ApiError(400, 'A valid COD evidence eventId is required');
  }
  return eventId;
}

function normalizeCollectionSource(value) {
  const source = String(value || 'CARRIER').trim();
  if (!['CARRIER', 'STAFF_EVIDENCE'].includes(source)) {
    throw new ApiError(400, 'Collection evidence source is invalid');
  }
  return source;
}

function normalizeAmount(value, fieldName) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new ApiError(400, `${fieldName} must be a non-negative integer`);
  return amount;
}

function normalizeDate(value, fieldName, fallback) {
  const date = value === undefined || value === null || value === '' ? new Date(fallback()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `${fieldName} is invalid`);
  return date;
}

function normalizeEvidenceReference(value) {
  const reference = String(value || '').trim();
  if (!reference || reference.length > 256) throw new ApiError(400, 'evidenceReference is required');
  return reference;
}

function expectedAmount(order) {
  const expected = Number(order.codExpectedAmount ?? order.totalAmount);
  if (!Number.isSafeInteger(expected) || expected < 0) throw new ApiError(409, 'COD expected amount is not configured');
  return expected;
}

function assertCodOrder(order) {
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.paymentMethod !== 'COD') throw new ApiError(400, 'Only COD orders support COD collection evidence');
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input || {}, key);
}

function createCodReconciliationService({
  repository = createModelRepository(),
  transactionManager = createModelTransactionManager(),
  auditLogger = { log: logAudit },
  afterSalesLockService = modelAfterSalesLockService,
  clock = () => new Date(),
} = {}) {
  async function writeAudit(userId, action, order, description) {
    await auditLogger.log({
      userId: userId || null,
      action,
      targetEntity: 'Order',
      targetId: String(order._id),
      description,
    });
  }

  async function loadOrder(orderId, session) {
    const order = await repository.findOrderById(orderId, session);
    assertCodOrder(order);
    return order;
  }

  async function closeHeldRequestAndLock(
    heldRequest,
    orderId,
    data,
    session,
    { requestAlreadyTerminal = false } = {}
  ) {
    if (!requestAlreadyTerminal) {
      await repository.updateRequest(heldRequest._id, data, session);
    }
    const released = await afterSalesLockService.release({
      orderId,
      caseType: heldRequest._caseType,
      caseId: heldRequest._id,
      terminalStatus: 'ClosedByCODRecovery',
      closePermanently: true,
    }, session);
    if (released) return released;

    const existingLock = await afterSalesLockService.find(orderId, session);
    const exactClosedLock = existingLock
      && existingLock.status === 'ClosedPermanently'
      && existingLock.terminalStatus === 'ClosedByCODRecovery'
      && existingLock.caseType === heldRequest._caseType
      && String(existingLock.caseId) === String(heldRequest._id);
    if (exactClosedLock) return existingLock;
    throw new ApiError(409, 'Active after-sales lock changed during COD recovery closure');
  }

  async function loadTerminalClosedRequest(orderId, session) {
    if (!repository.findTerminalClosedRequestByOrder) {
      return null;
    }
    return repository.findTerminalClosedRequestByOrder(orderId, session);
  }

  function checkReplay(existing, orderId, eventType, amount) {
    if (!existing) return null;
    const existingAmount = eventType === 'COLLECTION' ? Number(existing.customerCollectedAmount) : Number(existing.carrierSettlementAmount);
    if (String(existing.orderId) !== String(orderId) || existing.eventType !== eventType || existingAmount !== amount) {
      throw new ApiError(409, 'COD evidence eventId was already used for different evidence');
    }
    return { event: existing, idempotentReplay: true };
  }

  async function recordCollectionEvidence(orderId, input = {}, options = {}) {
    const source = normalizeCollectionSource(options.source);
    const actorId = options.actorId || null;
    const eventId = normalizeEventId(input.eventId);
    if (hasOwn(input, 'carrierSettlementAmount')) throw new ApiError(400, 'Collection evidence cannot contain Carrier settlement amount');
    const amount = normalizeAmount(input.customerCollectedAmount, 'customerCollectedAmount');
    const collectionTiming = String(input.collectionTiming || '').trim();
    if (!['AT_DELIVERY', 'AFTER_DELIVERY'].includes(collectionTiming)) throw new ApiError(400, 'collectionTiming must be AT_DELIVERY or AFTER_DELIVERY');
    const occurredAt = normalizeDate(input.occurredAt, 'occurredAt', clock);
    const evidenceReference = normalizeEvidenceReference(input.evidenceReference);

    let result;
    try {
      result = await transactionManager.withTransaction(async (session) => {
      const existing = await repository.findEvidenceByEventId(eventId, session);
      const replay = checkReplay(existing, orderId, 'COLLECTION', amount);
      if (replay) {
        const replayOrder = await loadOrder(orderId, session);
        return { ...replay, order: replayOrder };
      }

      const order = await loadOrder(orderId, session);
      const expected = expectedAmount(order);
      if (order.orderStatus !== 'Delivered') throw new ApiError(409, 'COD collection evidence requires a Delivered order');
      if (amount > expected) throw new ApiError(400, 'Customer collection cannot exceed fixed COD expected amount');
      const priorCollection = await repository.findCollectionEvidenceByOrder(order._id, session);
      if (priorCollection) throw new ApiError(409, 'Only one COD collection evidence is allowed; split COD is not supported');
      if (order.paymentStatus === 'Paid' && amount < expected) throw new ApiError(409, 'A Paid COD order cannot be replaced by partial collection evidence');

      const event = await repository.createEvidence({
        orderId: order._id,
        eventId,
        eventType: 'COLLECTION',
        source,
        customerCollectedAmount: amount,
        collectionTiming,
        occurredAt,
        evidenceReference,
        providerMessageId: String(input.providerMessageId || '').trim(),
      }, session);

      const fullCollection = amount === expected;
      const paidAt = fullCollection && collectionTiming === 'AT_DELIVERY' && order.deliveredAt
        ? new Date(order.deliveredAt)
        : occurredAt;
      const orderData = {
        codExpectedAmount: expected,
        customerCollectedAmount: amount,
        customerCollectedAt: occurredAt,
        customerCollectionEvidenceId: eventId,
        paymentStatus: fullCollection ? 'Paid' : 'Unpaid',
        codDiscrepancyStatus: fullCollection ? 'Resolved' : 'Open',
        ...(fullCollection ? { completedSaleAt: paidAt } : {}),
      };
      const payment = await repository.findPaymentByOrderId(order._id, session);
      const attempt = await repository.findLatestPaymentAttemptByOrder(order._id, session);
      if (fullCollection && !payment && !attempt) throw new ApiError(409, 'COD payment records are missing');
      if (fullCollection) {
        if (payment) await repository.updatePayment(payment._id, { paymentStatus: 'Paid', paidAt }, session);
        if (attempt) await repository.updatePaymentAttempt(attempt._id, { paymentStatus: 'Paid', paidAt }, session);
      }
      const updatedOrder = await repository.updateOrder(order._id, orderData, session);
      const heldRequest = await repository.findHeldRequestByOrder(order._id, session);
      if (fullCollection && heldRequest) {
        await repository.updateRequest(heldRequest._id, {
          status: heldRequest._caseType === 'EXCHANGE' ? 'Submitted' : 'Pending',
          holdReason: '',
          paymentId: payment?._id || null,
          handledAt: new Date(clock()),
        }, session);
      } else if (!fullCollection && heldRequest) {
        await repository.updateRequest(heldRequest._id, {
          status: 'CODRecoveryInProgress',
          holdReason: 'Customer under-collection evidence confirmed; waiting for complete Warehouse goods recovery.',
          handledAt: new Date(clock()),
        }, session);
      }
        return { event, order: updatedOrder, idempotentReplay: false };
      });
    } catch (error) {
      if (error?.code === 11000 || error?.codeName === 'DuplicateKey') {
        const existing = await repository.findEvidenceByEventId(eventId);
        if (existing) {
          const replay = checkReplay(existing, orderId, 'COLLECTION', amount);
          result = { ...replay, order: await loadOrder(orderId) };
        } else {
          const priorCollection = await repository.findCollectionEvidenceByOrder(orderId);
          if (priorCollection) throw new ApiError(409, 'Only one COD collection evidence is allowed; split COD is not supported');
        }
      }
      if (!result) throw error;
    }

    if (!result.idempotentReplay) {
      const auditAction = source === 'STAFF_EVIDENCE'
        ? 'STAFF_COD_COLLECTION_RECORDED'
        : 'CARRIER_COD_COLLECTION_RECORDED';
      const sourceLabel = source === 'STAFF_EVIDENCE' ? 'Staff manual' : 'Carrier';
      await writeAudit(actorId, auditAction, result.order, `Recorded ${sourceLabel} Customer-collection evidence ${eventId}`);
    }
    return result;
  }

  async function recordStaffCollectionEvidence(staffId, orderId, input = {}) {
    return recordCollectionEvidence(orderId, input, {
      source: 'STAFF_EVIDENCE',
      actorId: staffId,
    });
  }

  async function recordSettlementEvidence(orderId, input = {}) {
    const eventId = normalizeEventId(input.eventId);
    if (hasOwn(input, 'customerCollectedAmount')) throw new ApiError(400, 'Settlement evidence cannot contain Customer collection amount');
    const amount = normalizeAmount(input.carrierSettlementAmount, 'carrierSettlementAmount');
    const occurredAt = normalizeDate(input.occurredAt, 'occurredAt', clock);
    const evidenceReference = normalizeEvidenceReference(input.evidenceReference);

    let result;
    try {
      result = await transactionManager.withTransaction(async (session) => {
        const existing = await repository.findEvidenceByEventId(eventId, session);
        const replay = checkReplay(existing, orderId, 'SETTLEMENT', amount);
        if (replay) {
          const replayOrder = await loadOrder(orderId, session);
          return { ...replay, order: replayOrder };
        }
        const order = await loadOrder(orderId, session);
        const expected = expectedAmount(order);
        const priorSettlements = await repository.listSettlementEvidenceByOrder(order._id, session);
        const aggregate = priorSettlements.reduce((sum, entry) => sum + Number(entry.carrierSettlementAmount || 0), 0) + amount;
        const event = await repository.createEvidence({
          orderId: order._id,
          eventId,
          eventType: 'SETTLEMENT',
          source: 'CARRIER',
          carrierSettlementAmount: amount,
          occurredAt,
          evidenceReference,
          providerMessageId: String(input.providerMessageId || '').trim(),
        }, session);
        const updatedOrder = await repository.updateOrder(order._id, {
          codExpectedAmount: expected,
          carrierSettlementAmount: aggregate,
          carrierSettledAt: occurredAt,
          carrierSettlementEvidenceId: eventId,
          settlementReconciliationStatus: aggregate === expected ? 'Settled' : 'Open',
        }, session);
        return { event, order: updatedOrder, idempotentReplay: false };
      });
    } catch (error) {
      if (error?.code === 11000 || error?.codeName === 'DuplicateKey') {
        const existing = await repository.findEvidenceByEventId(eventId);
        if (existing) {
          const replay = checkReplay(existing, orderId, 'SETTLEMENT', amount);
          result = { ...replay, order: await loadOrder(orderId) };
        }
      }
      if (!result) throw error;
    }

    if (!result.idempotentReplay) await writeAudit(null, 'CARRIER_COD_SETTLEMENT_RECORDED', result.order, `Recorded Carrier settlement evidence ${eventId}`);
    return result;
  }

  async function recordGoodsRecovery(warehouseId, orderId, input = {}) {
    const receiptId = normalizeEventId(input.receiptId);
    const evidenceReference = normalizeEvidenceReference(input.evidenceReference);
    const receivedAt = normalizeDate(input.receivedAt, 'receivedAt', clock);
    if (!Array.isArray(input.items) || input.items.length === 0) throw new ApiError(400, 'Complete recovered item lines are required');

    let result;
    try {
      result = await transactionManager.withTransaction(async (session) => {
        const existingById = await repository.findRecoveryReceiptById(receiptId, session);
        if (existingById) {
          if (String(existingById.orderId) !== String(orderId)) throw new ApiError(409, 'Recovery receiptId already belongs to another order');
          return { receipt: existingById, order: await loadOrder(orderId, session), idempotentReplay: true };
        }
        const order = await loadOrder(orderId, session);
        const expected = expectedAmount(order);
        const collected = normalizeAmount(order.customerCollectedAmount || 0, 'stored Customer collection');
        const collectionEvidence = await repository.findCollectionEvidenceByOrder(order._id, session);
        if (order.codDiscrepancyStatus !== 'Open' || !collectionEvidence) {
          throw new ApiError(409, 'Complete Carrier collection evidence is required before goods recovery');
        }
        if (order.orderStatus !== 'Delivered' || collected >= expected) throw new ApiError(409, 'Goods recovery is only available for a Delivered COD under-collection');
        const existingByOrder = await repository.findRecoveryReceiptByOrder(order._id, session);
        if (existingByOrder) throw new ApiError(409, 'Complete goods recovery was already recorded for this order');

        const details = await repository.listOrderDetails(order._id, session);
        if (!details.length) throw new ApiError(409, 'Order details are missing for goods recovery');
        const detailById = new Map(details.map((detail) => [String(detail._id), detail]));
        const seen = new Set();
        const items = input.items.map((item) => {
          const detail = detailById.get(String(item.orderDetailId));
          if (!detail || seen.has(String(item.orderDetailId))) throw new ApiError(400, 'Each recovered item must match one order line exactly once');
          seen.add(String(item.orderDetailId));
          const receivedQuantity = Number(item.receivedQuantity);
          if (!Number.isInteger(receivedQuantity) || receivedQuantity !== Number(detail.quantity)) {
            throw new ApiError(409, 'Complete goods recovery requires the full quantity of every order line');
          }
          return {
            orderDetailId: detail._id,
            productId: detail.productId,
            expectedQuantity: Number(detail.quantity),
            receivedQuantity,
          };
        });
        if (seen.size !== details.length) throw new ApiError(409, 'Complete goods recovery requires every order line');

        const receipt = await repository.createRecoveryReceipt({
          orderId: order._id,
          receiptId,
          recordedBy: warehouseId,
          items,
          evidenceReference,
          receivedAt,
          status: 'Complete',
        }, session);
        const updatedOrder = await repository.updateOrder(order._id, {
          codRecoveryReceiptId: receiptId,
          codRecoveryReceivedAt: receivedAt,
          codDiscrepancyStatus: 'RecoveryInProgress',
        }, session);
        const heldRequest = await repository.findHeldRequestByOrder(order._id, session);
        if (heldRequest) {
          await repository.updateRequest(heldRequest._id, {
            status: 'CODRecoveryInProgress',
            holdReason: 'Warehouse confirmed complete goods recovery; waiting for Staff financial closure.',
            handledAt: new Date(clock()),
          }, session);
        }
        return { receipt, order: updatedOrder, idempotentReplay: false };
      });
    } catch (error) {
      if (error?.code === 11000 || error?.codeName === 'DuplicateKey') {
        const existingById = await repository.findRecoveryReceiptById(receiptId);
        if (existingById) {
          if (String(existingById.orderId) !== String(orderId)) throw new ApiError(409, 'Recovery receiptId already belongs to another order');
          result = { receipt: existingById, order: await loadOrder(orderId), idempotentReplay: true };
        } else if (await repository.findRecoveryReceiptByOrder(orderId)) {
          throw new ApiError(409, 'Complete goods recovery was already recorded for this order');
        }
      }
      if (!result) throw error;
    }

    if (!result.idempotentReplay) await writeAudit(warehouseId, 'WAREHOUSE_COD_GOODS_RECOVERED', result.order, `Warehouse recorded complete COD recovery receipt ${receiptId}`);
    return result;
  }

  function toRecoveryCandidate(order, details = []) {
    return {
      id: String(order._id),
      orderId: String(order._id),
      orderCode: order.orderCode,
      status: 'CODRecoveryInProgress',
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      codExpectedAmount: expectedAmount(order),
      customerCollectedAmount: Number(order.customerCollectedAmount || 0),
      customerCollectionEvidenceId: order.customerCollectionEvidenceId || '',
      codDiscrepancyStatus: order.codDiscrepancyStatus,
      details,
      deliveredAt: order.deliveredAt || null,
    };
  }

  async function listWarehouseRecoveryCandidates() {
    const orders = repository.listRecoveryCandidates ? await repository.listRecoveryCandidates() : [];
    const items = [];
    for (const order of orders) {
      const details = repository.listOrderDetails ? await repository.listOrderDetails(order._id) : [];
      items.push(toRecoveryCandidate(order, details));
    }
    return { items, total: items.length };
  }

  async function getWarehouseRecoveryCandidate(orderId) {
    const order = await loadOrder(orderId);
    if (order.orderStatus !== 'Delivered' || order.codDiscrepancyStatus !== 'Open' || !order.customerCollectionEvidenceId) {
      throw new ApiError(409, 'This order is not waiting for COD goods recovery');
    }
    const collected = normalizeAmount(order.customerCollectedAmount || 0, 'stored Customer collection');
    if (collected >= expectedAmount(order)) throw new ApiError(409, 'This order has no conclusive COD under-collection');
    const details = repository.listOrderDetails ? await repository.listOrderDetails(order._id) : [];
    return toRecoveryCandidate(order, details);
  }

  async function finalizeRecovery(staffId, orderId, input = {}) {
    if (hasOwn(input, 'amount')) throw new ApiError(400, 'Recovery refund amount is server-derived');
    if (hasOwn(input, 'goodsRecovered') || hasOwn(input, 'goodsRecoveryEvidenceId')) throw new ApiError(400, 'Staff cannot assert Warehouse goods-recovery facts');
    const note = String(input.note || '').trim();

    const result = await transactionManager.withTransaction(async (session) => {
      const order = await loadOrder(orderId, session);
      const expected = expectedAmount(order);
      const collected = normalizeAmount(order.customerCollectedAmount || 0, 'stored Customer collection');
      if (collected >= expected) throw new ApiError(409, 'COD recovery is only available for a conclusive under-collection');
      const obligationKey = `COD_RECOVERY:${String(order._id)}`;
      const existingRefund = await repository.findRefundByObligationKey(obligationKey, session);
      if (order.codDiscrepancyStatus === 'Closed' || order.orderStatus === 'Returned') {
        const heldRequest = await repository.findHeldRequestByOrder(order._id, session)
          || await loadTerminalClosedRequest(order._id, session);
        const requestAlreadyTerminal = heldRequest?.status === 'ClosedByCODRecovery';
        if (heldRequest && (
          requestAlreadyTerminal
          || collected === 0
          || existingRefund?.status === 'Refunded'
        )) {
          const completedAt = requestAlreadyTerminal && heldRequest.recoveryCompletedAt
            ? new Date(heldRequest.recoveryCompletedAt)
            : new Date(clock());
          await closeHeldRequestAndLock(heldRequest, order._id, {
            status: 'ClosedByCODRecovery',
            refundAmount: collected,
            recoveryRefundId: existingRefund?._id || null,
            recoveryCompletedAt: completedAt,
            holdReason: collected > 0
              ? 'Goods recovered and server-derived recovery refund verified'
              : 'Goods recovered; no Customer collection to refund',
            handledAt: completedAt,
          }, session, { requestAlreadyTerminal });
        }
        return { order, refund: existingRefund, idempotentReplay: true };
      }
      if (order.orderStatus !== 'Delivered') throw new ApiError(409, 'COD recovery requires a Delivered order');
      const goodsRecoveryReceiptId = String(input.goodsRecoveryReceiptId || order.codRecoveryReceiptId || '').trim();
      const recoveryReceipt = goodsRecoveryReceiptId ? await repository.findRecoveryReceiptById(goodsRecoveryReceiptId, session) : null;
      if (!recoveryReceipt || String(recoveryReceipt.orderId) !== String(order._id) || recoveryReceipt.status !== 'Complete') {
        throw new ApiError(409, 'A complete Warehouse goods-recovery receipt is required');
      }
      if (collected > 0) {
        if (input.destinationVerified !== true) throw new ApiError(409, 'Secure refund destination must be verified before recovery payout');
        if (!String(input.destinationReference || '').trim()) throw new ApiError(400, 'destinationReference is required for a positive recovery refund');
      }

      const payment = await repository.findPaymentByOrderId(order._id, session);
      const attempt = await repository.findLatestPaymentAttemptByOrder(order._id, session);
      if (collected > 0 && !attempt) throw new ApiError(409, 'A COD payment attempt is required before recovery refund hand-off');
      const closureData = { orderStatus: 'Returned', paymentStatus: 'Cancelled', codDiscrepancyStatus: 'Closed' };
      const claimedOrder = repository.claimCodRecoveryClosure
        ? await repository.claimCodRecoveryClosure(order._id, closureData, session)
        : await repository.updateOrder(order._id, closureData, session);
      if (!claimedOrder) {
        const current = await repository.findOrderById(order._id, session);
        if (current?.codDiscrepancyStatus === 'Closed' || current?.orderStatus === 'Returned') {
          return { order: current, refund: await repository.findRefundByObligationKey(obligationKey, session), idempotentReplay: true };
        }
        throw new ApiError(409, 'COD recovery changed while another Staff worker was processing it');
      }
      if (payment) await repository.updatePayment(payment._id, { paymentStatus: 'Cancelled' }, session);
      if (attempt) await repository.updatePaymentAttempt(attempt._id, { paymentStatus: 'Cancelled' }, session);
      let refund = existingRefund;
      if (collected > 0) {
        const collectionEvidence = await repository.findCollectionEvidenceByOrder(order._id, session);
        refund = await repository.upsertRefundPending({
          orderId: order._id,
          paymentAttemptId: attempt?._id || null,
          customerId: order.customerId,
          amount: collected,
          currency: order.currency || 'VND',
          reason: `COD recovery after Warehouse receipt: ${goodsRecoveryReceiptId}`,
          status: 'RefundPending',
          obligationType: 'COD_RECOVERY',
          obligationKey,
          sourceCollectionEventId: collectionEvidence?._id || null,
        }, session);
      }
      const heldRequest = await repository.findHeldRequestByOrder(order._id, session);
      if (heldRequest) {
        const payoutComplete = collected === 0 || refund?.status === 'Refunded';
        const completedAt = payoutComplete ? new Date(clock()) : null;
        const requestData = {
          status: payoutComplete ? 'ClosedByCODRecovery' : 'CODRecoveryInProgress',
          refundAmount: collected,
          recoveryRefundId: refund?._id || null,
          recoveryCompletedAt: completedAt,
          holdReason: payoutComplete
            ? (collected > 0
              ? 'Goods recovered and server-derived recovery refund verified'
              : 'Goods recovered; no Customer collection to refund')
            : 'Goods recovered; server-derived recovery refund pending',
          handledAt: completedAt,
        };
        if (payoutComplete) {
          await closeHeldRequestAndLock(heldRequest, order._id, requestData, session);
        } else {
          await repository.updateRequest(heldRequest._id, requestData, session);
        }
      }
      return { order: claimedOrder, refund, idempotentReplay: false, note };
    });

    if (!result.idempotentReplay) await writeAudit(staffId, 'STAFF_COD_RECOVERY_FINALIZED', result.order, `Finalized COD recovery for ${result.order.orderCode}`);
    return result;
  }

  return {
    recordCollectionEvidence,
    recordStaffCollectionEvidence,
    recordSettlementEvidence,
    recordGoodsRecovery,
    finalizeRecovery,
    listWarehouseRecoveryCandidates,
    getWarehouseRecoveryCandidate,
  };
}

module.exports = {
  createCodReconciliationService,
  createModelRepository,
  codReconciliationService: createCodReconciliationService(),
};
