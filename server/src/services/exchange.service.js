const crypto = require('node:crypto');
const mongoose = require('mongoose');

const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const ExchangeCase = require('../models/exchangeCase.model');
const ExchangeLine = require('../models/exchangeLine.model');
const ExchangeUnitLineage = require('../models/exchangeUnitLineage.model');
const StockReservation = require('../models/stockReservation.model');
const ExchangeInspection = require('../models/exchangeInspection.model');
const ExchangeShipment = require('../models/exchangeShipment.model');
const ExchangeShipmentEvent = require('../models/exchangeShipmentEvent.model');
const ExchangeConversion = require('../models/exchangeConversion.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const { afterSalesLockService } = require('./afterSalesLock.service');
const {
  assignmentCoordinator: defaultAssignmentCoordinator,
} = require('./assignmentCoordination.service');
const {
  ACTIVE_AFTER_SALES_ERROR_CODE,
  resolveActiveAfterSalesConflict,
  createActiveAfterSalesConflict,
} = require('./afterSalesConflict.service');
const { returnEvidenceClaim, MAX_RETURN_EVIDENCE_TOTAL_SIZE } = require('../utils/returnEvidenceClaim');
const { logAudit } = require('../utils/auditLogger');
const { notificationService } = require('./notification.service');
const { lowStockAlertLifecycle } = require('./lowStockAlertLifecycle.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const EXCHANGE_WINDOW_MS = 5 * DAY_MS;
const SHIP_WINDOW_MS = 3 * DAY_MS;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const FORBIDDEN_FIELDS = new Set([
  'amount', 'refundAmount', 'bankAccount', 'refundDestination', 'payout',
  'payoutStatus', 'payos', 'payOS', 'priceDifference', 'shippingCharge',
  'replacementSku', 'replacementProductId',
]);
const TERMINAL_STATUSES = new Set([
  'ClosedByCODRecovery', 'Rejected', 'Cancelled', 'Expired',
  'ClosedNoExchange', 'ConvertedToReturnRefund', 'Completed',
]);

class NoExactStockError extends Error {
  constructor(productId) {
    super(`Exact same-SKU stock is unavailable for product ${productId}`);
    this.name = 'NoExactStockError';
    this.productId = productId;
  }
}

function duplicateIndexText(error) {
  return [
    ...Object.keys(error?.keyPattern || {}),
    String(error?.index || ''),
    String(error?.codeName || ''),
    String(error?.message || ''),
  ].join(' ');
}

function classifyExchangeDuplicateConflict(error) {
  const indexText = duplicateIndexText(error);
  if (/requestCode|exchange_request_code_unique/i.test(indexText)) {
    return new ApiError(409, 'Exchange request code collision; retry the command');
  }
  if (/exclusivePhysicalClaimKey|exchange_physical_claim_unique/i.test(indexText)) {
    return new ApiError(409, 'A selected physical unit is already owned by another Exchange');
  }
  if (/idempotencyKey|exchange_customer_idempotency_unique/i.test(indexText)) {
    return new ApiError(409, 'Exchange idempotency key is already owned by another command');
  }
  if (/exchangeCaseId|orderDetailId|exchange_line_case_order_detail_unique/i.test(indexText)) {
    return new ApiError(409, 'An Exchange line already exists for this command');
  }
  if (/unitKey|exchange_unit_key_unique/i.test(indexText)) {
    return new ApiError(409, 'An Exchange unit lineage already exists for this command');
  }
  return new ApiError(409, 'Duplicate command conflict');
}

function withSession(query, session) {
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

function createModelRepository({ lockService = afterSalesLockService } = {}) {
  return {
    async findOrderById(id, session) { return withSession(Order.findById(id), session).lean(); },
    async ensureExchangeDeadline(id, value, session) {
      const updated = await withSession(Order.findOneAndUpdate(
        { _id: id, exchangeDeadlineAt: null },
        { $set: { exchangeDeadlineAt: value } },
        { new: true, runValidators: true }
      ), session).lean();
      return updated || withSession(Order.findById(id), session).lean();
    },
    async listOrderDetails(orderId, session) {
      return withSession(OrderDetail.find({ orderId }).sort({ createdAt: 1 }), session).lean();
    },
    async findCaseById(id, session) { return withSession(ExchangeCase.findById(id), session).lean(); },
    async findReturnRequestById(id, session) {
      return withSession(ReturnRefundRequest.findById(id), session).lean();
    },
    async findCaseByIdempotency(customerId, idempotencyKey, session) {
      return withSession(ExchangeCase.findOne({ customerId, idempotencyKey }), session).lean();
    },
    async listCases(filter = {}) { return ExchangeCase.find(filter).sort({ createdAt: -1 }).lean(); },
    async listOverdueCases(now, limit = 100) {
      return ExchangeCase.find({
        status: 'ApprovedAwaitingShipment',
        handoffAt: null,
        shipByAt: { $lt: now },
      }).sort({ shipByAt: 1 }).limit(limit).lean();
    },
    async createCase(data, session) {
      const [created] = await ExchangeCase.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async updateCase(id, data, session) {
      return withSession(ExchangeCase.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean();
    },
    async claimCase(id, statuses, data, session) {
      return withSession(ExchangeCase.findOneAndUpdate(
        { _id: id, status: { $in: statuses } },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async touchShipmentOutcome(id, statuses, session) {
      return withSession(ExchangeCase.findOneAndUpdate(
        { _id: id, status: { $in: statuses } },
        { $inc: { shipmentOutcomeVersion: 1 } },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async createLines(items, session) {
      const created = await ExchangeLine.insertMany(items, session ? { session } : undefined);
      return created.map((item) => item.toObject());
    },
    async listLines(caseId, session) {
      return withSession(ExchangeLine.find({ exchangeCaseId: caseId }).sort({ createdAt: 1 }), session).lean();
    },
    async updateLine(id, data, session) {
      return withSession(ExchangeLine.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean();
    },
    async createUnits(items, session) {
      const created = await ExchangeUnitLineage.insertMany(items, session ? { session } : undefined);
      return created.map((item) => item.toObject());
    },
    async listUnits(caseId, session) {
      return withSession(ExchangeUnitLineage.find({ exchangeCaseId: caseId }).sort({ createdAt: 1 }), session).lean();
    },
    async findUnitsByIds(ids, session) {
      return withSession(ExchangeUnitLineage.find({ _id: { $in: ids } }).sort({ createdAt: 1 }), session).lean();
    },
    async listClaimedOriginalUnitOrdinals(orderId, orderDetailId, session) {
      const units = await withSession(ExchangeUnitLineage.find({
        orderId,
        orderDetailId,
        parentUnitId: null,
        exclusivePhysicalClaimKey: { $exists: true, $ne: '' },
      }).select('originalUnitOrdinal'), session).lean();
      return units.map((item) => Number(item.originalUnitOrdinal));
    },
    async listClaimedReplacementParentIds(orderId, session) {
      const units = await withSession(ExchangeUnitLineage.find({
        orderId,
        parentUnitId: { $ne: null },
        exclusivePhysicalClaimKey: { $exists: true, $ne: '' },
      }).select('parentUnitId'), session).lean();
      return units.map((item) => String(item.parentUnitId));
    },
    async releaseUnitClaims(caseId, session) {
      const result = await withSession(ExchangeUnitLineage.updateMany(
        { exchangeCaseId: caseId },
        { $unset: { exclusivePhysicalClaimKey: 1 } }
      ), session);
      return result.modifiedCount;
    },
    async updateUnitsForInspection(caseId, lineId, {
      sellableQuantity,
      damagedQuantity,
      sellableMovementKey,
      damagedMovementKey,
    }, session) {
      const units = await withSession(ExchangeUnitLineage.find({
        exchangeCaseId: caseId, exchangeLineId: lineId,
      }).sort({ originalUnitOrdinal: 1 }), session).lean();
      for (let index = 0; index < units.length; index += 1) {
        const isSellable = index < sellableQuantity;
        const isDamaged = index >= sellableQuantity && index < sellableQuantity + damagedQuantity;
        await withSession(ExchangeUnitLineage.findByIdAndUpdate(
          units[index]._id,
          {
            $set: {
              outcome: isSellable || isDamaged ? 'Accepted' : 'Rejected',
              inventoryMovementKeys: isSellable ? [sellableMovementKey] : isDamaged ? [damagedMovementKey] : [],
            },
          },
          { new: true, runValidators: true }
        ), session);
      }
    },
    async updateDeliveredUnits(caseId, lineId, quantity, deliveredAt, deadlineAt, session) {
      const units = await withSession(ExchangeUnitLineage.find({
        exchangeCaseId: caseId,
        exchangeLineId: lineId,
        outcome: { $in: ['Accepted', 'ReplacementShipped'] },
      }).sort({ originalUnitOrdinal: 1 }).limit(quantity), session).lean();
      const updated = [];
      for (const unit of units) {
        updated.push(await withSession(ExchangeUnitLineage.findByIdAndUpdate(
          unit._id,
          { $set: { outcome: 'ReplacementDelivered', replacementDeliveredAt: deliveredAt, exchangeDeadlineAt: deadlineAt } },
          { new: true, runValidators: true }
        ), session).lean());
      }
      return updated;
    },
    async findInventory(productId, session) {
      return withSession(Inventory.findOne({ productId }), session).lean();
    },
    async reserveInventory(productId, quantity, userId, session) {
      return withSession(Inventory.findOneAndUpdate(
        {
          productId,
          inventoryHealth: { $ne: 'ReconciliationRequired' },
          $expr: {
            $gte: [
              { $subtract: [{ $ifNull: ['$sellableQuantity', '$stockQuantity'] }, '$reservedQuantity'] },
              quantity,
            ],
          },
        },
        { $inc: { reservedQuantity: quantity }, $set: { lastUpdatedBy: userId } },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async releaseInventory(productId, quantity, userId, session) {
      return withSession(Inventory.findOneAndUpdate(
        { productId, reservedQuantity: { $gte: quantity } },
        { $inc: { reservedQuantity: -quantity }, $set: { lastUpdatedBy: userId } },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async consumeInventory(productId, quantity, userId, session) {
      return withSession(Inventory.findOneAndUpdate(
        {
          productId,
          inventoryHealth: { $ne: 'ReconciliationRequired' },
          reservedQuantity: { $gte: quantity },
          sellableQuantity: { $gte: quantity },
        },
        {
          $inc: { reservedQuantity: -quantity, stockQuantity: -quantity, sellableQuantity: -quantity },
          $set: { lastUpdatedBy: userId },
        },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async receiveInventory(productId, sellable, damaged, userId, session) {
      return withSession(Inventory.findOneAndUpdate(
        { productId },
        {
          $inc: { stockQuantity: sellable, sellableQuantity: sellable, damagedQuantity: damaged },
          $set: { lastUpdatedBy: userId },
        },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async createReservations(items, session) {
      const created = await StockReservation.insertMany(items, session ? { session } : undefined);
      return created.map((item) => item.toObject());
    },
    async listReservations(caseId, session) {
      return withSession(StockReservation.find({ exchangeCaseId: caseId }).sort({ createdAt: 1 }), session).lean();
    },
    async updateReservation(id, data, session) {
      return withSession(StockReservation.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean();
    },
    async createInspections(items, session) {
      const created = await ExchangeInspection.insertMany(items, session ? { session } : undefined);
      return created.map((item) => item.toObject());
    },
    async listInspections(caseId, session) {
      return withSession(ExchangeInspection.find({ exchangeCaseId: caseId }).sort({ createdAt: 1 }), session).lean();
    },
    async createInventoryTransaction(data, session) {
      const [created] = await InventoryTransaction.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async listInventoryTransactions(caseId, session) {
      return withSession(InventoryTransaction.find({
        relatedCollection: 'ExchangeCase',
        relatedId: caseId,
      }).sort({ createdAt: 1 }), session).lean();
    },
    async findShipmentByKey(shipmentKey, session) {
      return withSession(ExchangeShipment.findOne({ shipmentKey }), session).lean();
    },
    async findShipmentById(id, session) { return withSession(ExchangeShipment.findById(id), session).lean(); },
    async createShipment(data, session) {
      const [created] = await ExchangeShipment.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async listShipments(caseId, session) {
      return withSession(ExchangeShipment.find({ exchangeCaseId: caseId }).sort({ createdAt: 1 }), session).lean();
    },
    async updateShipment(id, data, session) {
      return withSession(ExchangeShipment.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }), session).lean();
    },
    async claimShipmentOutcome(id, allowedStatus = 'InTransit', data, session) {
      return withSession(ExchangeShipment.findOneAndUpdate(
        { _id: id, status: allowedStatus },
        { $set: data },
        { new: true, runValidators: true }
      ), session).lean();
    },
    async findShipmentEventByKey(eventKey, session) {
      return withSession(ExchangeShipmentEvent.findOne({ eventKey }), session).lean();
    },
    async findShipmentEventById(id, session) {
      return withSession(ExchangeShipmentEvent.findById(id), session).lean();
    },
    async createShipmentEvent(data, session) {
      const [created] = await ExchangeShipmentEvent.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async listShipmentEvents(caseId, session) {
      return withSession(ExchangeShipmentEvent.find({ exchangeCaseId: caseId }).sort({ occurredAt: 1 }), session).lean();
    },
    async claimOrderLock(data, session) { return lockService.claim(data, session); },
    async findOrderLock(orderId, session) { return lockService.find(orderId, session); },
    async releaseOrderLock(orderId, caseId, terminalStatus, closePermanently, session) {
      return lockService.release({
        orderId,
        caseType: 'EXCHANGE',
        caseId,
        terminalStatus,
        closePermanently,
      }, session);
    },
    async transferOrderLock(orderId, exchangeCaseId, returnRequestId, session) {
      return lockService.transfer({
        orderId,
        fromCaseType: 'EXCHANGE',
        fromCaseId: exchangeCaseId,
        toCaseType: 'RETURN_REFUND',
        toCaseId: returnRequestId,
      }, session);
    },
    async createConvertedReturn(data, session) {
      const [created] = await ReturnRefundRequest.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async createConversion(data, session) {
      const [created] = await ExchangeConversion.create([data], session ? { session } : undefined);
      return created.toObject();
    },
  };
}

function normalizeIdempotencyKey(value, fieldName = 'idempotencyKey') {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new ApiError(400, `${fieldName} must contain 8-160 safe characters`);
  }
  return key;
}

function rejectForbiddenFields(input) {
  for (const field of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input || {}, field)) {
      throw new ApiError(400, `${field} is not allowed in Exchange`);
    }
  }
}

function normalizeDate(value, fieldName, fallback) {
  const date = value === undefined || value === null || value === '' ? new Date(fallback()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `${fieldName} is invalid`);
  return date;
}

function normalizeEvidenceDefault(customerId, values) {
  const unique = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!unique.length) throw new ApiError(400, 'At least one Exchange evidence attachment is required');
  if (unique.length > 5) throw new ApiError(400, 'A maximum of 5 Exchange evidence images is allowed');
  const verified = unique.map((value) => returnEvidenceClaim.verify(customerId, value));
  if (verified.reduce((sum, item) => sum + Number(item.size || 0), 0) > MAX_RETURN_EVIDENCE_TOTAL_SIZE) {
    throw new ApiError(413, 'Exchange evidence must not exceed 20 MiB per request');
  }
  return verified.map((item) => item.url.replace('/api/return-refunds/evidence/', '/api/exchanges/evidence/'));
}

function requestFingerprint(input, normalizedLines, reason, evidenceImages) {
  return crypto.createHash('sha256').update(JSON.stringify({
    orderId: String(input.orderId),
    reason,
    evidenceImages: [...evidenceImages].sort(),
    replacementUnitIds: [...new Set(
      (Array.isArray(input.replacementUnitIds) ? input.replacementUnitIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )].sort(),
    lines: normalizedLines.map((line) => ({
      orderDetailId: String(line.detail._id),
      quantity: line.quantity,
    })).sort((a, b) => a.orderDetailId.localeCompare(b.orderDetailId)),
  })).digest('hex');
}

function decisionFingerprint({ decision, reason, responsibility, payerRationale }) {
  return crypto.createHash('sha256').update(JSON.stringify({
    decision,
    reason,
    responsibility,
    payerRationale,
  })).digest('hex');
}

function generateRequestCode() {
  return `EXC-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function toPlain(value) {
  return value && typeof value.toObject === 'function' ? value.toObject() : value;
}

function createExchangeService({
  repository = createModelRepository(),
  transactionManager = createModelTransactionManager(),
  evidenceVerifier = normalizeEvidenceDefault,
  lowStockLifecycle = null,
  auditLogger = { log: logAudit },
  notifier = {
    notify: async ({ userId, type, caseId, caseCode }, session) => notificationService.createInAppNotification({
      userId,
      type,
      displayValues: { caseCode },
      targetCollection: 'ExchangeCase',
      targetId: caseId,
      eventId: `${type}:${caseId}`,
    }, session),
  },
  clock = () => new Date(),
  assignmentCoordinator = defaultAssignmentCoordinator,
} = {}) {
  async function activeAfterSalesConflict(orderId, customerId, session, requireVerified = false) {
    const resolved = await resolveActiveAfterSalesConflict({
      repository,
      orderId,
      customerId,
      session,
    });
    if (requireVerified && !resolved.verified) return null;
    return createActiveAfterSalesConflict(resolved.data);
  }

  async function writeAudit(userId, action, caseId, description, session, eventId = '') {
    await auditLogger.log({
      userId: userId || null,
      action,
      eventId,
      targetEntity: 'ExchangeCase',
      targetId: String(caseId),
      description,
    }, session);
  }

  async function evaluateInventoryLifecycles(inventories = []) {
    if (!lowStockLifecycle?.evaluate) return;
    const seen = new Set();
    for (const inventory of inventories.filter(Boolean)) {
      const productId = String(inventory.productId && inventory.productId._id
        ? inventory.productId._id
        : inventory.productId || '');
      if (!productId || seen.has(productId)) continue;
      seen.add(productId);
      await lowStockLifecycle.evaluate(inventory, {
        eventKey: `exchange:${productId}:${inventory.updatedAt || inventory.stockQuantity || inventory.sellableQuantity || 0}`,
      });
    }
  }

  function isInitialStockChoice(exchangeCase) {
    return ['AwaitingExactStockChoice', 'WaitingForExactStock'].includes(exchangeCase.status)
      && exchangeCase.waitingFor === 'INITIAL_APPROVAL';
  }

  function isIncidentStockChoice(exchangeCase) {
    return ['AwaitingExactStockChoice', 'WaitingForExactStock'].includes(exchangeCase.status)
      && exchangeCase.waitingFor === 'INCIDENT_RESEND';
  }

  function isInitialReservationRetry(exchangeCase) {
    return exchangeCase.status === 'WaitingForExactStock'
      && exchangeCase.waitingFor === 'INITIAL_APPROVAL';
  }

  function assertShipmentEventReplay(existing, expected) {
    if (String(existing.exchangeCaseId) !== String(expected.exchangeCaseId)
      || String(existing.shipmentId) !== String(expected.shipmentId)
      || existing.eventType !== expected.eventType
      || existing.source !== expected.source
      || String(existing.actorId || '') !== String(expected.actorId || '')
      || String(existing.evidenceReference) !== expected.evidenceReference
      || new Date(existing.occurredAt).getTime() !== expected.occurredAt.getTime()
      || String(existing.replacesEventId || '') !== String(expected.replacesEventId || '')
      || String(existing.note || '') !== expected.note) {
      throw new ApiError(409, 'Shipment event id was already used for a different fact');
    }
  }

  async function shipmentEventResult(event, source, replay) {
    if (source === 'CARRIER') {
      return {
        eventId: String(event._id),
        eventType: event.eventType,
        idempotentReplay: replay,
      };
    }
    return {
      event,
      request: await load(event.exchangeCaseId, source === 'STAFF_EVIDENCE' ? 'Staff' : 'Customer'),
      idempotentReplay: replay,
    };
  }

  function incidentResolvedByDeliveredDescendant(incident, shipments, visited = new Set()) {
    const incidentId = String(incident._id);
    if (visited.has(incidentId)) return false;
    visited.add(incidentId);
    return shipments
      .filter((candidate) => String(candidate.resendOfShipmentId || '') === incidentId)
      .some((candidate) => (
        candidate.status === 'Delivered'
        || (candidate.status === 'Incident'
          && incidentResolvedByDeliveredDescendant(candidate, shipments, visited))
      ));
  }

  function activeIncidentLeaves(shipments) {
    const childrenByParent = new Map();
    for (const shipment of shipments) {
      const parentId = String(shipment.resendOfShipmentId || '');
      if (!parentId) continue;
      const children = childrenByParent.get(parentId) || [];
      children.push(shipment);
      childrenByParent.set(parentId, children);
    }
    const leaves = shipments
      .filter((shipment) => shipment.status === 'Incident'
        && !incidentResolvedByDeliveredDescendant(shipment, shipments))
      .map((incident) => {
        let leaf = incident;
        const visited = new Set();
        while (!visited.has(String(leaf._id))) {
          visited.add(String(leaf._id));
          const [child] = childrenByParent.get(String(leaf._id)) || [];
          if (!child) break;
          leaf = child;
        }
        return leaf;
      });
    return leaves.filter((leaf, index) => (
      leaves.findIndex((candidate) => String(candidate._id) === String(leaf._id)) === index
    ));
  }

  async function reconcileIncidentState(caseId, session) {
    const shipments = await repository.listShipments(caseId, session);
    const activeLeaves = activeIncidentLeaves(shipments);
    if (activeLeaves.length) {
      const incident = activeLeaves[0];
      return repository.claimCase(caseId, [
        'OutboundFulfillment', 'ReplacementShipped', 'DeliveryIncident',
      ], {
        status: 'DeliveryIncident',
        waitingFor: incident.status === 'InTransit'
          ? 'INCIDENT_RESEND_IN_TRANSIT'
          : (incident.direction === 'REPLACEMENT_TO_CUSTOMER'
            ? 'INCIDENT_RESEND'
            : 'REJECTED_ORIGINAL_RECONCILIATION'),
        incidentShipmentId: incident._id,
        shippingPayer: 'SHOP',
      }, session);
    }
    const fresh = await repository.findCaseById(caseId, session);
    if (fresh?.status !== 'DeliveryIncident') return fresh;
    const nextStatus = shipments.some((item) => item.direction === 'REPLACEMENT_TO_CUSTOMER')
      ? 'ReplacementShipped'
      : 'OutboundFulfillment';
    return repository.claimCase(caseId, ['DeliveryIncident'], {
      status: nextStatus,
      waitingFor: '',
      incidentShipmentId: null,
      incidentReason: '',
    }, session);
  }

  async function load(caseId, audience = 'Customer', replay = false, session) {
    const exchangeCase = await repository.findCaseById(caseId, session);
    if (!exchangeCase) throw new ApiError(404, 'Exchange request not found');
    const [lines, units, reservations, inspections, shipments, shipmentEvents] = await Promise.all([
      repository.listLines(caseId, session),
      repository.listUnits(caseId, session),
      repository.listReservations(caseId, session),
      repository.listInspections(caseId, session),
      repository.listShipments(caseId, session),
      repository.listShipmentEvents(caseId, session),
    ]);
    const [claimedReplacementParentIdValues, orderLock] = audience === 'Customer'
      ? await Promise.all([
        repository.listClaimedReplacementParentIds
          ? repository.listClaimedReplacementParentIds(exchangeCase.orderId, session)
          : [],
        repository.findOrderLock
          ? repository.findOrderLock(exchangeCase.orderId, session)
          : null,
      ])
      : [[], null];
    const claimedReplacementParentIds = new Set(claimedReplacementParentIdValues);
    const hasOrderBarrier = orderLock?.status === 'Active'
      || (orderLock?.status === 'ClosedPermanently' && orderLock?.caseType === 'RETURN_REFUND');
    const response = {
      id: String(exchangeCase._id),
      requestCode: exchangeCase.requestCode,
      orderId: String(exchangeCase.orderId),
      customerId: String(exchangeCase.customerId),
      status: exchangeCase.status,
      reason: exchangeCase.reason,
      evidenceImages: exchangeCase.evidenceImages || [],
      requestedAt: exchangeCase.requestedAt,
      deadlineAt: exchangeCase.deadlineAt,
      decisionReason: exchangeCase.decisionReason || '',
      responsibility: exchangeCase.responsibility || '',
      shippingPayer: exchangeCase.shippingPayer || '',
      payerRationale: exchangeCase.payerRationale || '',
      approvedAt: exchangeCase.approvedAt || null,
      shipByAt: exchangeCase.shipByAt || null,
      handoffAt: exchangeCase.handoffAt || null,
      handoffProofReference: exchangeCase.handoffProofReference || '',
      warehouseReceivedAt: exchangeCase.warehouseReceivedAt || null,
      holdReason: exchangeCase.holdReason || '',
      waitingFor: exchangeCase.waitingFor || '',
      incidentShipmentId: exchangeCase.incidentShipmentId
        ? String(exchangeCase.incidentShipmentId)
        : null,
      incidentReason: exchangeCase.incidentReason || '',
      convertedReturnRefundRequestId: exchangeCase.convertedReturnRefundRequestId
        ? String(exchangeCase.convertedReturnRefundRequestId)
        : null,
      completedAt: exchangeCase.completedAt || null,
      lines: lines.map(toPlain),
      inspections: inspections.map(toPlain),
      shipments: shipments.map(toPlain),
      shipmentEvents: shipmentEvents.map(toPlain),
      activeIncidents: activeIncidentLeaves(shipments).map((shipment) => ({
        shipmentId: String(shipment._id),
        direction: shipment.direction,
        status: shipment.status,
      })),
      idempotentReplay: replay,
    };
    if (audience === 'Staff') {
      response.reservations = reservations.map(toPlain);
    }
    if (audience === 'Customer') {
      response.units = units.map((unit) => {
        const deadlineTime = unit.exchangeDeadlineAt
          ? new Date(unit.exchangeDeadlineAt).getTime()
          : Number.NaN;
        const deadlineValid = Number.isFinite(deadlineTime);
        const deadlineCurrent = deadlineValid && new Date(clock()).getTime() <= deadlineTime;
        const sourceClaimed = claimedReplacementParentIds.has(String(unit._id));
        const eligibleForReplacementExchange = unit.outcome === 'ReplacementDelivered'
          && deadlineCurrent
          && !hasOrderBarrier
          && !sourceClaimed;
        return {
          id: String(unit._id),
          orderId: String(unit.orderId),
          orderDetailId: String(unit.orderDetailId),
          productId: String(unit.productId),
          parentUnitId: unit.parentUnitId ? String(unit.parentUnitId) : null,
          cycle: Number(unit.cycle || 0),
          outcome: unit.outcome,
          replacementDeliveredAt: unit.replacementDeliveredAt || null,
          exchangeDeadlineAt: unit.exchangeDeadlineAt || null,
          eligibleForReplacementExchange,
        };
      });
    }
    if (audience === 'Warehouse') {
      delete response.customerId;
      delete response.responsibility;
      delete response.shippingPayer;
      delete response.payerRationale;
      delete response.decisionReason;
      delete response.holdReason;
      response.units = units.map(toPlain);
    }
    return response;
  }

  async function releaseReservations(caseId, actorId, reason, session) {
    const reservations = await repository.listReservations(caseId, session);
    const inventories = [];
    for (const reservation of reservations.filter((item) => item.status === 'Reserved')) {
      const released = await repository.releaseInventory(reservation.productId, Number(reservation.quantity), actorId, session);
      if (!released) throw new ApiError(409, 'Reserved Inventory changed while releasing Exchange stock');
      inventories.push(released);
      await repository.updateReservation(reservation._id, {
        status: 'Released', releasedAt: new Date(clock()), releaseReason: reason,
      }, session);
    }
    return inventories;
  }

  async function reserveAll(exchangeCase, lines, staffId, session) {
    const reservedAt = new Date(clock());
    const reservationInputs = [];
    const inventories = [];
    for (const line of lines) {
      const inventory = await repository.reserveInventory(line.productId, Number(line.requestedQuantity), staffId, session);
      if (!inventory) throw new NoExactStockError(line.productId);
      inventories.push(inventory);
      reservationInputs.push({
        reservationKey: `${String(exchangeCase._id)}:${String(line._id)}`,
        exchangeCaseId: exchangeCase._id,
        exchangeLineId: line._id,
        productId: line.productId,
        quantity: Number(line.requestedQuantity),
        status: 'Reserved',
        reservedAt,
      });
    }
    const reservations = await repository.createReservations(reservationInputs, session);
    return { reservations, inventories };
  }

  async function attemptApproval(staffId, exchangeCase, data) {
    try {
      const result = await transactionManager.withTransaction(async (session) => {
        await assignmentCoordinator.coordinate({
          userId: staffId,
          expectedRole: 'Staff',
          session,
        });
        const fresh = await repository.findCaseById(exchangeCase._id, session);
        if (!fresh || !['Submitted', 'WaitingForExactStock'].includes(fresh.status)) {
          throw new ApiError(409, 'Exchange request changed while Staff was approving it');
        }
        const lines = await repository.listLines(fresh._id, session);
        if (!lines.length) throw new ApiError(409, 'Exchange lines are missing');
        const reserved = await reserveAll(fresh, lines, staffId, session);
        const approvedAt = new Date(clock());
        const approved = await repository.claimCase(fresh._id, ['Submitted', 'WaitingForExactStock'], {
            ...data,
            status: 'ApprovedAwaitingShipment',
            approvedAt,
            shipByAt: new Date(approvedAt.getTime() + SHIP_WINDOW_MS),
            decidedAt: approvedAt,
            decidedBy: staffId,
            stockFailureReason: '',
            waitingFor: '',
            incidentShipmentId: null,
        }, session);
        if (!approved) throw new ApiError(409, 'Exchange request changed while Staff was approving it');
        return { approved, inventories: reserved.inventories };
      });
      await evaluateInventoryLifecycles(result.inventories);
      return result.approved;
    } catch (error) {
      if (!(error instanceof NoExactStockError)) throw error;
      const failedAt = new Date(clock());
      const waiting = await transactionManager.withTransaction(async (session) => {
        await assignmentCoordinator.coordinate({
          userId: staffId,
          expectedRole: 'Staff',
          session,
        });
        return repository.claimCase(exchangeCase._id, ['Submitted', 'WaitingForExactStock'], {
          ...data,
          status: 'AwaitingExactStockChoice',
          approvedAt: null,
          shipByAt: null,
          decidedAt: failedAt,
          decidedBy: staffId,
          stockFailureReason: error.message,
          waitingFor: 'INITIAL_APPROVAL',
          incidentShipmentId: null,
        }, session);
      });
      if (!waiting) throw new ApiError(409, 'Exchange request changed while Staff was checking exact stock');
      return waiting;
    }
  }

  async function reconcileCompletion(caseId, session) {
    const lines = await repository.listLines(caseId, session);
    const shipments = await repository.listShipments(caseId, session);
    if (shipments.some((item) => item.status === 'InTransit')) return null;
    for (const incident of shipments.filter((item) => item.status === 'Incident')) {
      const resolvedByDeliveredResend = incidentResolvedByDeliveredDescendant(incident, shipments);
      if (!resolvedByDeliveredResend) return null;
    }
    let anyAccepted = false;
    for (const line of lines) {
      const accepted = Number(line.acceptedSellableQuantity || 0) + Number(line.acceptedDamagedQuantity || 0);
      const rejected = Number(line.rejectedQuantity || 0);
      anyAccepted ||= accepted > 0;
      const deliveredReplacement = shipments
        .filter((item) => String(item.exchangeLineId) === String(line._id)
          && item.direction === 'REPLACEMENT_TO_CUSTOMER' && item.status === 'Delivered')
        .reduce((sum, item) => sum + Number(item.quantity), 0);
      const deliveredRejected = shipments
        .filter((item) => String(item.exchangeLineId) === String(line._id)
          && item.direction === 'REJECTED_ORIGINAL_TO_CUSTOMER' && item.status === 'Delivered')
        .reduce((sum, item) => sum + Number(item.quantity), 0);
      if (deliveredReplacement < accepted || deliveredRejected < rejected) return null;
    }
    const completedAt = new Date(clock());
    const terminalStatus = anyAccepted ? 'Completed' : 'ClosedNoExchange';
    const updated = await repository.claimCase(caseId, [
      'OutboundFulfillment', 'ReplacementShipped', 'DeliveryIncident',
    ], { status: terminalStatus, completedAt, terminalAt: completedAt }, session);
    if (!updated) throw new ApiError(409, 'Exchange changed before completion could be recorded');
    await repository.releaseOrderLock(updated.orderId, updated._id, terminalStatus, false, session);
    return updated;
  }

  async function loadCreateReplay(existing, customerId, input) {
    if (String(existing.orderId) !== String(input.orderId)) {
      throw new ApiError(409, 'Exchange idempotency key was used for another Order');
    }
    const reason = String(input.reason || '').trim();
    const evidenceImages = evidenceVerifier(customerId, input.evidenceImages);
    const [existingLines, existingUnits] = await Promise.all([
      repository.listLines(existing._id),
      repository.listUnits(existing._id),
    ]);
    const replacementUnitIds = [...new Set(
      (Array.isArray(input.replacementUnitIds) ? input.replacementUnitIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )].sort();
    const expectedReplacementUnitIds = existingUnits
      .map((unit) => unit.parentUnitId ? String(unit.parentUnitId) : '')
      .filter(Boolean)
      .sort();
    const isReplacementCycle = Number(existing.sourceCycle || 0) > 0;
    if (isReplacementCycle !== (replacementUnitIds.length > 0)
      || JSON.stringify(replacementUnitIds) !== JSON.stringify(expectedReplacementUnitIds)) {
      throw new ApiError(409, 'Exchange idempotency key was used for a different command');
    }
    let replayLines;
    if (isReplacementCycle) {
      replayLines = existingLines.map((line) => ({
        detail: { _id: line.orderDetailId },
        quantity: Number(line.requestedQuantity),
      }));
    } else {
      if (!Array.isArray(input.lines) || !input.lines.length) {
        throw new ApiError(409, 'Exchange idempotency key was used for a different command');
      }
      replayLines = input.lines.map((line) => ({
        detail: { _id: line.orderDetailId },
        quantity: Number(line.quantity),
      }));
    }
    const replayFingerprint = requestFingerprint(input, replayLines, reason, evidenceImages);
    if (replayFingerprint !== existing.requestFingerprint) {
      throw new ApiError(409, 'Exchange idempotency key was used for a different command');
    }
    return load(existing._id, 'Customer', true);
  }

  const service = {
    async createCustomerRequest(customerId, input = {}) {
      rejectForbiddenFields(input);
      if (!input.orderId) throw new ApiError(400, 'Order is required');
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const existing = await repository.findCaseByIdempotency(customerId, idempotencyKey);
      if (existing) {
        return loadCreateReplay(existing, customerId, input);
      }
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Exchange reason is required');
      if (reason.length > 2000) throw new ApiError(400, 'Exchange reason must not exceed 2000 characters');
      const evidenceImages = evidenceVerifier(customerId, input.evidenceImages);
      let order = await repository.findOrderById(input.orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      if (order.orderStatus !== 'Delivered') throw new ApiError(409, 'Only Delivered orders can be exchanged');
      const replacementUnitIds = [...new Set(
        (Array.isArray(input.replacementUnitIds) ? input.replacementUnitIds : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )];
      if (!replacementUnitIds.length && !order.deliveredAt && !order.exchangeDeadlineAt) {
        throw new ApiError(409, 'DeliveredAt is required to determine the five-day Exchange window');
      }
      let replacementUnits = [];
      if (replacementUnitIds.length) {
        if (!repository.findUnitsByIds) throw new ApiError(409, 'Replacement lineage lookup is unavailable');
        replacementUnits = await repository.findUnitsByIds(replacementUnitIds);
        if (replacementUnits.length !== replacementUnitIds.length) throw new ApiError(404, 'Replacement unit not found');
        for (const unit of replacementUnits) {
          if (String(unit.orderId) !== String(order._id) || unit.outcome !== 'ReplacementDelivered') {
            throw new ApiError(409, 'Replacement unit is not eligible for another Exchange');
          }
          if (!unit.exchangeDeadlineAt || new Date(clock()).getTime() > new Date(unit.exchangeDeadlineAt).getTime()) {
            throw new ApiError(409, 'The replacement unit Exchange window has expired');
          }
        }
      }
      const deadlineAt = replacementUnits.length
        ? new Date(Math.min(...replacementUnits.map((unit) => new Date(unit.exchangeDeadlineAt).getTime())))
        : order.exchangeDeadlineAt
          ? new Date(order.exchangeDeadlineAt)
          : new Date(new Date(order.deliveredAt).getTime() + EXCHANGE_WINDOW_MS);
      if (Number.isNaN(deadlineAt.getTime())) throw new ApiError(409, 'The stored Exchange deadline is invalid');
      if (new Date(clock()).getTime() > deadlineAt.getTime()) throw new ApiError(409, 'The five-day Exchange window has expired');
      if (!replacementUnits.length && !order.exchangeDeadlineAt) order = await repository.ensureExchangeDeadline(order._id, deadlineAt);

      const details = await repository.listOrderDetails(order._id);
      const detailById = new Map(details.map((detail) => [String(detail._id), detail]));
      const seen = new Set();
      let selections = input.lines;
      if (replacementUnits.length) {
        if (Array.isArray(input.lines) && input.lines.length) {
          throw new ApiError(400, 'Replacement-unit Exchange cannot also select original Order quantities');
        }
        const grouped = new Map();
        for (const unit of replacementUnits) {
          const key = String(unit.orderDetailId);
          const current = grouped.get(key) || { orderDetailId: key, quantity: 0, sourceUnits: [] };
          current.quantity += 1;
          current.sourceUnits.push(unit);
          grouped.set(key, current);
        }
        selections = [...grouped.values()];
      }
      if (!Array.isArray(selections) || !selections.length) throw new ApiError(400, 'At least one Order line is required');
      const normalizedLines = selections.map((selection) => {
        const detail = detailById.get(String(selection.orderDetailId));
        if (!detail) throw new ApiError(400, 'Exchange line does not belong to the Order');
        if (seen.has(String(detail._id))) throw new ApiError(400, 'Each Order line may be selected only once');
        seen.add(String(detail._id));
        const quantity = Number(selection.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError(400, 'Exchange quantity must be a positive integer');
        if (quantity > Number(detail.quantity)) throw new ApiError(400, 'Exchange quantity exceeds purchased quantity');
        if (!String(detail.productSkuSnapshot || '').trim()) throw new ApiError(409, 'Purchased SKU snapshot is required for exact replacement');
        return { detail, quantity, sourceUnits: selection.sourceUnits || [] };
      });
      const fingerprint = requestFingerprint(input, normalizedLines, reason, evidenceImages);
      const requestedAt = new Date(clock());
      const codHold = order.paymentMethod === 'COD' && order.paymentStatus !== 'Paid';
      if (codHold && order.codDiscrepancyStatus !== 'Open') {
        throw new ApiError(409, 'Unpaid COD Exchange requires an open COD discrepancy');
      }
      if (!codHold && order.paymentStatus !== 'Paid') {
        throw new ApiError(409, 'Only paid orders can enter the normal Exchange flow');
      }

      let created;
      try {
        created = await transactionManager.withTransaction(async (session) => {
          const exchangeCase = await repository.createCase({
            orderId: order._id,
            customerId,
            requestCode: generateRequestCode(),
            idempotencyKey,
            requestFingerprint: fingerprint,
            status: codHold ? 'AwaitingCODReconciliation' : 'Submitted',
            reason,
            evidenceImages,
            requestedAt,
            sourceTimelyRequestedAt: requestedAt,
            sourceCycle: replacementUnits.length
              ? Math.max(...replacementUnits.map((unit) => Number(unit.cycle || 0))) + 1
              : 0,
            deadlineAt,
            holdReason: codHold ? 'Đã ghi nhận đúng hạn; đang chờ đối soát tiền Customer đã trả cho Carrier.' : '',
            waitingFor: '',
            incidentShipmentId: null,
            approvedAt: null,
            shipByAt: null,
          }, session);
          const lock = await repository.claimOrderLock({
            orderId: order._id,
            caseType: 'EXCHANGE',
            caseId: exchangeCase._id,
          }, session);
          if (!lock) throw createActiveAfterSalesConflict(null);
          const lines = await repository.createLines(normalizedLines.map(({ detail, quantity }) => ({
            exchangeCaseId: exchangeCase._id,
            orderDetailId: detail._id,
            productId: detail.productId,
            productNameSnapshot: detail.productNameSnapshot,
            productSkuSnapshot: detail.productSkuSnapshot,
            productImageSnapshot: detail.productImageSnapshot || '',
            unitSnapshot: detail.unitSnapshot || '',
            purchasedQuantity: Number(detail.quantity),
            requestedQuantity: quantity,
          })), session);
          for (const normalized of normalizedLines.filter((item) => !item.sourceUnits.length)) {
            const claimedOrdinals = new Set(
              await repository.listClaimedOriginalUnitOrdinals(
                order._id,
                normalized.detail._id,
                session
              )
            );
            normalized.originalOrdinals = Array.from(
              { length: Number(normalized.detail.quantity) },
              (_value, index) => index + 1
            ).filter((ordinal) => !claimedOrdinals.has(ordinal)).slice(0, normalized.quantity);
            if (normalized.originalOrdinals.length !== normalized.quantity) {
              throw new ApiError(409, 'Selected original physical units are already used by another Exchange');
            }
          }
          const units = [];
          for (const line of lines) {
            const normalized = normalizedLines.find((item) => String(item.detail._id) === String(line.orderDetailId));
            for (let ordinal = 1; ordinal <= Number(line.requestedQuantity); ordinal += 1) {
              const parent = normalized?.sourceUnits?.[ordinal - 1] || null;
              const originalUnitOrdinal = parent?.originalUnitOrdinal
                || normalized.originalOrdinals[ordinal - 1];
              const exclusivePhysicalClaimKey = parent
                ? `REPLACEMENT:${String(parent._id)}`
                : `ORIGINAL:${String(order._id)}:${String(line.orderDetailId)}:${originalUnitOrdinal}`;
              units.push({
                unitKey: `${String(exchangeCase._id)}:${String(line._id)}:${ordinal}`,
                exclusivePhysicalClaimKey,
                exchangeCaseId: exchangeCase._id,
                exchangeLineId: line._id,
                orderId: order._id,
                orderDetailId: line.orderDetailId,
                productId: line.productId,
                parentUnitId: parent?._id || null,
                originalUnitOrdinal,
                cycle: parent ? Number(parent.cycle || 0) + 1 : 0,
                outcome: 'Pending',
              });
            }
          }
          await repository.createUnits(units, session);
          return exchangeCase;
        });
      } catch (error) {
        if (error?.errorCode === ACTIVE_AFTER_SALES_ERROR_CODE) {
          throw await activeAfterSalesConflict(order._id, customerId);
        }
        if (error?.code === 11000) {
          const replay = await repository.findCaseByIdempotency(customerId, idempotencyKey);
          if (replay) return loadCreateReplay(replay, customerId, input);
          const conflict = await activeAfterSalesConflict(order._id, customerId, undefined, true);
          if (conflict) throw conflict;
          throw classifyExchangeDuplicateConflict(error);
        }
        throw error;
      }
      await writeAudit(customerId, 'EXCHANGE_CREATED', created._id, `Customer created Exchange ${created.requestCode}`);
      return load(created._id);
    },

    async listMyRequests(customerId) {
      const cases = await repository.listCases({ customerId });
      const items = [];
      for (const item of cases) items.push(await load(item._id, 'Customer'));
      return { items, total: items.length };
    },

    async getCustomerRequest(customerId, id) {
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase || String(exchangeCase.customerId) !== String(customerId)) {
        throw new ApiError(404, 'Exchange request not found');
      }
      return load(id, 'Customer');
    },

    async listStaffRequests(query = {}) {
      const filter = query.status ? { status: query.status } : {};
      const cases = await repository.listCases(filter);
      const items = [];
      for (const item of cases) items.push(await load(item._id, 'Staff'));
      return { items, total: items.length };
    },

    async getStaffRequest(id) { return load(id, 'Staff'); },

    async listWarehouseRequests(query = {}) {
      const baseAllowed = [
        'ApprovedAwaitingShipment', 'CustomerShipped', 'WarehouseInspecting',
        'OutboundFulfillment', 'ReplacementShipped', 'DeliveryIncident',
      ];
      const requestedStatus = String(query.status || '').trim();
      const incidentWaitStatuses = ['AwaitingExactStockChoice', 'WaitingForExactStock'];
      if (requestedStatus && ![...baseAllowed, ...incidentWaitStatuses].includes(requestedStatus)) {
        throw new ApiError(400, 'Warehouse Exchange status filter is invalid');
      }
      const filter = requestedStatus
        ? {
          status: requestedStatus,
          ...(incidentWaitStatuses.includes(requestedStatus) ? { waitingFor: 'INCIDENT_RESEND' } : {}),
        }
        : {
          $or: [
            { status: { $in: baseAllowed } },
            { status: { $in: incidentWaitStatuses }, waitingFor: 'INCIDENT_RESEND' },
          ],
        };
      const cases = await repository.listCases(filter);
      const items = [];
      for (const item of cases) items.push(await load(item._id, 'Warehouse'));
      return { items, total: items.length };
    },

    async getWarehouseRequest(id) {
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase) throw new ApiError(404, 'Exchange request not found');
      const visible = [
        'ApprovedAwaitingShipment', 'CustomerShipped', 'WarehouseInspecting',
        'OutboundFulfillment', 'ReplacementShipped', 'DeliveryIncident',
      ].includes(exchangeCase.status)
        || (['AwaitingExactStockChoice', 'WaitingForExactStock'].includes(exchangeCase.status)
          && exchangeCase.waitingFor === 'INCIDENT_RESEND');
      if (!visible) throw new ApiError(404, 'Exchange request not found');
      return load(id, 'Warehouse');
    },

    async decideRequest(staffId, id, input = {}) {
      rejectForbiddenFields(input);
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase) throw new ApiError(404, 'Exchange request not found');
      if (exchangeCase.status === 'AwaitingCODReconciliation') {
        throw new ApiError(409, 'COD reconciliation must verify full Customer collection before Exchange eligibility');
      }
      const decision = String(input.decision || '').toUpperCase();
      if (!['APPROVE', 'REJECT'].includes(decision)) throw new ApiError(400, 'Decision must be APPROVE or REJECT');
      const reason = String(input.reason || '').trim();
      if (!reason) throw new ApiError(400, 'Staff decision reason is required');
      if (reason.length > 2000) throw new ApiError(400, 'Staff decision reason must not exceed 2000 characters');
      const responsibility = decision === 'APPROVE'
        ? String(input.responsibility || '').toUpperCase()
        : '';
      if (decision === 'APPROVE' && !['SHOP_FAULT', 'CUSTOMER_PREFERENCE'].includes(responsibility)) {
        throw new ApiError(400, 'Staff responsibility must be SHOP_FAULT or CUSTOMER_PREFERENCE');
      }
      const payerRationale = decision === 'APPROVE'
        ? String(input.payerRationale || reason).trim()
        : '';
      if (payerRationale.length > 1000) throw new ApiError(400, 'Payer rationale must not exceed 1000 characters');
      const fingerprint = decisionFingerprint({
        decision, reason, responsibility, payerRationale,
      });
      if (exchangeCase.decisionIdempotencyKey === idempotencyKey) {
        if (exchangeCase.decisionFingerprint !== fingerprint) {
          throw new ApiError(409, 'Decision idempotency key was used for a different decision');
        }
        return load(id, 'Staff', true);
      }
      if (exchangeCase.status !== 'Submitted') throw new ApiError(409, 'Only Submitted Exchange requests can be decided');
      if (decision === 'REJECT') {
        const rejectedAt = new Date(clock());
        const updated = await transactionManager.withTransaction(async (session) => {
          const rejected = await repository.claimCase(id, ['Submitted'], {
            status: 'Rejected', decisionReason: reason, decidedBy: staffId,
            decidedAt: rejectedAt, terminalAt: rejectedAt,
            decisionIdempotencyKey: idempotencyKey,
            decisionFingerprint: fingerprint,
          }, session);
          if (!rejected) throw new ApiError(409, 'Exchange request changed while Staff was deciding it');
          await repository.releaseUnitClaims(rejected._id, session);
          await repository.releaseOrderLock(rejected.orderId, rejected._id, 'Rejected', false, session);
          await writeAudit(
            staffId,
            'EXCHANGE_REJECTED',
            id,
            reason,
            session,
            `EXCHANGE_REJECTED:${String(id)}`
          );
          await notifier.notify({
            userId: exchangeCase.customerId,
            type: 'EXCHANGE_REJECTED',
            caseId: id,
            caseCode: exchangeCase.requestCode,
          }, session);
          return rejected;
        });
        return load(updated._id, 'Staff');
      }
      const decisionData = {
        decisionReason: reason,
        decisionIdempotencyKey: idempotencyKey,
        decisionFingerprint: fingerprint,
        responsibility,
        shippingPayer: responsibility === 'SHOP_FAULT' ? 'SHOP' : 'CUSTOMER',
        payerRationale,
      };
      const updated = await attemptApproval(staffId, exchangeCase, decisionData);
      await writeAudit(staffId, updated.status === 'ApprovedAwaitingShipment' ? 'EXCHANGE_APPROVED' : 'EXCHANGE_NO_STOCK', id, reason);
      return load(id, 'Staff');
    },

    async retryReservation(staffId, id, input = {}) {
      rejectForbiddenFields(input);
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase) throw new ApiError(404, 'Exchange request not found');
      if (exchangeCase.reservationRetryIdempotencyKey === idempotencyKey) {
        return load(id, 'Staff', true);
      }
      if (!isInitialReservationRetry(exchangeCase)) {
        if (exchangeCase.status === 'AwaitingExactStockChoice'
          && exchangeCase.waitingFor === 'INITIAL_APPROVAL') {
          throw new ApiError(409, 'Customer must choose WAIT before Staff can retry reservation');
        }
        if (isIncidentStockChoice(exchangeCase)) {
          throw new ApiError(409, 'Incident stock must continue through the exact-SKU resend flow');
        }
        throw new ApiError(409, 'Only an initial exact-stock choice can retry reservation');
      }
      const updated = await attemptApproval(staffId, exchangeCase, {
        decisionReason: exchangeCase.decisionReason,
        responsibility: exchangeCase.responsibility,
        shippingPayer: exchangeCase.shippingPayer,
        payerRationale: exchangeCase.payerRationale,
        reservationRetryIdempotencyKey: idempotencyKey,
      });
      await writeAudit(staffId, updated.status === 'ApprovedAwaitingShipment' ? 'EXCHANGE_STOCK_RESERVED' : 'EXCHANGE_STILL_NO_STOCK', id, updated.stockFailureReason || '');
      return load(id, 'Staff');
    },

    async chooseStockOption(customerId, id, input = {}) {
      rejectForbiddenFields(input);
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase || String(exchangeCase.customerId) !== String(customerId)) throw new ApiError(404, 'Exchange request not found');
      const choice = String(input.choice || '').toUpperCase();
      if (exchangeCase.stockChoiceIdempotencyKey === idempotencyKey) {
        if (exchangeCase.stockChoice !== choice) {
          throw new ApiError(409, 'Stock-choice idempotency key was used for a different choice');
        }
        return load(id, 'Customer', true);
      }
      if (!(isInitialStockChoice(exchangeCase) || isIncidentStockChoice(exchangeCase))) {
        if (exchangeCase.waitingFor === 'REJECTED_ORIGINAL_RECONCILIATION') {
          throw new ApiError(409, 'A rejected-original delivery incident requires Staff reconciliation');
        }
        throw new ApiError(409, 'This Exchange has no exact-stock failure awaiting a Customer choice');
      }
      if (choice === 'WAIT') {
        const waiting = await repository.claimCase(id, [
          'AwaitingExactStockChoice', 'WaitingForExactStock',
        ], {
          status: 'WaitingForExactStock',
          stockChoiceIdempotencyKey: idempotencyKey,
          stockChoice: 'WAIT',
        });
        if (!waiting) throw new ApiError(409, 'Exchange stock choice changed while Customer was submitting it');
        await writeAudit(customerId, 'EXCHANGE_WAIT_FOR_STOCK', id, 'Customer chose exact-SKU stock wait');
        return load(id);
      }
      if (choice !== 'CONVERT_TO_RETURN') throw new ApiError(400, 'Choice must be WAIT or CONVERT_TO_RETURN');
      return service.convertToReturn(customerId, id, { idempotencyKey });
    },

    async convertToReturn(customerId, id, input = {}) {
      const conversionKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase || String(exchangeCase.customerId) !== String(customerId)) throw new ApiError(404, 'Exchange request not found');
      if (exchangeCase.status === 'ConvertedToReturnRefund') return load(id, 'Customer', true);
      if (!(isInitialStockChoice(exchangeCase) || isIncidentStockChoice(exchangeCase))) {
        if (exchangeCase.waitingFor === 'REJECTED_ORIGINAL_RECONCILIATION') {
          throw new ApiError(409, 'A rejected-original delivery incident cannot convert to Return/Refund');
        }
        throw new ApiError(409, 'This Exchange cannot convert without an exact-stock failure');
      }
      const convertedResult = await transactionManager.withTransaction(async (session) => {
        const claimed = await repository.claimCase(id, [
          'AwaitingExactStockChoice', 'WaitingForExactStock',
        ], {
          status: 'ConvertedToReturnRefund',
          stockChoiceIdempotencyKey: conversionKey,
          stockChoice: 'CONVERT_TO_RETURN',
          terminalAt: new Date(clock()),
        }, session);
        if (!claimed) throw new ApiError(409, 'Exchange changed while Customer was converting it');
        const releasedInventories = await releaseReservations(id, customerId, 'Converted to Return/Refund', session);
        const [lines, movements] = await Promise.all([
          repository.listLines(id, session),
          repository.listInventoryTransactions
            ? repository.listInventoryTransactions(id, session)
            : [],
        ]);
        const movementKeys = movements.map((item) => item.movementKey).filter(Boolean);
        const preAccountedItems = lines
          .filter((line) => Number(line.acceptedSellableQuantity || 0) + Number(line.acceptedDamagedQuantity || 0) > 0)
          .map((line) => ({
            orderDetailId: line.orderDetailId,
            productId: line.productId,
            sellableQuantity: Number(line.acceptedSellableQuantity || 0),
            damagedQuantity: Number(line.acceptedDamagedQuantity || 0),
            movementKeys: movements
              .filter((item) => String(item.productId) === String(line.productId)
                && !String(item.transactionType).includes('REPLACEMENT_OUT'))
              .map((item) => item.movementKey)
              .filter(Boolean),
          }));
        const returnRequest = await repository.createConvertedReturn({
          orderId: exchangeCase.orderId,
          requestCode: `RET-X-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
          customerId: exchangeCase.customerId,
          reason: `Chuyển từ yêu cầu đổi hàng ${exchangeCase.requestCode}: ${exchangeCase.reason}`,
          evidenceImages: exchangeCase.evidenceImages,
          status: 'New',
          refundAmount: 0,
          deadlineAt: exchangeCase.deadlineAt,
          requestedAt: exchangeCase.sourceTimelyRequestedAt,
          sourceExchangeCaseId: exchangeCase._id,
          originalRequestedAt: exchangeCase.sourceTimelyRequestedAt,
          preAccountedMovementKeys: movementKeys,
          preAccountedItems,
        }, session);
        const transferred = await repository.transferOrderLock(exchangeCase.orderId, exchangeCase._id, returnRequest._id, session);
        if (!transferred) throw new ApiError(409, 'Active after-sales lock changed during conversion');
        await repository.createConversion({
          exchangeCaseId: exchangeCase._id,
          returnRefundRequestId: returnRequest._id,
          conversionKey,
          originalRequestedAt: exchangeCase.sourceTimelyRequestedAt,
          inventoryMovementKeys: movementKeys,
          convertedBy: customerId,
          convertedAt: new Date(clock()),
        }, session);
        await repository.updateCase(id, {
          convertedReturnRefundRequestId: returnRequest._id,
        }, session);
        return { returnRequest, releasedInventories };
      });
      await evaluateInventoryLifecycles(convertedResult.releasedInventories);
      const converted = convertedResult.returnRequest;
      await writeAudit(customerId, 'EXCHANGE_CONVERTED_TO_RETURN', id, `Converted to Return ${converted.requestCode}`);
      return load(id);
    },

    async recordHandoffProof(customerId, id, input = {}) {
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase || String(exchangeCase.customerId) !== String(customerId)) throw new ApiError(404, 'Exchange request not found');
      if (exchangeCase.handoffIdempotencyKey === idempotencyKey) return load(id, 'Customer', true);
      if (exchangeCase.status !== 'ApprovedAwaitingShipment') throw new ApiError(409, 'Only an approved Exchange can record Customer handoff');
      const proofReference = String(input.proofReference || '').trim();
      if (!proofReference || proofReference.length > 256) throw new ApiError(400, 'Valid handoff proof is required');
      const handoffAt = normalizeDate(input.handoffAt, 'handoffAt', clock);
      if (handoffAt.getTime() > new Date(clock()).getTime() + FUTURE_TOLERANCE_MS) throw new ApiError(400, 'handoffAt cannot be in the future');
      if (handoffAt.getTime() > new Date(exchangeCase.shipByAt).getTime()) throw new ApiError(409, 'The three-day Exchange handoff deadline has expired');
      if (exchangeCase.approvedAt && handoffAt.getTime() < new Date(exchangeCase.approvedAt).getTime()) throw new ApiError(400, 'handoffAt cannot be before approval');
      const handedOff = await repository.claimCase(id, ['ApprovedAwaitingShipment'], {
        status: 'CustomerShipped',
        handoffAt,
        handoffProofReference: proofReference,
        handoffIdempotencyKey: idempotencyKey,
      });
      if (!handedOff) throw new ApiError(409, 'Exchange changed before Customer handoff could be recorded');
      await writeAudit(customerId, 'EXCHANGE_HANDOFF_RECORDED', id, proofReference);
      return load(id);
    },

    async cancelRequest(customerId, id, input = {}) {
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase || String(exchangeCase.customerId) !== String(customerId)) throw new ApiError(404, 'Exchange request not found');
      if (exchangeCase.status === 'Cancelled' && exchangeCase.cancellationIdempotencyKey === idempotencyKey) return load(id, 'Customer', true);
      if (!['Submitted', 'AwaitingExactStockChoice', 'WaitingForExactStock', 'ApprovedAwaitingShipment'].includes(exchangeCase.status)) {
        throw new ApiError(409, 'Customer cannot cancel after Carrier handoff');
      }
      const cancellationResult = await transactionManager.withTransaction(async (session) => {
        const cancelledAt = new Date(clock());
        const cancelled = await repository.claimCase(id, [
          'Submitted', 'AwaitingExactStockChoice', 'WaitingForExactStock', 'ApprovedAwaitingShipment',
        ], {
          status: 'Cancelled',
          cancellationIdempotencyKey: idempotencyKey,
          terminalAt: cancelledAt,
        }, session);
        if (!cancelled) throw new ApiError(409, 'Exchange changed before cancellation could be recorded');
        const releasedInventories = await releaseReservations(id, customerId, 'Customer cancelled before handoff', session);
        await repository.releaseUnitClaims(id, session);
        await repository.releaseOrderLock(exchangeCase.orderId, exchangeCase._id, 'Cancelled', false, session);
        return { releasedInventories };
      });
      await evaluateInventoryLifecycles(cancellationResult.releasedInventories);
      await writeAudit(customerId, 'EXCHANGE_CANCELLED', id, 'Customer cancelled before Carrier handoff');
      return load(id);
    },

    async expireRequest(actorId, id) {
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase) throw new ApiError(404, 'Exchange request not found');
      if (exchangeCase.status === 'Expired') return load(id, 'Staff', true);
      if (exchangeCase.status !== 'ApprovedAwaitingShipment' || exchangeCase.handoffAt) throw new ApiError(409, 'Only an unshipped approved Exchange can expire');
      const now = new Date(clock());
      if (!exchangeCase.shipByAt || now.getTime() <= new Date(exchangeCase.shipByAt).getTime()) throw new ApiError(409, 'Exchange handoff deadline has not expired');
      const expiryResult = await transactionManager.withTransaction(async (session) => {
        const expired = await repository.claimCase(id, ['ApprovedAwaitingShipment'], {
          status: 'Expired', terminalAt: now,
        }, session);
        if (!expired) throw new ApiError(409, 'Exchange changed before expiry could be recorded');
        const releasedInventories = await releaseReservations(id, actorId, 'Customer missed ShipByAt', session);
        await repository.releaseUnitClaims(id, session);
        await repository.releaseOrderLock(exchangeCase.orderId, exchangeCase._id, 'Expired', false, session);
        return { releasedInventories };
      });
      await evaluateInventoryLifecycles(expiryResult.releasedInventories);
      await writeAudit(actorId, 'EXCHANGE_EXPIRED', id, 'No timely Customer handoff');
      return load(id, 'Staff');
    },

    async expireOverdueRequests() {
      if (!repository.listOverdueCases) return { expired: 0 };
      const candidates = await repository.listOverdueCases(new Date(clock()), 100);
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

    async recordWarehouseReceipt(warehouseId, id, input = {}) {
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase) throw new ApiError(404, 'Exchange request not found');
      if (exchangeCase.warehouseReceiptIdempotencyKey === idempotencyKey) return load(id, 'Warehouse', true);
      if (exchangeCase.status !== 'CustomerShipped') throw new ApiError(409, 'Warehouse receipt requires CustomerShipped');
      const reference = String(input.evidenceReference || '').trim();
      if (!reference || reference.length > 256) throw new ApiError(400, 'Warehouse receipt evidence is required');
      const receivedAt = normalizeDate(input.receivedAt, 'receivedAt', clock);
      if (receivedAt.getTime() > new Date(clock()).getTime() + FUTURE_TOLERANCE_MS) {
        throw new ApiError(400, 'receivedAt cannot be in the future');
      }
      if (exchangeCase.handoffAt && receivedAt.getTime() < new Date(exchangeCase.handoffAt).getTime()) {
        throw new ApiError(400, 'receivedAt cannot be before Customer handoff');
      }
      const received = await repository.claimCase(id, ['CustomerShipped'], {
        status: 'WarehouseInspecting',
        warehouseReceivedAt: receivedAt,
        warehouseReceiptReference: reference,
        warehouseReceiptIdempotencyKey: idempotencyKey,
      });
      if (!received) throw new ApiError(409, 'Exchange changed before Warehouse receipt could be recorded');
      await writeAudit(warehouseId, 'EXCHANGE_WAREHOUSE_RECEIVED', id, reference);
      return load(id, 'Warehouse');
    },

    async finalizeInspection(warehouseId, id, input = {}) {
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase) throw new ApiError(404, 'Exchange request not found');
      if (exchangeCase.inspectionIdempotencyKey === idempotencyKey) return load(id, 'Warehouse', true);
      if (exchangeCase.status !== 'WarehouseInspecting') throw new ApiError(409, 'Only WarehouseInspecting Exchange can be finalized');
      const lines = await repository.listLines(id);
      if (!Array.isArray(input.lines) || input.lines.length !== lines.length) {
        throw new ApiError(400, 'Inspection must account for every requested Exchange line exactly once');
      }
      const lineById = new Map(lines.map((line) => [String(line._id), line]));
      const seen = new Set();
      const inspectedAt = new Date(clock());
      const normalized = input.lines.map((item) => {
        const line = lineById.get(String(item.exchangeLineId));
        if (!line || seen.has(String(line._id))) throw new ApiError(400, 'Each Exchange line must be inspected exactly once');
        seen.add(String(line._id));
        const values = [
          Number(item.receivedQuantity), Number(item.acceptedSellableQuantity),
          Number(item.acceptedDamagedQuantity), Number(item.rejectedQuantity),
        ];
        if (!values.every((value) => Number.isInteger(value) && value >= 0)) {
          throw new ApiError(400, 'Inspection quantities must be non-negative integers');
        }
        const [received, sellable, damaged, rejected] = values;
        if (received !== Number(line.requestedQuantity)) throw new ApiError(400, 'Received quantity must equal requested quantity');
        if (sellable + damaged + rejected !== received) throw new ApiError(400, 'Accepted and rejected quantities must equal received quantity');
        const inspectionReason = String(item.inspectionReason || '').trim();
        if (!inspectionReason) throw new ApiError(400, 'Every inspected line requires a Warehouse conclusion or reason');
        if (inspectionReason.length > 1000) throw new ApiError(400, 'Warehouse conclusion must not exceed 1000 characters');
        const rejectionReason = String(item.rejectionReason || (rejected > 0 ? inspectionReason : '')).trim();
        if (rejected > 0 && !rejectionReason) throw new ApiError(400, 'Rejected units require a reason');
        if (rejectionReason.length > 1000) throw new ApiError(400, 'Rejection reason must not exceed 1000 characters');
        const evidenceImages = evidenceVerifier(warehouseId, item.evidenceImages);
        return {
          line,
          received,
          sellable,
          damaged,
          rejected,
          inspectionReason,
          rejectionReason,
          evidenceImages,
        };
      });

      const updatedInventories = [];
      await transactionManager.withTransaction(async (session) => {
        const reservations = await repository.listReservations(id, session);
        const inspectionRecords = [];
        for (const item of normalized) {
          const reservation = reservations.find((entry) => String(entry.exchangeLineId) === String(item.line._id) && entry.status === 'Reserved');
          if (!reservation || Number(reservation.quantity) !== Number(item.line.requestedQuantity)) {
            throw new ApiError(409, 'Exact reservation is missing for an Exchange line');
          }
          const accepted = item.sellable + item.damaged;
          if (item.rejected > 0) {
            const released = await repository.releaseInventory(item.line.productId, item.rejected, warehouseId, session);
            if (!released) throw new ApiError(409, 'Reserved Inventory changed during inspection');
          }
          await repository.updateReservation(reservation._id, accepted > 0 ? {
            quantity: accepted,
          } : {
            quantity: Number(reservation.quantity),
            status: 'Released',
            releasedAt: inspectedAt,
            releaseReason: 'Warehouse rejected every requested unit',
          }, session);
          const receivedInventory = await repository.receiveInventory(item.line.productId, item.sellable, item.damaged, warehouseId, session);
          if (!receivedInventory) throw new ApiError(409, 'Inventory record is missing for accepted Exchange goods');
          updatedInventories.push(receivedInventory);
          let sellableMovementKey;
          if (item.sellable > 0) {
            const key = `${String(id)}:${String(item.line._id)}:EXCHANGE_RETURN_IN`;
            sellableMovementKey = key;
            await repository.createInventoryTransaction({
              productId: item.line.productId,
              orderId: exchangeCase.orderId,
              relatedCollection: 'ExchangeCase',
              relatedId: exchangeCase._id,
              performedBy: warehouseId,
              transactionType: 'EXCHANGE_RETURN_IN',
              quantity: item.sellable,
              beforeQuantity: Number(receivedInventory.stockQuantity) - item.sellable,
              afterQuantity: Number(receivedInventory.stockQuantity),
              reason: `Accepted sellable Exchange return for ${exchangeCase.requestCode}`,
              movementKey: key,
            }, session);
          }
          let damagedMovementKey;
          if (item.damaged > 0) {
            const key = `${String(id)}:${String(item.line._id)}:EXCHANGE_RETURN_DAMAGED_IN`;
            damagedMovementKey = key;
            await repository.createInventoryTransaction({
              productId: item.line.productId,
              orderId: exchangeCase.orderId,
              relatedCollection: 'ExchangeCase',
              relatedId: exchangeCase._id,
              performedBy: warehouseId,
              transactionType: 'EXCHANGE_RETURN_DAMAGED_IN',
              quantity: item.damaged,
              beforeQuantity: Number(receivedInventory.damagedQuantity) - item.damaged,
              afterQuantity: Number(receivedInventory.damagedQuantity),
              reason: `Accepted damaged Exchange return for ${exchangeCase.requestCode}`,
              movementKey: key,
            }, session);
          }
          await repository.updateLine(item.line._id, {
            receivedQuantity: item.received,
            acceptedSellableQuantity: item.sellable,
            acceptedDamagedQuantity: item.damaged,
            rejectedQuantity: item.rejected,
            inspectionReason: item.inspectionReason,
            rejectionReason: item.rejectionReason,
            rejectionEvidenceImages: item.evidenceImages,
          }, session);
          if (repository.updateUnitsForInspection) {
            await repository.updateUnitsForInspection(id, item.line._id, {
              sellableQuantity: item.sellable,
              damagedQuantity: item.damaged,
              sellableMovementKey,
              damagedMovementKey,
            }, session);
          }
          inspectionRecords.push({
            inspectionKey: `${String(id)}:${String(item.line._id)}:${idempotencyKey}`,
            exchangeCaseId: id,
            exchangeLineId: item.line._id,
            version: 1,
            receivedQuantity: item.received,
            acceptedSellableQuantity: item.sellable,
            acceptedDamagedQuantity: item.damaged,
            rejectedQuantity: item.rejected,
            inspectionReason: item.inspectionReason,
            rejectionReason: item.rejectionReason,
            evidenceImages: item.evidenceImages,
            inspectedBy: warehouseId,
            inspectedAt,
          });
        }
        await repository.createInspections(inspectionRecords, session);
        const finalized = await repository.claimCase(id, ['WarehouseInspecting'], {
          status: 'OutboundFulfillment',
          inspectionIdempotencyKey: idempotencyKey,
        }, session);
        if (!finalized) throw new ApiError(409, 'Exchange changed before Warehouse inspection could be finalized');
      });
      await evaluateInventoryLifecycles(updatedInventories);
      await writeAudit(warehouseId, 'EXCHANGE_INSPECTION_FINALIZED', id, 'Warehouse accounted for every requested unit');
      return load(id, 'Warehouse');
    },

    async createOutboundShipment(warehouseId, id, input = {}) {
      rejectForbiddenFields(input);
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase) throw new ApiError(404, 'Exchange request not found');
      const outboundBlockedCause = [
        'REJECTED_ORIGINAL_RECONCILIATION',
        'INCIDENT_RESEND_IN_TRANSIT',
      ].includes(exchangeCase.waitingFor);
      if (outboundBlockedCause
        || !['OutboundFulfillment', 'ReplacementShipped', 'DeliveryIncident'].includes(exchangeCase.status)) {
        throw new ApiError(409, 'Inspection must finalize before outbound shipment');
      }
      const shipmentKey = `${String(id)}:${idempotencyKey}`;
      if (repository.findShipmentByKey) {
        const existing = await repository.findShipmentByKey(shipmentKey);
        if (existing) {
          const suppliedShippedAt = input.shippedAt
            ? normalizeDate(input.shippedAt, 'shippedAt', clock)
            : null;
          if (String(existing.exchangeLineId) !== String(input.exchangeLineId)
            || existing.direction !== String(input.direction || '').toUpperCase()
            || Number(existing.quantity) !== Number(input.quantity)
            || existing.carrierName !== String(input.carrierName || '').trim()
            || existing.trackingCode !== String(input.trackingCode || '').trim()
            || (suppliedShippedAt
              && new Date(existing.shippedAt).getTime() !== suppliedShippedAt.getTime())) {
            throw new ApiError(409, 'Shipment idempotency key was used for a different outbound command');
          }
          return { shipment: existing, request: await load(id, 'Warehouse'), idempotentReplay: true };
        }
      }
      const lines = await repository.listLines(id);
      const line = lines.find((item) => String(item._id) === String(input.exchangeLineId));
      if (!line) throw new ApiError(400, 'Exchange line not found');
      const direction = String(input.direction || '').toUpperCase();
      if (!['REPLACEMENT_TO_CUSTOMER', 'REJECTED_ORIGINAL_TO_CUSTOMER'].includes(direction)) {
        throw new ApiError(400, 'Invalid outbound Exchange direction');
      }
      const expected = direction === 'REPLACEMENT_TO_CUSTOMER'
        ? Number(line.acceptedSellableQuantity || 0) + Number(line.acceptedDamagedQuantity || 0)
        : Number(line.rejectedQuantity || 0);
      const existingShipments = await repository.listShipments(id);
      const alreadyCommitted = existingShipments
        .filter((item) => String(item.exchangeLineId) === String(line._id)
          && item.direction === direction
          && !item.resendOfShipmentId)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const remaining = expected - alreadyCommitted;
      if (remaining <= 0) {
        throw new ApiError(409, 'The outbound line obligation was already fulfilled');
      }
      const quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity !== remaining || quantity <= 0) {
        throw new ApiError(400, 'Shipment quantity must equal the remaining authorized line obligation');
      }
      const carrierName = String(input.carrierName || '').trim();
      const trackingCode = String(input.trackingCode || '').trim();
      if (!carrierName || !trackingCode) throw new ApiError(400, 'Carrier and tracking code are required');
      if (carrierName.length > 120 || trackingCode.length > 160) {
        throw new ApiError(400, 'Carrier or tracking code is too long');
      }
      const shippedAt = normalizeDate(input.shippedAt, 'shippedAt', clock);
      if (shippedAt.getTime() > new Date(clock()).getTime() + FUTURE_TOLERANCE_MS) {
        throw new ApiError(400, 'shippedAt cannot be in the future');
      }
      if (exchangeCase.warehouseReceivedAt
        && shippedAt.getTime() < new Date(exchangeCase.warehouseReceivedAt).getTime()) {
        throw new ApiError(400, 'shippedAt cannot be before Warehouse receipt');
      }
      let shipment;
      let consumedInventory = null;
      await transactionManager.withTransaction(async (session) => {
        await assignmentCoordinator.coordinate({
          userId: warehouseId,
          expectedRole: 'WarehouseManager',
          session,
        });
        if (direction === 'REPLACEMENT_TO_CUSTOMER') {
          const reservations = await repository.listReservations(id, session);
          const reservation = reservations.find((item) => String(item.exchangeLineId) === String(line._id) && item.status === 'Reserved');
          if (!reservation || Number(reservation.quantity) !== quantity) throw new ApiError(409, 'Exact replacement reservation is missing');
          const before = await repository.findInventory(line.productId, session);
          const inventory = await repository.consumeInventory(line.productId, quantity, warehouseId, session);
          if (!before || !inventory) throw new ApiError(409, 'Reserved replacement stock changed before Shipment creation');
          consumedInventory = inventory;
          await repository.updateReservation(reservation._id, { status: 'Consumed', consumedAt: new Date(clock()) }, session);
          await repository.createInventoryTransaction({
            productId: line.productId,
            orderId: exchangeCase.orderId,
            relatedCollection: 'ExchangeCase',
            relatedId: exchangeCase._id,
            performedBy: warehouseId,
            transactionType: 'EXCHANGE_REPLACEMENT_OUT',
            quantity: -quantity,
            beforeQuantity: Number(before.stockQuantity),
            afterQuantity: Number(inventory.stockQuantity),
            reason: `Same-SKU replacement outbound for ${exchangeCase.requestCode}`,
            movementKey: `${String(id)}:${String(line._id)}:EXCHANGE_REPLACEMENT_OUT`,
          }, session);
        }
        shipment = await repository.createShipment({
          shipmentKey,
          obligationKey: `${String(id)}:${String(line._id)}:${direction}:INITIAL`,
          exchangeCaseId: id,
          exchangeLineId: line._id,
          direction,
          quantity,
          carrierName,
          trackingCode,
          status: 'InTransit',
          shippedAt,
          createdBy: warehouseId,
          resendOfShipmentId: null,
        }, session);
        if (direction === 'REPLACEMENT_TO_CUSTOMER' && exchangeCase.status !== 'DeliveryIncident') {
          const progressed = await repository.claimCase(
            id,
            [exchangeCase.status],
            { status: 'ReplacementShipped' },
            session
          );
          if (!progressed) throw new ApiError(409, 'Exchange changed while outbound Shipment was being created');
        }
      });
      await evaluateInventoryLifecycles(consumedInventory ? [consumedInventory] : []);
      await writeAudit(warehouseId, 'EXCHANGE_OUTBOUND_CREATED', id, `${direction} ${trackingCode}`);
      return { shipment, request: await load(id, 'Warehouse'), idempotentReplay: false };
    },

    async recordShipmentEvent(actorId, source, shipmentId, input = {}) {
      rejectForbiddenFields(input);
      const eventKey = normalizeIdempotencyKey(input.eventId || input.idempotencyKey, 'eventId');
      const eventType = String(input.eventType || '').toUpperCase();
      if (!['DELIVERED', 'LOST', 'DAMAGED', 'DISPUTED', 'CORRECTION'].includes(eventType)) {
        throw new ApiError(400, 'Invalid Shipment event type');
      }
      const evidenceReference = String(input.evidenceReference || '').trim();
      if (!evidenceReference) throw new ApiError(400, 'Shipment event evidence is required');
      if (evidenceReference.length > 256) throw new ApiError(400, 'Shipment event evidence reference is too long');
      const occurredAt = normalizeDate(input.occurredAt, 'occurredAt', clock);
      const note = String(input.note || '').trim();
      if (note.length > 1000) throw new ApiError(400, 'Shipment event note is too long');
      if (occurredAt.getTime() > new Date(clock()).getTime() + FUTURE_TOLERANCE_MS) {
        throw new ApiError(400, 'Shipment event cannot occur in the future');
      }
      const shipment = await repository.findShipmentById(shipmentId);
      if (!shipment) throw new ApiError(404, 'Exchange shipment not found');
      if (input.exchangeCaseId && String(input.exchangeCaseId) !== String(shipment.exchangeCaseId)) {
        throw new ApiError(404, 'Exchange shipment not found');
      }
      const eventCase = await repository.findCaseById(shipment.exchangeCaseId);
      if (!eventCase) throw new ApiError(404, 'Exchange request not found');
      if (source === 'CUSTOMER_DISPUTE'
        && String(eventCase.customerId) !== String(actorId)) {
        throw new ApiError(404, 'Exchange request not found');
      }
      const expectedEventFact = {
        exchangeCaseId: shipment.exchangeCaseId,
        shipmentId,
        eventType,
        source,
        actorId: actorId || null,
        evidenceReference,
        occurredAt,
        replacesEventId: input.replacesEventId || null,
        note,
      };
      const existing = await repository.findShipmentEventByKey(eventKey);
      if (existing) {
        assertShipmentEventReplay(existing, expectedEventFact);
        return shipmentEventResult(existing, source, true);
      }
      const isRawOutcome = ['DELIVERED', 'LOST', 'DAMAGED'].includes(eventType);
      if (TERMINAL_STATUSES.has(eventCase.status)
        && isRawOutcome) {
        throw new ApiError(409, 'A terminal Exchange cannot accept a new Shipment outcome');
      }
      if (isRawOutcome && shipment.status !== 'InTransit') {
        throw new ApiError(
          409,
          'A raw Shipment outcome requires InTransit status; later evidence must use an attributable correction'
        );
      }
      if (isRawOutcome
        && occurredAt.getTime() < new Date(shipment.shippedAt).getTime()) {
        throw new ApiError(400, 'Shipment outcome cannot occur before Shipment handoff');
      }
      let replacesEvent = null;
      if (['DISPUTED', 'CORRECTION'].includes(eventType)) {
        if (!input.replacesEventId) {
          throw new ApiError(400, `${eventType} must reference the Shipment event it disputes or corrects`);
        }
        replacesEvent = await repository.findShipmentEventById(input.replacesEventId);
        if (!replacesEvent || String(replacesEvent.shipmentId) !== String(shipment._id)) {
          throw new ApiError(400, 'Referenced Shipment event is invalid');
        }
        if (eventType === 'DISPUTED' && replacesEvent.eventType !== 'DELIVERED') {
          throw new ApiError(400, 'Customer can dispute only a delivered Shipment fact');
        }
      } else if (input.replacesEventId) {
        throw new ApiError(400, 'Only dispute or correction events may reference an earlier event');
      }
      let event;
      let completedCase = null;
      let outcomeShipment = shipment;
      let transactionReplay = false;
      try {
        await transactionManager.withTransaction(async (session) => {
          if (isRawOutcome) {
            const currentShipment = await repository.findShipmentById(shipmentId, session);
            if (!currentShipment
              || String(currentShipment.exchangeCaseId) !== String(eventCase._id)) {
              throw new ApiError(404, 'Exchange shipment not found');
            }
            const currentCase = await repository.findCaseById(currentShipment.exchangeCaseId, session);
            if (!currentCase) throw new ApiError(404, 'Exchange request not found');
            const committedWinner = await repository.findShipmentEventByKey(eventKey, session);
            if (committedWinner) {
              assertShipmentEventReplay(committedWinner, expectedEventFact);
              event = committedWinner;
              transactionReplay = true;
              return;
            }
            if (TERMINAL_STATUSES.has(currentCase.status)) {
              throw new ApiError(409, 'A terminal Exchange cannot accept a new Shipment outcome');
            }
            if (currentShipment.status !== 'InTransit') {
              throw new ApiError(
                409,
                'A raw Shipment outcome requires InTransit status; later evidence must use an attributable correction'
              );
            }
            if (occurredAt.getTime() < new Date(currentShipment.shippedAt).getTime()) {
              throw new ApiError(400, 'Shipment outcome cannot occur before Shipment handoff');
            }
            const serializedCase = await repository.touchShipmentOutcome(
              currentCase._id,
              ['OutboundFulfillment', 'ReplacementShipped', 'DeliveryIncident'],
              session
            );
            if (!serializedCase) {
              throw new ApiError(409, 'Exchange changed before the Shipment outcome could be recorded');
            }
            outcomeShipment = await repository.claimShipmentOutcome(
              currentShipment._id,
              'InTransit',
              eventType === 'DELIVERED'
                ? { status: 'Delivered', deliveredAt: occurredAt }
                : { status: 'Incident', incidentAt: occurredAt, incidentReason: eventType },
              session
            );
            if (!outcomeShipment) {
              throw new ApiError(
                409,
                'Shipment changed before the raw outcome was recorded; use an attributable correction'
              );
            }
          }
          event = await repository.createShipmentEvent({
            eventKey,
            exchangeCaseId: outcomeShipment.exchangeCaseId,
            shipmentId: outcomeShipment._id,
            eventType,
            source,
            occurredAt,
            evidenceReference,
            actorId: actorId || null,
            replacesEventId: replacesEvent?._id || null,
            note,
          }, session);
          if (eventType === 'DELIVERED') {
            if (outcomeShipment.direction === 'REPLACEMENT_TO_CUSTOMER') {
              await repository.updateDeliveredUnits(
                outcomeShipment.exchangeCaseId,
                outcomeShipment.exchangeLineId,
                Number(outcomeShipment.quantity),
                occurredAt,
                new Date(occurredAt.getTime() + EXCHANGE_WINDOW_MS),
                session
              );
            }
            completedCase = await reconcileCompletion(outcomeShipment.exchangeCaseId, session);
            if (!completedCase) await reconcileIncidentState(outcomeShipment.exchangeCaseId, session);
          } else if (['LOST', 'DAMAGED'].includes(eventType)) {
            const incidentCase = await repository.claimCase(outcomeShipment.exchangeCaseId, [
              'OutboundFulfillment', 'ReplacementShipped', 'DeliveryIncident',
            ], {
              status: 'DeliveryIncident',
              incidentReason: `${eventType}: ${String(input.note || evidenceReference).trim()}`,
              shippingPayer: 'SHOP',
              waitingFor: outcomeShipment.direction === 'REPLACEMENT_TO_CUSTOMER'
                ? 'INCIDENT_RESEND'
                : 'REJECTED_ORIGINAL_RECONCILIATION',
              incidentShipmentId: outcomeShipment._id,
            }, session);
            if (!incidentCase) throw new ApiError(409, 'Exchange changed before the Shipment incident could be recorded');
          }
          await writeAudit(
            actorId,
            `EXCHANGE_SHIPMENT_${eventType}`,
            outcomeShipment.exchangeCaseId,
            `${source}: ${evidenceReference}`,
            session,
            `EXCHANGE_SHIPMENT_${eventType}:${String(outcomeShipment.exchangeCaseId)}:${eventKey}`
          );
          if (completedCase) {
            await notifier.notify({
              userId: completedCase.customerId,
              type: 'EXCHANGE_COMPLETED',
              caseId: outcomeShipment.exchangeCaseId,
              caseCode: completedCase.requestCode,
            }, session);
          }
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const winner = await repository.findShipmentEventByKey(eventKey);
        if (!winner) throw error;
        assertShipmentEventReplay(winner, expectedEventFact);
        return shipmentEventResult(winner, source, true);
      }
      return shipmentEventResult(event, source, transactionReplay);
    },

    async recordStaffShipmentEvent(staffId, caseId, shipmentId, input = {}) {
      return service.recordShipmentEvent(staffId, 'STAFF_EVIDENCE', shipmentId, { ...input, exchangeCaseId: caseId });
    },

    async reportShipmentDispute(customerId, caseId, shipmentId, input = {}) {
      const exchangeCase = await repository.findCaseById(caseId);
      if (!exchangeCase || String(exchangeCase.customerId) !== String(customerId)) {
        throw new ApiError(404, 'Exchange request not found');
      }
      return service.recordShipmentEvent(customerId, 'CUSTOMER_DISPUTE', shipmentId, {
        ...input,
        eventType: 'DISPUTED',
        exchangeCaseId: caseId,
      });
    },

    async recordCarrierShipmentEvent(shipmentId, input = {}) {
      return service.recordShipmentEvent(null, 'CARRIER', shipmentId, input);
    },

    async resendReplacement(staffId, id, input = {}) {
      rejectForbiddenFields(input);
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      const exchangeCase = await repository.findCaseById(id);
      if (!exchangeCase) throw new ApiError(404, 'Exchange request not found');
      const incidentShipment = await repository.findShipmentById(input.incidentShipmentId);
      if (!incidentShipment
        || String(incidentShipment.exchangeCaseId) !== String(id)
        || incidentShipment.direction !== 'REPLACEMENT_TO_CUSTOMER') {
        throw new ApiError(400, 'A matching replacement incident Shipment is required');
      }
      const shipmentKey = `${String(id)}:resend:${idempotencyKey}`;
      if (repository.findShipmentByKey) {
        const existing = await repository.findShipmentByKey(shipmentKey);
        if (existing) {
          const suppliedShippedAt = input.shippedAt
            ? normalizeDate(input.shippedAt, 'shippedAt', clock)
            : null;
          if (String(existing.resendOfShipmentId || '') !== String(input.incidentShipmentId || '')
            || existing.carrierName !== String(input.carrierName || '').trim()
            || existing.trackingCode !== String(input.trackingCode || '').trim()
            || (suppliedShippedAt
              && new Date(existing.shippedAt).getTime() !== suppliedShippedAt.getTime())) {
            throw new ApiError(409, 'Resend idempotency key was used for a different command');
          }
          return { shipment: existing, request: await load(id, 'Staff'), idempotentReplay: true };
        }
      }
      const canResendNow = exchangeCase.status === 'DeliveryIncident'
        || (exchangeCase.status === 'WaitingForExactStock'
          && exchangeCase.waitingFor === 'INCIDENT_RESEND');
      if (!canResendNow) throw new ApiError(409, 'Only a delivery incident can create a replacement resend');
      const activeLeaves = activeIncidentLeaves(await repository.listShipments(id));
      const activeIncident = activeLeaves.find((shipment) => (
        String(shipment._id) === String(incidentShipment._id)
        && shipment.direction === 'REPLACEMENT_TO_CUSTOMER'
        && shipment.status === 'Incident'
      ));
      if (!activeIncident) {
        throw new ApiError(409, 'Only an active replacement incident leaf can create a resend');
      }
      const carrierName = String(input.carrierName || '').trim();
      const trackingCode = String(input.trackingCode || '').trim();
      if (!carrierName || !trackingCode) throw new ApiError(400, 'Carrier and tracking code are required for resend');
      if (carrierName.length > 120 || trackingCode.length > 160) {
        throw new ApiError(400, 'Carrier or tracking code is too long');
      }
      const shippedAt = normalizeDate(input.shippedAt, 'shippedAt', clock);
      if (shippedAt.getTime() > new Date(clock()).getTime() + FUTURE_TOLERANCE_MS) {
        throw new ApiError(400, 'shippedAt cannot be in the future');
      }
      if (incidentShipment.incidentAt
        && shippedAt.getTime() < new Date(incidentShipment.incidentAt).getTime()) {
        throw new ApiError(400, 'Resend cannot be handed off before the recorded incident');
      }
      const quantity = Number(incidentShipment.quantity);
      const lines = await repository.listLines(id);
      const line = lines.find((item) => String(item._id) === String(incidentShipment.exchangeLineId));
      if (!line) throw new ApiError(409, 'Incident Exchange line is missing');
      let shipment;
      let consumedInventory = null;
      try {
        await transactionManager.withTransaction(async (session) => {
          await assignmentCoordinator.coordinate({
            userId: staffId,
            expectedRole: 'Staff',
            session,
          });
          const currentActiveLeaves = activeIncidentLeaves(
            await repository.listShipments(id, session)
          );
          const currentIncident = currentActiveLeaves.find((candidate) => (
            String(candidate._id) === String(incidentShipment._id)
            && candidate.direction === 'REPLACEMENT_TO_CUSTOMER'
            && candidate.status === 'Incident'
          ));
          if (!currentIncident) {
            throw new ApiError(409, 'Replacement incident changed before resend creation');
          }
          const reserved = await repository.reserveInventory(line.productId, quantity, staffId, session);
          if (!reserved) throw new NoExactStockError(line.productId);
          const [reservation] = await repository.createReservations([{
            reservationKey: `${String(id)}:${String(line._id)}:resend:${idempotencyKey}`,
            exchangeCaseId: id,
            exchangeLineId: line._id,
            productId: line.productId,
            quantity,
            status: 'Reserved',
            reservedAt: new Date(clock()),
          }], session);
          const before = await repository.findInventory(line.productId, session);
          const consumed = await repository.consumeInventory(line.productId, quantity, staffId, session);
          if (!before || !consumed) throw new ApiError(409, 'Resend reservation changed before Shipment creation');
          consumedInventory = consumed;
          await repository.updateReservation(reservation._id, { status: 'Consumed', consumedAt: new Date(clock()) }, session);
          await repository.createInventoryTransaction({
            productId: line.productId,
            orderId: exchangeCase.orderId,
            relatedCollection: 'ExchangeCase',
            relatedId: exchangeCase._id,
            performedBy: staffId,
            transactionType: 'EXCHANGE_REPLACEMENT_OUT',
            quantity: -quantity,
            beforeQuantity: Number(before.stockQuantity),
            afterQuantity: Number(consumed.stockQuantity),
            reason: `Shop-responsibility exact-SKU resend for ${exchangeCase.requestCode}`,
            movementKey: `${String(id)}:${String(line._id)}:EXCHANGE_RESEND_OUT:${idempotencyKey}`,
          }, session);
          shipment = await repository.createShipment({
            shipmentKey,
            obligationKey: `${String(id)}:${String(line._id)}:RESEND:${String(incidentShipment._id)}`,
            exchangeCaseId: id,
            exchangeLineId: line._id,
            direction: 'REPLACEMENT_TO_CUSTOMER',
            quantity,
            carrierName,
            trackingCode,
            status: 'InTransit',
            shippedAt,
            createdBy: staffId,
            resendOfShipmentId: incidentShipment._id,
          }, session);
          const progressed = await repository.claimCase(id, [
            'DeliveryIncident', 'WaitingForExactStock',
          ], {
            status: 'DeliveryIncident',
            incidentReason: '',
            shippingPayer: 'SHOP',
            waitingFor: 'INCIDENT_RESEND_IN_TRANSIT',
            incidentShipmentId: shipment._id,
            stockFailureReason: '',
          }, session);
          if (!progressed) throw new ApiError(409, 'Exchange changed while the replacement resend was being created');
        });
      } catch (error) {
        if (!(error instanceof NoExactStockError)) throw error;
        const waiting = await repository.claimCase(id, [
          'DeliveryIncident', 'WaitingForExactStock',
        ], {
          status: 'AwaitingExactStockChoice',
          stockFailureReason: error.message,
          shippingPayer: 'SHOP',
          waitingFor: 'INCIDENT_RESEND',
          incidentShipmentId: incidentShipment._id,
        });
        if (!waiting) throw new ApiError(409, 'Exchange changed while resend stock was being checked');
        await writeAudit(staffId, 'EXCHANGE_RESEND_NO_STOCK', id, error.message);
        return { shipment: null, request: await load(id, 'Staff'), idempotentReplay: false };
      }
      await evaluateInventoryLifecycles(consumedInventory ? [consumedInventory] : []);
      await writeAudit(staffId, 'EXCHANGE_RESEND_CREATED', id, `${trackingCode}; Shop responsibility`);
      return { shipment, request: await load(id, 'Staff'), idempotentReplay: false };
    },
  };

  return service;
}

module.exports = {
  createExchangeService,
  exchangeService: createExchangeService({ lowStockLifecycle: lowStockAlertLifecycle }),
  createModelRepository,
  createModelTransactionManager,
  EXCHANGE_WINDOW_MS,
  SHIP_WINDOW_MS,
};
