const crypto = require('node:crypto');
const mongoose = require('mongoose');

const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const RefundPending = require('../models/refundPending.model');
const RefundDestination = require('../models/refundDestination.model');
const RefundPayoutEvidence = require('../models/refundPayoutEvidence.model');
const RefundPayoutIncident = require('../models/refundPayoutIncident.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const ExchangeCase = require('../models/exchangeCase.model');
const ReturnItem = require('../models/returnItem.model');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const { encrypt, decrypt, hash, fingerprint } = require('../utils/refundDestinationCrypto');
const {
  MAX_RETURN_EVIDENCE_TOTAL_SIZE,
  returnEvidenceClaim,
} = require('../utils/returnEvidenceClaim');
const { createPayOSGateway } = require('../config/payos');
const { logAudit } = require('../utils/auditLogger');
const {
  canonicalEnvelope,
  createOutboxWriter,
} = require('./domainEventProducer.service');
const { lowStockAlertLifecycle } = require('./lowStockAlertLifecycle.service');
const { afterSalesLockService } = require('./afterSalesLock.service');
const {
  assignmentCoordinator: defaultAssignmentCoordinator,
} = require('./assignmentCoordination.service');
const {
  ACTIVE_AFTER_SALES_ERROR_CODE,
  resolveActiveAfterSalesConflict,
  createActiveAfterSalesConflict,
} = require('./afterSalesConflict.service');

const OPEN_STATUSES = [
  'New', 'Pending', 'AwaitingCODReconciliation', 'Approved',
  'AwaitingInspection', 'Received', 'ReadyForRefund', 'CODRecoveryInProgress',
];

function createReturnNotificationOutbox() {
  const writer = createOutboxWriter();
  return {
    async publishDomainEvent(event, session) {
      const occurredAt = new Date(event.occurredAt || Date.now());
      return writer.publish(canonicalEnvelope({
        identityKey: `notification:${event.businessEventId}:customer`,
        businessEventId: event.businessEventId,
        eventType: event.type,
        aggregateType: 'ReturnRefundRequest',
        aggregateId: String(event.targetId),
        occurredAt,
        recipientId: String(event.recipientId),
        targetCollection: 'ReturnRefundRequest',
        targetId: String(event.targetId),
        displayValues: event.displayValues,
      }, () => occurredAt), session);
    },
  };
}
const DECIDABLE_STATUSES = ['New', 'Pending', 'AwaitingCODReconciliation'];
const RECEIVABLE_STATUSES = ['Approved', 'AwaitingInspection'];
const HANDOFF_RECORDABLE_STATUSES = [...RECEIVABLE_STATUSES, 'Expired'];
const RECEIVED_STATUSES = ['Received', 'ReadyForRefund'];
const RETURN_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

function computeMoneyObligationsSettled(obligations = []) {
  return obligations.every((obligation) => (
    ['Refunded', 'FailedTerminal', 'ClosedNoPayout', 'Cancelled'].includes(String(obligation?.status || ''))
  ));
}
const SHIP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const CONFIRMATION_NOTICE = 'Tôi đã kiểm tra thông tin nhận hoàn tiền và chịu trách nhiệm về thông tin do mình cung cấp.';

function generateRequestCode() {
  return `RET-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
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
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function toObject(value) {
  return value && typeof value.toObject === 'function' ? value.toObject() : value;
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 20);
}

function normalizeCustomerEvidence(customerId, value) {
  const claimed = Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];
  if (!claimed.length) throw new ApiError(400, 'At least one return/refund evidence attachment is required');
  if (claimed.length > 5) throw new ApiError(400, 'A maximum of 5 return evidence images is allowed');
  const verified = claimed.map((item) => returnEvidenceClaim.verify(customerId, item));
  if (new Set(verified.map((item) => item.url)).size !== verified.length) {
    throw new ApiError(400, 'Duplicate return evidence is not allowed');
  }
  const total = verified.reduce((sum, item) => sum + item.size, 0);
  if (total > MAX_RETURN_EVIDENCE_TOTAL_SIZE) {
    throw new ApiError(413, 'Return evidence must not exceed 20 MiB per request');
  }
  return verified.map((item) => item.url);
}

function canonicalEvidenceUrl(value) {
  return String(value || '').replace(
    /^\/uploads\/return-evidence\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/,
    '/api/return-refunds/evidence/$1'
  );
}

function evidenceForResponse(value) {
  return normalizeEvidence(value).map(canonicalEvidenceUrl);
}

function normalizeDate(value, fieldName, fallback) {
  const date = value === undefined || value === null || value === '' ? new Date(fallback()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `${fieldName} is invalid`);
  return date;
}

function normalizeIdempotencyKey(value, fieldName = 'idempotencyKey') {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new ApiError(400, `${fieldName} must contain 8-160 safe characters`);
  }
  return key;
}

function normalizeRefundAmount(value, fieldName = 'amount') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ApiError(400, `${fieldName} must be a positive integer`);
  return amount;
}

function classifyPayOSPayout(payout, expected) {
  const providerReference = String(payout?.id || '').trim();
  if (!providerReference) {
    throw new ApiError(502, 'payOS returned no payout identifier; retry with the same idempotency key');
  }

  const approvalState = String(payout?.approvalState || '').toUpperCase();
  const transactions = Array.isArray(payout?.transactions) ? payout.transactions : [];
  const states = transactions.map((entry) => String(entry?.state || '').toUpperCase());
  const completedByProvider = ['COMPLETED', 'SUCCEEDED'].includes(approvalState)
    && transactions.length === 1
    && states[0] === 'SUCCEEDED';
  const failedByProvider = ['FAILED', 'REJECTED', 'CANCELLED'].includes(approvalState)
    || states.some((state) => ['FAILED', 'CANCELLED', 'REVERSED'].includes(state));
  const processingByProvider = [
    'DRAFTING', 'SUBMITTED', 'APPROVED', 'SCHEDULED', 'PROCESSING', 'PARTIAL_COMPLETED',
  ].includes(approvalState) || states.some((state) => ['RECEIVED', 'PROCESSING', 'ON_HOLD'].includes(state));

  let status = 'Unknown';
  let failureReason = '';
  if (completedByProvider) {
    const transaction = transactions[0];
    const matchesSnapshot = String(payout.referenceId || '') === String(expected.referenceId)
      && Number(transaction.amount) === Number(expected.amount)
      && String(transaction.toBin || '') === String(expected.toBin)
      && String(transaction.toAccountNumber || '') === String(expected.toAccountNumber);
    if (matchesSnapshot) status = 'Succeeded';
    else failureReason = 'payOS success response did not match the immutable refund amount or destination snapshot';
  } else if (failedByProvider) {
    status = 'Failed';
    failureReason = String(transactions.find((entry) => entry?.errorMessage)?.errorMessage || `payOS payout ${approvalState || 'failed'}`);
  } else if (processingByProvider) {
    status = 'Processing';
  }

  const providerEventKey = hash(JSON.stringify({
    providerReference,
    referenceId: payout?.referenceId || '',
    approvalState,
    transactions: transactions.map((entry) => ({
      id: entry?.id || '', state: entry?.state || '', amount: entry?.amount,
      toBin: entry?.toBin || '', toAccountNumber: entry?.toAccountNumber || '',
      reference: entry?.reference || '', errorCode: entry?.errorCode || '',
    })),
  })).slice(0, 32);

  return { status, providerReference, providerEventKey, failureReason };
}

function maskAccountHolder(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean)
    .map((part) => `${part.slice(0, 1)}${'*'.repeat(Math.max(2, part.length - 1))}`)
    .join(' ');
}

function toDestinationResponse(destination, audience = 'Customer') {
  if (!destination) return null;
  const response = {
    id: String(destination._id),
    version: Number(destination.version),
    bankName: destination.bankName,
    bankBin: destination.bankBin || '',
    maskedAccountNumber: destination.accountNumberLast4 ? `****${destination.accountNumberLast4}` : '',
    maskedAccountHolder: destination.accountHolderMasked,
    status: destination.status,
    customerConfirmedAt: destination.customerConfirmedAt,
    verifiedAt: destination.verifiedAt || null,
    rejectionReason: destination.rejectionReason || '',
    createdAt: destination.createdAt,
  };

  if (audience === 'Staff' && destination.accountNumberEncrypted && destination.accountHolderEncrypted) {
    response.accountNumber = decrypt(destination.accountNumberEncrypted);
    response.accountHolderName = decrypt(destination.accountHolderEncrypted);
  }

  return response;
}

function toPayoutResponse(evidence, audience) {
  if (!evidence) return null;
  const response = {
    id: String(evidence._id),
    method: evidence.method,
    status: evidence.status,
    occurredAt: evidence.occurredAt,
    createdAt: evidence.createdAt,
  };
  if (audience === 'Staff') response.providerReference = evidence.providerReference;
  return response;
}

function toPayoutIncidentResponse(incident) {
  if (!incident) return null;
  return {
    id: String(incident._id),
    cause: incident.cause,
    responsibility: incident.responsibility,
    status: incident.status,
    reportReason: incident.reportReason,
    openedAt: incident.openedAt,
    resolvedAt: incident.resolvedAt || null,
    resolutionNote: incident.resolutionNote || '',
  };
}

function toResponse({ request, order, details = [], items = [], destination = null, payoutEvidence = null, payoutIncident = null }, audience = 'Staff') {
  const preAccountedByDetail = new Map((request.preAccountedItems || []).map((item) => [
    String(item.orderDetailId),
    Number(item.sellableQuantity || 0) + Number(item.damagedQuantity || 0),
  ]));
  const response = {
    id: String(request._id),
    orderId: String(request.orderId),
    orderCode: order ? order.orderCode : request.orderCode,
    requestCode: request.requestCode || '',
    customerId: String(request.customerId),
    reason: request.reason,
    evidenceImages: evidenceForResponse(request.evidenceImages),
    status: request.status,
    holdReason: request.holdReason || '',
    deadlineAt: request.deadlineAt || order?.returnDeadlineAt || null,
    approvedAt: request.approvedAt || null,
    shipByAt: request.shipByAt || null,
    handoffAt: request.handoffAt || null,
    handoffProofReference: request.handoffProofReference || '',
    receivedAt: request.receivedAt || null,
    resolvedBy: request.resolvedBy ? String(request.resolvedBy) : null,
    resolvedAt: request.resolvedAt || null,
    requestedAt: request.requestedAt || request.createdAt,
    handledAt: request.handledAt || null,
    staffNote: request.staffNote || '',
    inspectionNote: request.inspectionNote || '',
    completedBy: request.completedBy ? String(request.completedBy) : null,
    completedAt: request.completedAt || null,
    payoutStatus: payoutEvidence?.status || null,
    details: details.map((detail) => ({
      ...toObject(detail),
      remainingReturnQuantity: Math.max(
        0,
        Number(detail.quantity || 0) - Number(preAccountedByDetail.get(String(detail._id)) || 0)
      ),
    })),
    items: items.map((item) => ({ ...toObject(item), evidenceImages: evidenceForResponse(item.evidenceImages) })),
    createdAt: request.createdAt,
  };

  if (audience !== 'Warehouse') {
    response.destination = toDestinationResponse(destination, audience);
    response.payoutEvidence = toPayoutResponse(payoutEvidence, audience);
    response.payoutIncident = toPayoutIncidentResponse(payoutIncident);
  }

  response.order = order ? (audience === 'Warehouse' ? {
    id: String(order._id),
    orderCode: order.orderCode,
    orderStatus: order.orderStatus,
  } : {
    id: String(order._id),
    orderCode: order.orderCode,
    orderStatus: order.orderStatus,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    totalAmount: order.totalAmount,
    currency: order.currency || 'VND',
    codDiscrepancyStatus: order.codDiscrepancyStatus || 'None',
    codRecoveryReceiptId: order.codRecoveryReceiptId || '',
    returnDeadlineAt: order.returnDeadlineAt || null,
  }) : null;
  return response;
}

function createModelRepository() {
  return {
    async findOrderById(id, session) { return withOptionalSession(Order.findById(id), session).lean(); },
    async findOrderLock(orderId, session) { return afterSalesLockService.find(orderId, session); },
    async findExchangeCaseById(id, session) {
      return withOptionalSession(ExchangeCase.findById(id), session).lean();
    },
    async findReturnRequestById(id, session) {
      return withOptionalSession(ReturnRefundRequest.findById(id), session).lean();
    },
    async claimOrderLock(data, session) { return afterSalesLockService.claim(data, session); },
    async releaseOrderLock(orderId, caseId, terminalStatus, closePermanently = false, session) {
      return afterSalesLockService.release({
        orderId,
        caseType: 'RETURN_REFUND',
        caseId,
        terminalStatus,
        closePermanently,
      }, session);
    },
    async reopenOrderLock(orderId, caseId, session) {
      return afterSalesLockService.reopenCompleted({
        orderId,
        caseType: 'RETURN_REFUND',
        caseId,
      }, session);
    },
    async ensureReturnDeadline(id, deadlineAt, session) {
      const updated = await withOptionalSession(Order.findOneAndUpdate(
        { _id: id, returnDeadlineAt: null },
        { $set: { returnDeadlineAt: deadlineAt } },
        { new: true, runValidators: true }
      ), session).lean();
      return updated || withOptionalSession(Order.findById(id), session).lean();
    },
    async listOrderDetails(orderId, session) { return withOptionalSession(OrderDetail.find({ orderId }).sort({ createdAt: 1 }), session).lean(); },
    async findPaymentByOrderId(orderId, session) { return withOptionalSession(Payment.findOne({ orderId }), session).lean(); },
    async findLatestPaymentAttemptByOrder(orderId, session) { return withOptionalSession(PaymentAttempt.findOne({ orderId }).sort({ createdAt: -1 }), session).lean(); },
    async findOpenRequestByOrderId(orderId, session) {
      return withOptionalSession(ReturnRefundRequest.findOne({
        orderId,
        status: { $in: OPEN_STATUSES },
        obligationKey: { $in: ['', null] },
      }), session).lean();
    },
    async createRequest(data, session) {
      const [created] = await ReturnRefundRequest.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async listRequests(query = {}) {
      const filter = {};
      if (query.customerId) filter.customerId = query.customerId;
      if (query.status) filter.status = query.status;
      return ReturnRefundRequest.find(filter).sort({ createdAt: -1 }).lean();
    },
    async findRequestById(id, session) { return withOptionalSession(ReturnRefundRequest.findById(id), session).lean(); },
    async listOverdueRequests(now, limit = 100, session) {
      return withOptionalSession(ReturnRefundRequest.find({
        status: { $in: RECEIVABLE_STATUSES },
        handoffAt: null,
        shipByAt: { $lt: now },
      }).sort({ shipByAt: 1 }).limit(limit), session).lean();
    },
    async claimDecision(id, statuses, data, session) {
      return withOptionalSession(ReturnRefundRequest.findOneAndUpdate(
        { _id: id, status: { $in: statuses } },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async claimHandoff(id, customerId, data, session) {
      return withOptionalSession(ReturnRefundRequest.findOneAndUpdate(
        { _id: id, customerId, status: { $in: HANDOFF_RECORDABLE_STATUSES }, handoffAt: null },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async claimExpiry(id, now, data, session) {
      return withOptionalSession(ReturnRefundRequest.findOneAndUpdate(
        { _id: id, status: { $in: RECEIVABLE_STATUSES }, handoffAt: null, shipByAt: { $lt: now } },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async claimInspection(id, data, session) {
      return withOptionalSession(ReturnRefundRequest.findOneAndUpdate(
        { _id: id, status: { $in: RECEIVABLE_STATUSES }, handoffAt: { $ne: null } },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async claimPreAccountedInspection(id, data, session) {
      return withOptionalSession(ReturnRefundRequest.findOneAndUpdate(
        {
          _id: id,
          status: { $in: RECEIVABLE_STATUSES },
          sourceExchangeCaseId: { $ne: null },
          'preAccountedItems.0': { $exists: true },
        },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async claimCompletion(id, data, session) {
      return withOptionalSession(ReturnRefundRequest.findOneAndUpdate(
        { _id: id, status: { $in: RECEIVED_STATUSES } },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async updateRequest(id, data, session) {
      return withOptionalSession(ReturnRefundRequest.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean();
    },
    async updateOrder(id, data, session) {
      return withOptionalSession(Order.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean();
    },
    async upsertRefundPending(data, session) {
      const identity = data.obligationKey
        ? { obligationKey: data.obligationKey }
        : { orderId: data.orderId, obligationType: data.obligationType || 'PAYMENT_REVERSAL' };
      return withOptionalSession(RefundPending.findOneAndUpdate(
        identity,
        { $setOnInsert: data },
        { new: true, upsert: true, runValidators: true }
      ), session).lean();
    },
    async findRefundPending(obligationKey, session) {
      return withOptionalSession(RefundPending.findOne({ obligationKey }), session).lean();
    },
    async findRefundPendingByRequestId(returnRefundRequestId, session) {
      return withOptionalSession(RefundPending.findOne({ returnRefundRequestId }), session).lean();
    },
    async listRefundPendingByOrder(orderId, session) {
      return withOptionalSession(RefundPending.find({ orderId }).sort({ createdAt: 1, _id: 1 }), session).lean();
    },
    async updateRefundPending(id, data, session) {
      return withOptionalSession(RefundPending.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean();
    },
    async claimPayoutStart(id, idempotencyKey, expectedOperationKey = '', allowRecovery = false, session) {
      const retryConditions = [
        { payoutStatus: { $in: ['NotStarted', 'Failed'] } },
        { payoutStatus: 'Processing', payoutOperationKey: idempotencyKey },
      ];
      if (allowRecovery) {
        retryConditions.push({
          payoutStatus: { $in: ['Processing', 'Unknown'] },
          payoutOperationKey: expectedOperationKey,
        });
      }
      return withOptionalSession(RefundPending.findOneAndUpdate(
        {
          _id: id,
          status: { $ne: 'Refunded' },
          $or: retryConditions,
        },
        {
          $set: {
            status: 'HandedOff',
            payoutStatus: 'Processing',
            payoutOperationKey: idempotencyKey,
          },
        },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async listReturnItems(requestId, session) {
      return withOptionalSession(ReturnItem.find({ returnRefundRequestId: requestId }).sort({ createdAt: 1 }), session).lean();
    },
    async createReturnItems(items, session) {
      const created = await ReturnItem.insertMany(items, session ? { session } : undefined);
      return created.map(toObject);
    },
    async findInventoryByProductId(productId, session) {
      return withOptionalSession(Inventory.findOne({ productId }), session).lean();
    },
    async claimReturnInventory(productId, before, increments, userId, session) {
      return withOptionalSession(Inventory.findOneAndUpdate(
        { productId, sellableQuantity: before.sellableQuantity, damagedQuantity: before.damagedQuantity },
        {
          $inc: {
            stockQuantity: increments.sellableQuantity,
            sellableQuantity: increments.sellableQuantity,
            damagedQuantity: increments.damagedQuantity,
          },
          $set: { lastUpdatedBy: userId },
        },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async createInventoryTransaction(data, session) {
      const [created] = await InventoryTransaction.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async findDestinationById(id, session) {
      return withOptionalSession(RefundDestination.findById(id).select('+accountNumberEncrypted +accountHolderEncrypted'), session).lean();
    },
    async findLatestDestination(requestId, session) {
      return withOptionalSession(
        RefundDestination.findOne({ returnRefundRequestId: requestId })
          .sort({ version: -1 })
          .select('+accountNumberEncrypted +accountHolderEncrypted'),
        session
      ).lean();
    },
    async findDestinationByIdempotencyKey(requestId, idempotencyKey, session) {
      return withOptionalSession(RefundDestination.findOne({ returnRefundRequestId: requestId, idempotencyKey }).select('+destinationFingerprint'), session).lean();
    },
    async createDestination(data, session) {
      const [created] = await RefundDestination.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async claimDestinationDecision(id, requestId, data, session) {
      return withOptionalSession(RefundDestination.findOneAndUpdate(
        { _id: id, returnRefundRequestId: requestId, status: 'Submitted' },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async findPayoutEvidenceByIdempotencyKey(idempotencyKey, session) {
      return withOptionalSession(RefundPayoutEvidence.findOne({ idempotencyKey }), session).lean();
    },
    async findSuccessfulPayoutEvidence(requestId, session) {
      return withOptionalSession(RefundPayoutEvidence.findOne({ returnRefundRequestId: requestId, status: 'Succeeded' }).sort({ createdAt: -1 }), session).lean();
    },
    async findLatestPayoutEvidence(requestId, session) {
      return withOptionalSession(RefundPayoutEvidence.findOne({ returnRefundRequestId: requestId }).sort({ createdAt: -1 }), session).lean();
    },
    async createPayoutEvidence(data, session) {
      const [created] = await RefundPayoutEvidence.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async findLatestPayoutIncident(requestId, session) {
      return withOptionalSession(RefundPayoutIncident.findOne({ returnRefundRequestId: requestId }).sort({ createdAt: -1 }), session).lean();
    },
    async findOpenPayoutIncident(requestId, session) {
      return withOptionalSession(RefundPayoutIncident.findOne({ returnRefundRequestId: requestId, status: 'Open' }).sort({ createdAt: -1 }), session).lean();
    },
    async findPayoutIncidentByKey(incidentKey, session) {
      return withOptionalSession(RefundPayoutIncident.findOne({ incidentKey }), session).lean();
    },
    async createPayoutIncident(data, session) {
      const [created] = await RefundPayoutIncident.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async resolvePayoutIncident(id, data, session) {
      return withOptionalSession(RefundPayoutIncident.findOneAndUpdate(
        { _id: id, status: 'Open' },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
  };
}

function createReturnRefundService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
  transactionManager = createModelTransactionManager(),
  eventPublisher = createReturnNotificationOutbox(),
  lowStockLifecycle = null,
  payosGateway = createPayOSGateway(),
  clock = () => new Date(),
  assignmentCoordinator = defaultAssignmentCoordinator,
} = {}) {
  async function loadRequest(id, session) {
    const request = await repository.findRequestById(id, session);
    if (!request) throw new ApiError(404, 'Return/refund request not found');
    const [order, details, items, destination, payoutEvidence, payoutIncident] = await Promise.all([
      repository.findOrderById(request.orderId, session),
      repository.listOrderDetails(request.orderId, session),
      repository.listReturnItems(request._id, session),
      repository.findLatestDestination ? repository.findLatestDestination(request._id, session) : null,
      repository.findLatestPayoutEvidence ? repository.findLatestPayoutEvidence(request._id, session) : null,
      repository.findLatestPayoutIncident ? repository.findLatestPayoutIncident(request._id, session) : null,
    ]);
    if (!order) throw new ApiError(404, 'Related order not found');
    return { request, order, details, items, destination, payoutEvidence, payoutIncident };
  }

  async function respond(id, audience, replay = false) {
    const response = toResponse(await loadRequest(id), audience);
    return replay ? { ...response, replay: true } : response;
  }

  async function writeAudit(userId, action, targetId, description, session) {
    await auditLogger.log({
      userId,
      action,
      targetEntity: 'ReturnRefundRequest',
      targetId: String(targetId),
      description,
    }, session);
  }

  async function resolveConflict(orderId, customerId, session) {
    return resolveActiveAfterSalesConflict({
      repository,
      orderId,
      customerId,
      session,
    });
  }

  async function notifyCustomer(request, type, eventIdentity = '', session) {
    const businessEventId = `${type}:${String(request._id)}${eventIdentity ? `:${String(eventIdentity)}` : ''}`;
    const event = {
      businessEventId,
      recipientId: request.customerId,
      type,
      displayValues: { requestCode: request.requestCode || String(request._id) },
      targetCollection: 'ReturnRefundRequest',
      targetId: request._id,
      occurredAt: new Date(clock()),
    };
    if (eventPublisher?.publishDomainEvent) {
      await eventPublisher.publishDomainEvent(event, session);
    } else if (eventPublisher?.createInAppNotification) {
      await eventPublisher.createInAppNotification({
        userId: event.recipientId,
        ...event,
        eventId: businessEventId,
      }, session);
    } else {
      throw new Error('Return/refund Notification outbox publisher is required');
    }
  }

  async function createRefundHandoff(order, request, session) {
    const attempt = await repository.findLatestPaymentAttemptByOrder(order._id, session);
    if (!attempt) throw new ApiError(409, 'A payment attempt is required before a refund can be handed off');
    const amount = normalizeRefundAmount(order.totalAmount, 'stored order total');
    return repository.upsertRefundPending({
      orderId: order._id,
      paymentAttemptId: attempt._id,
      customerId: order.customerId,
      returnRefundRequestId: request._id,
      amount,
      currency: order.currency || attempt.currency || 'VND',
      reason: `Warehouse received all goods for ${request.requestCode || order.orderCode}`,
      status: 'RefundPending',
      payoutStatus: 'NotStarted',
      obligationType: 'NORMAL_RETURN',
      obligationKey: `NORMAL_RETURN:${String(request._id)}`,
    }, session);
  }

  async function findRequestRefundObligation(request, session) {
    if (request.obligationKey && repository.findRefundPending) {
      const obligation = await repository.findRefundPending(request.obligationKey, session);
      if (obligation) return obligation;
    }
    const normalReturn = await repository.findRefundPending(`NORMAL_RETURN:${String(request._id)}`, session);
    if (normalReturn) return normalReturn;
    if (repository.findRefundPendingByRequestId) {
      return repository.findRefundPendingByRequestId(request._id, session);
    }
    return null;
  }

  async function finalizeSuccessfulPayout(staffId, loaded, refund, evidence, note, session) {
    const completedAt = new Date(clock());
    const isCancellationRefund = loaded.request.status === 'ReadyForRefund'
      && loaded.order.orderStatus === 'Cancelled';
    const isFailedDeliveryRefund = refund.obligationType === 'FAILED_DELIVERY';
    const preservesOrderLifecycle = isCancellationRefund || isFailedDeliveryRefund;
    const updatedRefund = await repository.updateRefundPending(refund._id, {
      status: 'Refunded',
      payoutStatus: 'Succeeded',
      destinationId: loaded.request.verifiedDestinationId,
      payoutEvidenceId: evidence._id,
      refundedAt: completedAt,
    }, session);
    if (!updatedRefund) throw new ApiError(409, 'Refund obligation changed while payout was being recorded');

    const completed = repository.claimCompletion
      ? await repository.claimCompletion(loaded.request._id, {
        status: 'Completed',
        refundPendingId: refund._id,
        completionEvidenceId: evidence._id,
        completedBy: staffId,
        completedAt,
        handledAt: completedAt,
        completionNote: note,
      }, session)
      : await repository.updateRequest(loaded.request._id, {
        status: 'Completed', completionEvidenceId: evidence._id, completedBy: staffId, completedAt,
      }, session);
    if (!completed) throw new ApiError(409, 'Return/refund request changed while payout was being completed');

    const obligations = repository.listRefundPendingByOrder
      ? await repository.listRefundPendingByOrder(loaded.order._id, session)
      : null;
    const moneyObligationsSettled = obligations
      ? computeMoneyObligationsSettled(obligations)
      : true;
    const updatedOrder = await repository.updateOrder(
      loaded.order._id,
      {
        ...(preservesOrderLifecycle ? {} : { orderStatus: 'Returned' }),
        moneyObligationsSettled,
      },
      session
    );
    if (!updatedOrder) throw new ApiError(409, 'Order changed while payout was being completed');
    if (!preservesOrderLifecycle && repository.releaseOrderLock) {
      const closedLock = await repository.releaseOrderLock(
        loaded.order._id,
        loaded.request._id,
        'Completed',
        true,
        session
      );
      if (!closedLock) throw new ApiError(409, 'After-sales lock changed while Return was being completed');
    }
    return { completed, updatedOrder, updatedRefund };
  }

  async function openPayoutIncident(staffId, loaded, evidence, refund, input = {}) {
    const incidentKey = normalizeIdempotencyKey(input.idempotencyKey, 'incident idempotencyKey');
    const existing = repository.findPayoutIncidentByKey
      ? await repository.findPayoutIncidentByKey(incidentKey)
      : null;
    if (existing) {
      if (String(existing.returnRefundRequestId) !== String(loaded.request._id)) {
        throw new ApiError(409, 'Payout incident idempotency key was used for another request');
      }
      return { ...toPayoutIncidentResponse(existing), replay: true };
    }

    const cause = String(input.cause || '').trim();
    if (!['CUSTOMER_CONFIRMED_DESTINATION', 'STAFF_SYSTEM_PROVIDER_MISMATCH'].includes(cause)) {
      throw new ApiError(400, 'Invalid payout incident cause');
    }
    const reportReason = String(input.reason || '').trim();
    if (!reportReason || reportReason.length > 1000) throw new ApiError(400, 'A payout incident reason is required');
    const responsibility = cause === 'CUSTOMER_CONFIRMED_DESTINATION' ? 'Customer' : 'ShopOrProvider';
    const openedAt = new Date(clock());
    let incident;
    try {
      incident = await transactionManager.withTransaction(async (session) => {
        const created = await repository.createPayoutIncident({
          returnRefundRequestId: loaded.request._id,
          refundPendingId: refund._id,
          payoutEvidenceId: evidence._id,
          destinationId: evidence.destinationId,
          incidentKey,
          cause,
          responsibility,
          status: 'Open',
          reportReason,
          reportedBy: staffId,
          openedAt,
        }, session);

        if (responsibility === 'ShopOrProvider' && loaded.request.status === 'Completed') {
          if (repository.reopenOrderLock) {
            const reopenedLock = await repository.reopenOrderLock(
              loaded.order._id,
              loaded.request._id,
              session
            );
            if (!reopenedLock) {
              throw new ApiError(409, 'After-sales lock changed while payout recovery was being opened');
            }
          }
          await repository.updateRequest(loaded.request._id, {
            status: 'Received',
            completionVoidedAt: openedAt,
            completionVoidReason: reportReason,
            handledAt: openedAt,
          }, session);
          await repository.updateRefundPending(refund._id, {
            status: 'HandedOff',
            payoutStatus: 'Unknown',
          }, session);
          await repository.updateOrder(loaded.order._id, { orderStatus: 'Delivered' }, session);
        }
        await writeAudit(
          staffId,
          'REFUND_PAYOUT_INCIDENT_OPENED',
          loaded.request._id,
          `Opened ${cause} payout recovery with ${responsibility} responsibility; destination values redacted`,
          session
        );
        await notifyCustomer(
          loaded.request,
          'REFUND_PAYOUT_INCIDENT_OPENED',
          created._id,
          session
        );
        return created;
      });
    } catch (error) {
      if (error?.code === 11000 && repository.findPayoutIncidentByKey) {
        const replay = await repository.findPayoutIncidentByKey(incidentKey);
        if (replay && String(replay.returnRefundRequestId) === String(loaded.request._id)) {
          return { ...toPayoutIncidentResponse(replay), replay: true };
        }
      }
      throw error;
    }

    return toPayoutIncidentResponse(incident);
  }

  async function persistPayoutEvidence(
    staffId,
    id,
    input = {},
    { trustedPayOS = false, allowPriorUnresolved = false } = {}
  ) {
    const loaded = await loadRequest(id);
    const { request, order, payoutIncident } = loaded;
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const method = String(input.method || '').toUpperCase();
    const expectedAmount = normalizeRefundAmount(order.totalAmount, 'stored order total');
    if (method === 'PAYOS' && !trustedPayOS) {
      throw new ApiError(400, 'The evidence endpoint accepts manual transfer evidence only; payOS outcomes must come from the provider workflow');
    }
    if (!['PAYOS', 'MANUAL'].includes(method)) throw new ApiError(400, 'Payout method must be PAYOS or MANUAL');

    const existing = await repository.findPayoutEvidenceByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (String(existing.returnRefundRequestId) !== String(request._id)) throw new ApiError(409, 'Payout idempotency key was used for another request');
      const replayMatches = String(existing.method) === method
        && String(existing.providerReference) === String(input.providerReference || '').trim()
        && String(existing.status) === String(input.status || '').trim()
        && Number(existing.amount) === expectedAmount;
      if (!replayMatches) throw new ApiError(409, 'Payout idempotency key was reused with different evidence');
      return { ...toPayoutResponse(existing, 'Staff'), replay: true };
    }
    if (request.status === 'Completed') throw new ApiError(409, 'Refund was already completed; use the original payout evidence');
    if (!RECEIVED_STATUSES.includes(request.status)) throw new ApiError(409, 'Request must be received or ready for refund before payout');
    if (!request.verifiedDestinationId) throw new ApiError(409, 'A verified refund destination is required before payout');
    if (payoutIncident?.status === 'Open') {
      if (payoutIncident.responsibility === 'Customer') {
        throw new ApiError(409, 'Customer-responsibility recovery is open; no automatic second payout is allowed');
      }
      if (String(input.recoveryIncidentId || '') !== String(payoutIncident._id)) {
        throw new ApiError(409, 'The open payout recovery incident must be explicitly reconciled before corrective payout');
      }
    }

    const destination = await repository.findDestinationById(request.verifiedDestinationId);
    if (!destination || destination.status !== 'Verified' || String(destination.returnRefundRequestId) !== String(request._id)) {
      throw new ApiError(409, 'The verified refund destination is no longer valid');
    }
    const status = String(input.status || '').trim();
    if (!['Processing', 'Succeeded', 'Failed', 'Unknown'].includes(status)) throw new ApiError(400, 'Invalid payout evidence status');
    const providerReference = String(input.providerReference || '').trim();
    if (!providerReference || providerReference.length > 256) throw new ApiError(400, 'A valid payout provider/reference is required');
    const occurredAt = normalizeDate(input.occurredAt, 'occurredAt', clock);
    if (occurredAt.getTime() > new Date(clock()).getTime() + FUTURE_TOLERANCE_MS) throw new ApiError(400, 'occurredAt cannot be in the future');
    const reconciliationNote = String(input.reconciliationNote || '').trim();
    if (method === 'MANUAL' && !reconciliationNote) throw new ApiError(400, 'Manual payout evidence requires a reconciliation note');
    const refund = await findRequestRefundObligation(request);
    if (!refund || String(refund.returnRefundRequestId || request._id) !== String(request._id)) throw new ApiError(409, 'Normal return refund obligation not found');
    if (refund.status === 'Refunded') throw new ApiError(409, 'Refund payout was already completed');
    const authorizedCorrectivePayout = payoutIncident?.status === 'Open'
      && payoutIncident.responsibility === 'ShopOrProvider'
      && String(input.recoveryIncidentId || '') === String(payoutIncident._id);
    if (['Processing', 'Unknown'].includes(refund.payoutStatus) && !allowPriorUnresolved && !authorizedCorrectivePayout) {
      throw new ApiError(409, 'The previous payout attempt must be reconciled before another attempt');
    }

    const snapshotHash = hash([
      destination._id, destination.version, destination.bankName, destination.bankBin || '',
      destination.accountNumberLast4, destination.accountHolderMasked,
    ].join('|'));
    let evidence;
    try {
      evidence = await transactionManager.withTransaction(async (session) => {
        const created = await repository.createPayoutEvidence({
          returnRefundRequestId: request._id,
          refundPendingId: refund._id,
          destinationId: destination._id,
          amount: expectedAmount,
          currency: order.currency || 'VND',
          idempotencyKey,
          method,
          providerReference,
          status,
          recordedBy: staffId,
          occurredAt,
          reconciliationNote,
          failureReason: String(input.failureReason || '').trim(),
          destinationSnapshotHash: snapshotHash,
        }, session);
        if (status === 'Succeeded') {
          await finalizeSuccessfulPayout(staffId, loaded, refund, created, reconciliationNote || 'Verified payout evidence', session);
          if (payoutIncident?.status === 'Open' && payoutIncident.responsibility === 'ShopOrProvider') {
            const resolved = await repository.resolvePayoutIncident(payoutIncident._id, {
              status: 'Resolved',
              resolvedBy: staffId,
              resolvedAt: new Date(clock()),
              resolutionNote: reconciliationNote || 'Corrective payout evidence verified',
              resolutionEvidenceId: created._id,
            }, session);
            if (!resolved) throw new ApiError(409, 'Payout recovery incident changed during corrective payout');
          }
        } else {
          await repository.updateRefundPending(refund._id, {
            status: ['Processing', 'Unknown'].includes(status) ? 'HandedOff' : 'RefundPending',
            payoutStatus: status,
            destinationId: destination._id,
            payoutOperationKey: input.operationKey || refund.payoutOperationKey || idempotencyKey,
            payoutProviderReference: providerReference,
          }, session);
        }
        await writeAudit(
          staffId,
          'REFUND_PAYOUT_EVIDENCE_RECORDED',
          id,
          `${trustedPayOS ? 'System reconciled payOS' : 'Staff recorded manual'} payout evidence with ${status} outcome; destination values redacted`,
          session
        );
        if (status === 'Succeeded') {
          await notifyCustomer(request, 'RETURN_REFUND_COMPLETED', created._id, session);
        }
        return created;
      });
    } catch (error) {
      if (error?.code === 11000) {
        const replay = await repository.findPayoutEvidenceByIdempotencyKey(idempotencyKey);
        if (replay && String(replay.returnRefundRequestId) === String(request._id)) return { ...toPayoutResponse(replay, 'Staff'), replay: true };
      }
      throw error;
    }

    return { ...toPayoutResponse(evidence, 'Staff'), request: await respond(id, 'Staff') };
  }

  const service = {
    async createCustomerRequest(customerId, input = {}) {
      if (!input.orderId) throw new ApiError(400, 'Order is required');
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Return/refund reason is required');
      const submittedEvidence = Array.isArray(input.evidenceImages) ? input.evidenceImages : [];
      if (!submittedEvidence.length) throw new ApiError(400, 'At least one return/refund evidence attachment is required');

      let order = await repository.findOrderById(input.orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      if (order.orderStatus !== 'Delivered') throw new ApiError(409, 'Only Delivered orders can be returned');
      if (!order.deliveredAt && !order.returnDeadlineAt) throw new ApiError(409, 'DeliveredAt is required to determine the five-day return window');

      const deadlineAt = order.returnDeadlineAt
        ? new Date(order.returnDeadlineAt)
        : new Date(new Date(order.deliveredAt).getTime() + RETURN_WINDOW_MS);
      if (Number.isNaN(deadlineAt.getTime())) throw new ApiError(409, 'The stored return deadline is invalid');
      if (new Date(clock()).getTime() > deadlineAt.getTime()) throw new ApiError(409, 'The five-day return window has expired');
      if (!order.returnDeadlineAt && repository.ensureReturnDeadline) {
        order = await repository.ensureReturnDeadline(order._id, deadlineAt);
      }

      const preexistingConflict = await resolveConflict(order._id, customerId);
      if (preexistingConflict.hasActiveLock) {
        throw createActiveAfterSalesConflict(preexistingConflict.data);
      }
      const existing = await repository.findOpenRequestByOrderId(order._id);
      if (existing) {
        const currentConflict = await resolveConflict(order._id, customerId);
        if (currentConflict.hasActiveLock) {
          throw createActiveAfterSalesConflict(currentConflict.data);
        }
        throw new ApiError(409, 'This order already has an open return/refund request');
      }
      const evidenceImages = normalizeCustomerEvidence(customerId, submittedEvidence);
      const payment = await repository.findPaymentByOrderId(order._id);
      const codHold = order.paymentMethod === 'COD' && order.paymentStatus !== 'Paid';
      if (codHold && order.codDiscrepancyStatus !== 'Open') {
        throw new ApiError(409, 'Unpaid COD return requires an open COD discrepancy');
      }
      if (!codHold && order.paymentStatus !== 'Paid') throw new ApiError(409, 'Only paid orders can enter the normal return/refund flow');

      let request;
      try {
        request = await transactionManager.withTransaction(async (session) => {
          const created = await repository.createRequest({
            orderId: order._id,
            requestCode: generateRequestCode(),
            customerId,
            paymentId: payment?._id || null,
            reason,
            evidenceImages,
            status: codHold ? 'AwaitingCODReconciliation' : 'New',
            refundAmount: 0,
            holdReason: codHold ? 'Đã ghi nhận đúng hạn; đang chờ đối soát bằng chứng thu COD từ khách hàng.' : '',
            deadlineAt,
            requestedAt: new Date(clock()),
          }, session);
          if (repository.claimOrderLock) {
            const lock = await repository.claimOrderLock({
              orderId: order._id,
              caseType: 'RETURN_REFUND',
              caseId: created._id,
            }, session);
            if (!lock) {
              throw createActiveAfterSalesConflict(null);
            }
          }
          await writeAudit(
            customerId,
            'RETURN_REFUND_CREATE',
            created._id,
            `Customer created a return/refund request for ${order.orderCode}`,
            session
          );
          return created;
        });
      } catch (error) {
        if (error?.errorCode === ACTIVE_AFTER_SALES_ERROR_CODE) {
          const winner = await resolveConflict(order._id, customerId);
          throw createActiveAfterSalesConflict(winner.data);
        }
        if (error?.code === 11000) {
          const winner = await resolveConflict(order._id, customerId);
          if (winner.hasActiveLock) throw createActiveAfterSalesConflict(winner.data);
          throw new ApiError(409, 'Duplicate return/refund request conflict');
        }
        throw error;
      }

      return respond(request._id, 'Customer');
    },

    async listMyRequests(customerId) {
      const requests = await repository.listRequests({ customerId });
      const items = [];
      for (const request of requests) items.push(await respond(request._id, 'Customer'));
      return { items, total: items.length };
    },

    async listStaffRequests(query = {}) {
      const requests = await repository.listRequests(query);
      const items = [];
      for (const request of requests) items.push(await respond(request._id, 'StaffList'));
      return { items, total: items.length };
    },

    async listWarehouseRequests(query = {}) {
      const requests = await repository.listRequests(query);
      const items = [];
      for (const request of requests) items.push(await respond(request._id, 'Warehouse'));
      return { items, total: items.length };
    },

    async getStaffRequest(id) {
      return respond(id, 'Staff');
    },

    async getWarehouseRequest(id) {
      return respond(id, 'Warehouse');
    },

    async decideRequest(staffId, id, input = {}) {
      const loaded = await loadRequest(id);
      const { request, order } = loaded;
      if (request.status === 'Approved' && input.status === 'Approved') return respond(id, 'Staff', true);
      if (request.status === 'Rejected' && input.status === 'Rejected') return respond(id, 'Staff', true);
      if (!DECIDABLE_STATUSES.includes(request.status)) throw new ApiError(409, 'Only New return/refund requests can be decided');
      if (!['Approved', 'Rejected'].includes(input.status)) throw new ApiError(400, 'Invalid return/refund decision');
      const staffNote = String(input.staffNote || '').trim();
      if (!staffNote) throw new ApiError(400, 'Staff note is required');
      if (Object.prototype.hasOwnProperty.call(input, 'refundAmount')) {
        throw new ApiError(400, 'Refund amount is server-derived and cannot be supplied by Staff');
      }

      const approved = input.status === 'Approved';
      if (approved && request.status === 'AwaitingCODReconciliation' && order.paymentStatus !== 'Paid') {
        throw new ApiError(409, 'COD reconciliation must verify full Customer collection before normal return approval');
      }
      const refundAmount = approved ? normalizeRefundAmount(order.totalAmount, 'stored order total') : 0;
      const decidedAt = new Date(clock());
      const decisionData = {
        status: approved ? 'Approved' : 'Rejected',
        refundAmount,
        resolvedBy: staffId,
        resolvedAt: decidedAt,
        handledAt: decidedAt,
        staffNote,
        ...(approved ? { approvedAt: decidedAt, shipByAt: new Date(decidedAt.getTime() + SHIP_WINDOW_MS) } : {}),
      };
      const updated = await transactionManager.withTransaction(async (session) => {
        if (approved) {
          await assignmentCoordinator.coordinate({
            userId: staffId,
            expectedRole: 'Staff',
            session,
          });
        }
        const claimed = repository.claimDecision
          ? await repository.claimDecision(id, DECIDABLE_STATUSES, decisionData, session)
          : await repository.updateRequest(id, decisionData, session);
        if (!claimed) throw new ApiError(409, 'Return/refund request changed while Staff was deciding it');
        if (!approved && repository.releaseOrderLock) {
          const released = await repository.releaseOrderLock(order._id, request._id, 'Rejected', false, session);
          if (!released) throw new ApiError(409, 'After-sales lock changed while Return was being rejected');
        }
        await writeAudit(
          staffId,
          approved ? 'RETURN_REFUND_APPROVED' : 'RETURN_REFUND_REJECTED',
          id,
          `Staff ${approved ? 'approved' : 'rejected'} return/refund for ${order.orderCode}`,
          session
        );
        await notifyCustomer(
          request,
          approved ? 'RETURN_REFUND_APPROVED' : 'RETURN_REFUND_REJECTED',
          '',
          session
        );
        return claimed;
      });

      return respond(id, 'Staff');
    },

    async recordHandoffProof(customerId, id, input = {}) {
      const loaded = await loadRequest(id);
      const { request } = loaded;
      if (String(request.customerId) !== String(customerId)) throw new ApiError(404, 'Return/refund request not found');
      const proofReference = String(input.proofReference || '').trim();
      if (!proofReference || proofReference.length > 256) throw new ApiError(400, 'A valid handoff proof reference is required');
      const handoffAt = normalizeDate(input.handoffAt, 'handoffAt', clock);
      if (handoffAt.getTime() > new Date(clock()).getTime() + FUTURE_TOLERANCE_MS) throw new ApiError(400, 'handoffAt cannot be in the future');

      if (request.handoffAt) {
        if (request.handoffProofReference === proofReference && new Date(request.handoffAt).getTime() === handoffAt.getTime()) {
          return respond(id, 'Customer', true);
        }
        throw new ApiError(409, 'Handoff proof was already recorded and cannot be replaced');
      }
      if (!HANDOFF_RECORDABLE_STATUSES.includes(request.status)) throw new ApiError(409, 'Only an Approved or reconcilable Expired request can record handoff proof');
      if (!request.shipByAt) throw new ApiError(409, 'ShipByAt is missing from the approved request');
      if (request.approvedAt && handoffAt.getTime() < new Date(request.approvedAt).getTime()) {
        throw new ApiError(400, 'handoffAt cannot be earlier than approval');
      }
      if (handoffAt.getTime() > new Date(request.shipByAt).getTime()) {
        throw new ApiError(409, 'The three-day return handoff deadline has expired');
      }

      const updated = await transactionManager.withTransaction(async (session) => {
        const claimed = repository.claimHandoff
          ? await repository.claimHandoff(id, customerId, {
            status: 'Approved', handoffProofReference: proofReference, handoffAt, handoffRecordedBy: customerId,
            expiredAt: null, expiryReason: '',
          }, session)
          : await repository.updateRequest(
            id,
            {
              status: 'Approved', handoffProofReference: proofReference, handoffAt,
              handoffRecordedBy: customerId, expiredAt: null, expiryReason: '',
            },
            session
          );
        if (!claimed) {
          throw new ApiError(409, 'Return/refund request changed while handoff proof was being recorded');
        }
        await writeAudit(
          customerId,
          'RETURN_HANDOFF_RECORDED',
          id,
          'Customer recorded timely return handoff proof',
          session
        );
        return claimed;
      });
      return respond(id, 'Customer');
    },

    async expireRequest(staffId, id) {
      const loaded = await loadRequest(id);
      const { request } = loaded;
      if (request.status === 'Expired') return respond(id, 'Staff', true);
      if (!RECEIVABLE_STATUSES.includes(request.status)) throw new ApiError(409, 'Only an Approved request can expire');
      if (request.handoffAt) throw new ApiError(409, 'A request with timely handoff proof cannot expire');
      const now = new Date(clock());
      if (!request.shipByAt || now.getTime() <= new Date(request.shipByAt).getTime()) throw new ApiError(409, 'The handoff deadline has not expired');
      const updated = await transactionManager.withTransaction(async (session) => {
        const claimed = repository.claimExpiry
          ? await repository.claimExpiry(id, now, { status: 'Expired', expiredAt: now, expiryReason: 'No timely handoff proof', handledAt: now }, session)
          : await repository.updateRequest(id, { status: 'Expired', expiredAt: now, expiryReason: 'No timely handoff proof', handledAt: now }, session);
        if (!claimed) throw new ApiError(409, 'Return/refund request changed while expiry was being recorded');
        if (repository.releaseOrderLock) {
          const released = await repository.releaseOrderLock(request.orderId, request._id, 'Expired', false, session);
          if (!released) throw new ApiError(409, 'After-sales lock changed while Return was expiring');
        }
        await writeAudit(
          staffId,
          'RETURN_REFUND_EXPIRED',
          id,
          'Approved request expired without timely handoff proof',
          session
        );
        await notifyCustomer(request, 'RETURN_REFUND_EXPIRED', '', session);
        return claimed;
      });
      return respond(id, 'Staff');
    },

    async expireOverdueRequests() {
      if (!repository.listOverdueRequests) return { expired: 0 };
      const now = new Date(clock());
      const candidates = await repository.listOverdueRequests(now, 100);
      let expired = 0;
      for (const candidate of candidates) {
        try {
          await service.expireRequest(null, candidate._id);
          expired += 1;
        } catch (error) {
          if (error?.statusCode !== 409) throw error;
        }
      }
      return { expired };
    },

    async submitDestination(customerId, id, input = {}) {
      const loaded = await loadRequest(id);
      const { request } = loaded;
      if (String(request.customerId) !== String(customerId)) throw new ApiError(404, 'Return/refund request not found');
      if (![...RECEIVABLE_STATUSES, ...RECEIVED_STATUSES].includes(request.status)) {
        throw new ApiError(409, 'Refund destination can only be submitted after approval and before completion');
      }
      if (input.confirmed !== true && input.confirmDetails !== true) {
        throw new ApiError(400, 'Customer must confirm the refund destination details');
      }
      const bankName = String(input.bankName || '').trim();
      const bankBin = String(input.bankBin || '').trim();
      const accountNumber = String(input.accountNumber || '').replace(/\s+/g, '');
      const accountHolderName = String(input.accountHolderName || '').trim().replace(/\s+/g, ' ').toUpperCase();
      if (!bankName || bankName.length > 120) throw new ApiError(400, 'A valid bank name is required');
      if (bankBin && !/^[0-9]{6}$/.test(bankBin)) throw new ApiError(400, 'bankBin must contain exactly 6 digits');
      if (!/^[0-9]{6,24}$/.test(accountNumber)) throw new ApiError(400, 'A valid bank account number is required');
      if (accountHolderName.length < 2 || accountHolderName.length > 120) throw new ApiError(400, 'A valid account holder name is required');
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const destinationFingerprint = fingerprint(`${bankName}|${bankBin}|${accountNumber}|${accountHolderName}`);

      const replay = repository.findDestinationByIdempotencyKey
        ? await repository.findDestinationByIdempotencyKey(request._id, idempotencyKey)
        : null;
      if (replay) {
        if (replay.destinationFingerprint && replay.destinationFingerprint !== destinationFingerprint) {
          throw new ApiError(409, 'Destination idempotency key was reused with different details');
        }
        return { ...toDestinationResponse(replay), replay: true };
      }
      const latest = repository.findLatestDestination ? await repository.findLatestDestination(request._id) : null;
      if (latest && latest.status !== 'Rejected') {
        throw new ApiError(409, 'The current refund destination must be rejected before a corrected version can be submitted');
      }

      let created;
      try {
        created = await transactionManager.withTransaction(async (session) => {
          const destination = await repository.createDestination({
            returnRefundRequestId: request._id,
            customerId,
            version: Number(latest?.version || 0) + 1,
            supersedesId: latest?._id || null,
            bankName,
            bankBin,
            accountNumberEncrypted: encrypt(accountNumber),
            accountHolderEncrypted: encrypt(accountHolderName),
            accountNumberLast4: accountNumber.slice(-4),
            accountHolderMasked: maskAccountHolder(accountHolderName),
            destinationFingerprint,
            confirmationNotice: CONFIRMATION_NOTICE,
            customerConfirmedAt: new Date(clock()),
            status: 'Submitted',
            idempotencyKey,
          }, session);
          await writeAudit(
            customerId,
            'REFUND_DESTINATION_SUBMITTED',
            id,
            `Customer submitted refund destination version ${destination.version}; sensitive values redacted`,
            session
          );
          return destination;
        });
      } catch (error) {
        if (error?.code === 11000 && repository.findDestinationByIdempotencyKey) {
          const existing = await repository.findDestinationByIdempotencyKey(request._id, idempotencyKey);
          if (existing) {
            if (existing.destinationFingerprint && existing.destinationFingerprint !== destinationFingerprint) {
              throw new ApiError(409, 'Destination idempotency key was reused with different details');
            }
            return { ...toDestinationResponse(existing), replay: true };
          }
        }
        throw error;
      }

      return toDestinationResponse(created);
    },

    async verifyDestination(staffId, id, input = {}) {
      const loaded = await loadRequest(id);
      const { request } = loaded;
      const forbiddenFields = ['bankName', 'bankBin', 'accountNumber', 'accountHolderName', 'accountNumberEncrypted', 'accountHolderEncrypted'];
      if (forbiddenFields.some((field) => Object.prototype.hasOwnProperty.call(input, field))) {
        await writeAudit(staffId, 'REFUND_DESTINATION_EDIT_DENIED', id, 'Blocked Staff attempt to edit Customer-confirmed refund destination values; sensitive values redacted');
        throw new ApiError(400, 'Staff can verify or reject destination details but cannot edit them');
      }
      if (![...RECEIVABLE_STATUSES, ...RECEIVED_STATUSES].includes(request.status)) {
        throw new ApiError(409, 'Refund destination can only be decided after approval and before completion');
      }
      const status = String(input.status || '').trim();
      if (!['Verified', 'Rejected'].includes(status)) throw new ApiError(400, 'Destination status must be Verified or Rejected');
      const destinationId = String(input.destinationId || request.verifiedDestinationId || '').trim();
      if (!destinationId) throw new ApiError(400, 'destinationId is required');
      const destination = await repository.findDestinationById(destinationId);
      if (!destination || String(destination.returnRefundRequestId) !== String(request._id)) throw new ApiError(404, 'Refund destination not found');
      if (destination.status === status) return { ...toDestinationResponse(destination), replay: true };
      if (destination.status !== 'Submitted') throw new ApiError(409, 'Only a Submitted destination can be decided');
      const rejectionReason = String(input.rejectionReason || '').trim();
      if (status === 'Rejected' && !rejectionReason) throw new ApiError(400, 'A rejection reason is required');
      const decidedAt = new Date(clock());

      const updated = await transactionManager.withTransaction(async (session) => {
        const decided = await repository.claimDestinationDecision(destinationId, request._id, {
          status,
          verifiedBy: staffId,
          verifiedAt: decidedAt,
          rejectionReason: status === 'Rejected' ? rejectionReason : '',
        }, session);
        if (!decided) throw new ApiError(409, 'Refund destination changed while Staff was deciding it');
        if (status === 'Verified') await repository.updateRequest(request._id, { verifiedDestinationId: decided._id }, session);
        await writeAudit(
          staffId,
          status === 'Verified' ? 'REFUND_DESTINATION_VERIFIED' : 'REFUND_DESTINATION_REJECTED',
          id,
          `Staff ${status.toLowerCase()} refund destination version ${decided.version}; sensitive values redacted`,
          session
        );
        await notifyCustomer(request, `REFUND_DESTINATION_${status.toUpperCase()}`, '', session);
        return decided;
      });
      return toDestinationResponse(updated);
    },

    async inspectRequest(warehouseId, id, input = {}) {
      const loaded = await loadRequest(id);
      const { request, order, details } = loaded;
      if (RECEIVED_STATUSES.includes(request.status) || request.status === 'Completed') {
        if (input.idempotencyKey && input.idempotencyKey === request.inspectionIdempotencyKey) return respond(id, 'Warehouse', true);
        throw new ApiError(409, 'Warehouse receipt already exists under a different idempotency identity');
      }
      if (!RECEIVABLE_STATUSES.includes(request.status)) throw new ApiError(409, 'Only Approved requests can be inspected');
      if (!details.length) throw new ApiError(409, 'Order details are missing');
      if (!Array.isArray(input.items)) throw new ApiError(400, 'A complete inspected item list is required');
      const preAccountedByDetail = new Map((request.preAccountedItems || []).map((item) => [
        String(item.orderDetailId),
        {
          sellableQuantity: Number(item.sellableQuantity || 0),
          damagedQuantity: Number(item.damagedQuantity || 0),
          movementKeys: item.movementKeys || [],
        },
      ]));
      const remainingDetails = details.filter((detail) => {
        const pre = preAccountedByDetail.get(String(detail._id)) || { sellableQuantity: 0, damagedQuantity: 0 };
        return Number(detail.quantity) - pre.sellableQuantity - pre.damagedQuantity > 0;
      });
      if (remainingDetails.length > 0 && (!request.handoffAt || !request.handoffProofReference)) {
        throw new ApiError(409, 'Timely Customer handoff proof is required before Warehouse receipt');
      }
      if (input.items.length !== remainingDetails.length) {
        throw new ApiError(
          400,
          preAccountedByDetail.size > 0
            ? 'Inspection must include every remaining Customer-held order line exactly once'
            : 'Inspection must include every purchased order line exactly once'
        );
      }

      const submittedByDetail = new Map(input.items.map((item) => [String(item.orderDetailId), item]));
      const seen = new Set();
      const inspectedAt = new Date(clock());
      const inspectionIdempotencyKey = input.idempotencyKey
        ? normalizeIdempotencyKey(input.idempotencyKey)
        : `inspection:${String(request._id)}`;
      const items = details.map((detail) => {
        const pre = preAccountedByDetail.get(String(detail._id)) || {
          sellableQuantity: 0,
          damagedQuantity: 0,
          movementKeys: [],
        };
        const purchasedQuantity = Number(detail.quantity);
        const preAccountedQuantity = pre.sellableQuantity + pre.damagedQuantity;
        const remainingQuantity = purchasedQuantity - preAccountedQuantity;
        if (!Number.isInteger(remainingQuantity) || remainingQuantity < 0) {
          throw new ApiError(409, 'Pre-accounted Exchange quantity exceeds purchased quantity');
        }
        if (remainingQuantity === 0) {
          return {
            returnRefundRequestId: request._id,
            orderDetailId: detail._id,
            productId: detail.productId,
            requestedQuantity: purchasedQuantity,
            receivedQuantity: purchasedQuantity,
            sellableQuantity: pre.sellableQuantity,
            damagedQuantity: pre.damagedQuantity,
            inventorySellableQuantity: 0,
            inventoryDamagedQuantity: 0,
            evidenceImages: [],
            warehouseNote: 'Referenced from linked Exchange; Inventory movement is not replayed',
            inspectedBy: warehouseId,
            inspectedAt,
            inventoryAppliedAt: inspectedAt,
            inventoryMovementKey: `PREACCOUNTED:${String(request._id)}:${String(detail._id)}`,
          };
        }
        const item = submittedByDetail.get(String(detail._id));
        if (!item) throw new ApiError(400, 'Return item does not belong to the remaining Customer-held Order lines');
        if (seen.has(String(detail._id))) throw new ApiError(400, 'Each order item can only be inspected once');
        seen.add(String(detail._id));
        const receivedQuantity = Number(item.receivedQuantity);
        const sellableQuantity = Number(item.sellableQuantity);
        const damagedQuantity = Number(item.damagedQuantity);
        if (![purchasedQuantity, receivedQuantity, sellableQuantity, damagedQuantity].every((quantity) => Number.isInteger(quantity) && quantity >= 0)) {
          throw new ApiError(400, 'Inspection quantities must be non-negative integers');
        }
        if (receivedQuantity !== remainingQuantity) {
          throw new ApiError(
            400,
            preAccountedQuantity > 0
              ? 'Received quantity must equal the remaining Customer-held quantity'
              : 'Received quantity must equal the complete purchased quantity'
          );
        }
        if (sellableQuantity + damagedQuantity !== receivedQuantity) throw new ApiError(400, 'Sellable and damaged quantities must equal received quantity');
        return {
          returnRefundRequestId: request._id,
          orderDetailId: detail._id,
          productId: detail.productId,
          requestedQuantity: purchasedQuantity,
          receivedQuantity: receivedQuantity + preAccountedQuantity,
          sellableQuantity: sellableQuantity + pre.sellableQuantity,
          damagedQuantity: damagedQuantity + pre.damagedQuantity,
          inventorySellableQuantity: sellableQuantity,
          inventoryDamagedQuantity: damagedQuantity,
          evidenceImages: normalizeEvidence(item.evidenceImages),
          warehouseNote: String(item.warehouseNote || input.warehouseNote || '').trim(),
          inspectedBy: warehouseId,
          inspectedAt,
          inventoryAppliedAt: inspectedAt,
          inventoryMovementKey: `${String(request._id)}:${String(detail._id)}`,
        };
      });
      if (seen.size !== remainingDetails.length) throw new ApiError(400, 'Inspection must include every remaining Customer-held order line exactly once');

      const result = await transactionManager.withTransaction(async (session) => {
        const claimData = {
            status: 'Received',
            receivedAt: inspectedAt,
            inspectionNote: String(input.warehouseNote || '').trim(),
            inspectionIdempotencyKey,
            handledAt: inspectedAt,
          };
        const claimed = remainingDetails.length === 0
          ? (repository.claimPreAccountedInspection
            ? await repository.claimPreAccountedInspection(id, claimData, session)
            : await repository.updateRequest(id, claimData, session))
          : (repository.claimInspection
            ? await repository.claimInspection(id, claimData, session)
            : await repository.updateRequest(id, claimData, session));
        if (!claimed) throw new ApiError(409, 'Only an Approved request with handoff proof can be inspected');

        const updatedInventories = [];
        for (const item of items) {
          if (item.inventorySellableQuantity === 0 && item.inventoryDamagedQuantity === 0) continue;
          const before = await repository.findInventoryByProductId(item.productId, session);
          if (!before) throw new ApiError(409, 'Every returned product requires an Inventory record');
          const beforeStock = Number(before.sellableQuantity ?? before.stockQuantity);
          const beforeDamaged = Number(before.damagedQuantity);
          if (![beforeStock, beforeDamaged].every((quantity) => Number.isInteger(quantity) && quantity >= 0)) {
            throw new ApiError(409, 'Stored inventory quantities are invalid');
          }
          const after = await repository.claimReturnInventory(
            item.productId,
            {
              stockQuantity: beforeStock,
              sellableQuantity: beforeStock,
              damagedQuantity: beforeDamaged,
            },
            { sellableQuantity: item.inventorySellableQuantity, damagedQuantity: item.inventoryDamagedQuantity },
            warehouseId,
            session
          );
          if (!after) throw new ApiError(409, 'Inventory changed while the return was being received');
          updatedInventories.push(after);

          await repository.createInventoryTransaction({
            productId: item.productId,
            orderId: order._id,
            relatedCollection: 'ReturnRefundRequest',
            relatedId: request._id,
            performedBy: warehouseId,
            transactionType: 'RETURN_IN',
            quantity: item.inventorySellableQuantity,
            beforeQuantity: beforeStock,
            afterQuantity: Number(after.sellableQuantity ?? after.stockQuantity),
            movementKey: `${item.inventoryMovementKey}:RETURN_IN`,
            reason: `Sellable return receipt for ${order.orderCode}`,
          }, session);
          await repository.createInventoryTransaction({
            productId: item.productId,
            orderId: order._id,
            relatedCollection: 'ReturnRefundRequest',
            relatedId: request._id,
            performedBy: warehouseId,
            transactionType: 'RETURN_DAMAGED_IN',
            quantity: item.inventoryDamagedQuantity,
            beforeQuantity: beforeDamaged,
            afterQuantity: Number(after.damagedQuantity),
            movementKey: `${item.inventoryMovementKey}:RETURN_DAMAGED_IN`,
            reason: `Damaged return receipt for ${order.orderCode}`,
          }, session);
        }

        const createdItems = await repository.createReturnItems(items, session);
        const refund = await createRefundHandoff(order, request, session);
        const updated = await repository.updateRequest(request._id, { refundPendingId: refund._id }, session);
        await writeAudit(
          warehouseId,
          'RETURN_REFUND_RECEIVED',
          id,
          `Warehouse received and classified every returned item for ${order.orderCode}`,
          session
        );
        await notifyCustomer(request, 'RETURN_REFUND_RECEIVED', '', session);
        return { createdItems, refund, updated, updatedInventories };
      });

      for (const inventory of result.updatedInventories) {
        await lowStockLifecycle?.evaluate?.(inventory, { eventKey: `return-receipt:${id}` });
      }
      return toResponse({ ...loaded, request: result.updated, items: result.createdItems }, 'Warehouse');
    },

    async recordPayoutEvidence(staffId, id, input = {}) {
      const method = String(input.method || 'MANUAL').toUpperCase();
      if (method !== 'PAYOS' && Object.prototype.hasOwnProperty.call(input, 'amount')) {
        throw new ApiError(400, 'Refund amount is server-derived and must not be supplied by Staff');
      }
      return persistPayoutEvidence(staffId, id, { ...input, method });
    },

    async reportPayoutIncident(staffId, id, input = {}) {
      const loaded = await loadRequest(id);
      const { request, order, payoutEvidence, payoutIncident } = loaded;
      if (payoutIncident?.status === 'Open') {
        if (payoutIncident.incidentKey === input.idempotencyKey) return { ...toPayoutIncidentResponse(payoutIncident), replay: true };
        throw new ApiError(409, 'A payout recovery incident is already open for this request');
      }
      const cause = String(input.cause || '').trim();
      const evidence = cause === 'CUSTOMER_CONFIRMED_DESTINATION'
        ? await repository.findSuccessfulPayoutEvidence(request._id)
        : payoutEvidence;
      if (!evidence || !['Succeeded', 'Unknown'].includes(evidence.status)) {
        throw new ApiError(409, 'A successful or mismatched payout evidence record is required before opening recovery');
      }
      const refund = await findRequestRefundObligation(request);
      if (!refund) throw new ApiError(409, 'Normal return refund obligation not found');
      const destination = await repository.findDestinationById(request.verifiedDestinationId);
      if (!destination) throw new ApiError(409, 'Verified refund destination not found');

      if (cause === 'CUSTOMER_CONFIRMED_DESTINATION') {
        const expectedSnapshotHash = hash([
          destination._id, destination.version, destination.bankName, destination.bankBin || '',
          destination.accountNumberLast4, destination.accountHolderMasked,
        ].join('|'));
        if (request.status !== 'Completed'
          || String(evidence.destinationId) !== String(destination._id)
          || evidence.destinationSnapshotHash !== expectedSnapshotHash) {
          throw new ApiError(409, 'Customer responsibility applies only when the exact confirmed destination snapshot was used');
        }
      }

      return openPayoutIncident(staffId, loaded, evidence, refund, {
        idempotencyKey: input.idempotencyKey,
        cause,
        reason: input.reason,
      });
    },

    async startPayOSPayout(staffId, id, input = {}) {
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const existing = await repository.findPayoutEvidenceByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (String(existing.returnRefundRequestId) !== String(id)) throw new ApiError(409, 'Payout idempotency key was used for another request');
        if (existing.method !== 'PAYOS') throw new ApiError(409, 'Payout idempotency key was reused for a different method');
        return { ...toPayoutResponse(existing, 'Staff'), replay: true };
      }

      const loaded = await loadRequest(id);
      const { request, order, payoutIncident } = loaded;
      if (request.status === 'Completed') throw new ApiError(409, 'Refund was already completed');
      if (!RECEIVED_STATUSES.includes(request.status)) throw new ApiError(409, 'Request must be received or ready for refund before payout');
      if (!request.verifiedDestinationId) throw new ApiError(409, 'A verified refund destination is required before payout');
      if (payoutIncident?.status === 'Open') {
        if (payoutIncident.responsibility === 'Customer') {
          throw new ApiError(409, 'Customer-responsibility recovery is open; no automatic second payout is allowed');
        }
        if (String(input.recoveryIncidentId || '') !== String(payoutIncident._id)) {
          throw new ApiError(409, 'The open payout recovery incident must be selected for corrective payout');
        }
      }
      const destination = await repository.findDestinationById(request.verifiedDestinationId);
      if (!destination || destination.status !== 'Verified' || String(destination.returnRefundRequestId) !== String(request._id)) {
        throw new ApiError(409, 'The verified refund destination is no longer valid');
      }
      if (!destination.bankBin || !/^[0-9]{6}$/.test(destination.bankBin)) {
        throw new ApiError(409, 'A verified 6-digit bank BIN is required for online payOS payout');
      }
      if (!destination.accountNumberEncrypted) throw new ApiError(409, 'The verified payout destination cannot be decrypted');
      if (!payosGateway?.isConfigured?.()) throw new ApiError(503, 'payOS payout is not configured for this server');
      const refund = await findRequestRefundObligation(request);
      if (!refund || String(refund.returnRefundRequestId || request._id) !== String(request._id)) throw new ApiError(409, 'Normal return refund obligation not found');
      if (refund.status === 'Refunded') throw new ApiError(409, 'Refund payout was already completed');
      const correctiveRecovery = payoutIncident?.status === 'Open'
        && payoutIncident.responsibility === 'ShopOrProvider'
        && String(input.recoveryIncidentId || '') === String(payoutIncident._id);
      if (['Processing', 'Unknown'].includes(refund.payoutStatus) && refund.payoutOperationKey !== idempotencyKey && !correctiveRecovery) {
        throw new ApiError(409, 'The previous payout attempt must be reconciled before another attempt');
      }
      const claimed = repository.claimPayoutStart
        ? await repository.claimPayoutStart(refund._id, idempotencyKey, refund.payoutOperationKey || '', correctiveRecovery)
        : await repository.updateRefundPending(refund._id, { status: 'HandedOff', payoutStatus: 'Processing', payoutOperationKey: idempotencyKey });
      if (!claimed) throw new ApiError(409, 'Another payout attempt already owns this refund obligation');

      const expectedAmount = normalizeRefundAmount(order.totalAmount, 'stored order total');
      const accountNumber = decrypt(destination.accountNumberEncrypted);
      const payout = await payosGateway.createPayout({
        referenceId: request.requestCode,
        amount: expectedAmount,
        description: `Hoan tien ${request.requestCode}`.slice(0, 100),
        toBin: destination.bankBin,
        toAccountNumber: accountNumber,
        idempotencyKey,
      });
      const outcome = classifyPayOSPayout(payout, {
        referenceId: request.requestCode,
        amount: expectedAmount,
        toBin: destination.bankBin,
        toAccountNumber: accountNumber,
      });
      const result = await persistPayoutEvidence(staffId, id, {
        idempotencyKey,
        operationKey: idempotencyKey,
        method: 'PAYOS',
        providerReference: outcome.providerReference,
        status: outcome.status,
        amount: expectedAmount,
        occurredAt: new Date(clock()),
        reconciliationNote: `payOS create response ${payout.approvalState || 'UNKNOWN'}`,
        failureReason: outcome.failureReason,
        recoveryIncidentId: input.recoveryIncidentId,
      }, { trustedPayOS: true, allowPriorUnresolved: true });
      if (outcome.status === 'Unknown' && outcome.failureReason.includes('immutable refund amount or destination snapshot')) {
        const evidence = await repository.findPayoutEvidenceByIdempotencyKey(idempotencyKey);
        await openPayoutIncident(staffId, loaded, evidence, refund, {
          idempotencyKey: `payos-mismatch:${outcome.providerEventKey}`,
          cause: 'STAFF_SYSTEM_PROVIDER_MISMATCH',
          reason: outcome.failureReason,
        });
        result.request = await respond(id, 'Staff');
      }
      return result;
    },

    async reconcilePayOSPayout(staffId, id) {
      const loaded = await loadRequest(id);
      const { request, order } = loaded;
      const latest = loaded.payoutEvidence;
      if (!latest || latest.method !== 'PAYOS') throw new ApiError(409, 'No payOS payout exists for this request');
      if (latest.status === 'Succeeded' && request.status === 'Completed') return { ...toPayoutResponse(latest, 'Staff'), request: await respond(id, 'Staff'), replay: true };
      const destination = await repository.findDestinationById(request.verifiedDestinationId);
      if (!destination || destination.status !== 'Verified' || !destination.bankBin || !destination.accountNumberEncrypted) {
        throw new ApiError(409, 'The verified payOS destination is unavailable');
      }
      if (!payosGateway?.isConfigured?.()) throw new ApiError(503, 'payOS payout is not configured for this server');
      const expectedAmount = normalizeRefundAmount(order.totalAmount, 'stored order total');
      const accountNumber = decrypt(destination.accountNumberEncrypted);
      const payout = await payosGateway.getPayout(latest.providerReference);
      const outcome = classifyPayOSPayout(payout, {
        referenceId: request.requestCode,
        amount: expectedAmount,
        toBin: destination.bankBin,
        toAccountNumber: accountNumber,
      });
      return persistPayoutEvidence(staffId, id, {
        idempotencyKey: `payos-reconcile:${outcome.providerEventKey}`,
        operationKey: latest.idempotencyKey,
        method: 'PAYOS',
        providerReference: outcome.providerReference,
        status: outcome.status,
        amount: expectedAmount,
        occurredAt: new Date(clock()),
        reconciliationNote: `payOS reconciliation ${payout.approvalState || 'UNKNOWN'}`,
        failureReason: outcome.failureReason,
        recoveryIncidentId: loaded.payoutIncident?.status === 'Open' ? loaded.payoutIncident._id : undefined,
      }, { trustedPayOS: true, allowPriorUnresolved: true });
    },

    async completeRefund(staffId, id, input = {}) {
      const loaded = await loadRequest(id);
      const { request, order } = loaded;
      const successfulEvidence = await repository.findSuccessfulPayoutEvidence(request._id);
      if (request.status === 'Completed') {
        if (!successfulEvidence || !request.completionEvidenceId) throw new ApiError(409, 'Completed request is missing verified payout evidence');
        return respond(id, 'Staff', true);
      }
      if (!RECEIVED_STATUSES.includes(request.status)) throw new ApiError(409, 'Only a Received request can be completed');
      if (!successfulEvidence) throw new ApiError(409, 'Verified successful payout evidence is required before completion');
      if (!request.verifiedDestinationId || String(successfulEvidence.destinationId) !== String(request.verifiedDestinationId)) {
        throw new ApiError(409, 'Payout evidence does not match the verified destination');
      }
      const expectedAmount = normalizeRefundAmount(order.totalAmount, 'stored order total');
      if (Number(successfulEvidence.amount) !== expectedAmount) throw new ApiError(409, 'Payout evidence amount does not match the server-derived order total');
      const refund = await findRequestRefundObligation(request);
      if (!refund) throw new ApiError(409, 'Normal return refund obligation not found');

      await transactionManager.withTransaction(async (session) => {
        await finalizeSuccessfulPayout(staffId, loaded, refund, successfulEvidence, String(input.note || '').trim() || 'Verified payout completion', session);
        await writeAudit(
          staffId,
          'RETURN_REFUND_COMPLETED',
          id,
          `Staff completed refund for ${order.orderCode} from verified payout evidence`,
          session
        );
      });
      return respond(id, 'Staff');
    },
  };

  return service;
}

module.exports = {
  createModelRepository,
  createReturnRefundService,
  computeMoneyObligationsSettled,
  returnRefundService: createReturnRefundService({ lowStockLifecycle: lowStockAlertLifecycle }),
};
