const mongoose = require('mongoose');

const CodDiscrepancy = require('../models/codDiscrepancy.model');
const CodEvidence = require('../models/codEvidence.model');
const DeliveryIncident = require('../models/deliveryIncident.model');
const DomainOutbox = require('../models/domainOutbox.model');
const FulfillmentCycle = require('../models/fulfillmentCycle.model');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const OrderReservation = require('../models/orderReservation.model');
const PackingRecord = require('../models/packingRecord.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const RefundPending = require('../models/refundPending.model');
const ReturnedParcelReceipt = require('../models/returnedParcelReceipt.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const Shipment = require('../models/shipment.model');
const ShipmentDestinationVersion = require('../models/shipmentDestinationVersion.model');
const ShipmentEvent = require('../models/shipmentEvent.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const { logAudit } = require('../utils/auditLogger');
const {
  assignmentCoordinator: defaultAssignmentCoordinator,
} = require('./assignmentCoordination.service');
const { createDeliveryResolutionService } = require('./deliveryResolution.service');
const { createFulfillmentCommandService } = require('./fulfillmentCommand.service');
const { notificationService } = require('./notification.service');

const FULFILLMENT_NOTIFICATION_EVENT_TYPES = [
  'ORDER_SHIPPED',
  'DELIVERY_ATTEMPT_FAILED',
  'DELIVERY_RESCHEDULED',
  'ORDER_DELIVERED',
  'DELIVERY_FAILED',
];

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

async function createOne(Model, data, session) {
  const [created] = await Model.create([data], session ? { session } : undefined);
  return created.toObject();
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

function createModelRepository() {
  return {
    async findOrderById(id, session) {
      return withOptionalSession(Order.findById(id), session).lean();
    },
    async listOrderDetails(orderId, session) {
      return withOptionalSession(OrderDetail.find({ orderId }).sort({ createdAt: 1 }), session).lean();
    },
    async claimOrderState(id, expectedStatus, patch, session) {
      return withOptionalSession(Order.findOneAndUpdate(
        { _id: id, orderStatus: expectedStatus },
        { $set: patch },
        { new: true, runValidators: true },
      ), session).lean();
    },

    async findActiveCycleByOrder(orderId, session) {
      return withOptionalSession(
        FulfillmentCycle.findOne({ orderId }).sort({ cycleNumber: -1 }),
        session,
      ).lean();
    },
    async findCycleById(id, session) {
      return withOptionalSession(FulfillmentCycle.findById(id), session).lean();
    },
    async listCyclesByOrder(orderId, session) {
      return withOptionalSession(
        FulfillmentCycle.find({ orderId }).sort({ cycleNumber: 1 }),
        session,
      ).lean();
    },
    async updateCycle(id, patch, session) {
      return withOptionalSession(FulfillmentCycle.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async createFulfillmentCycle(data, session) {
      return createOne(FulfillmentCycle, data, session);
    },

    async findCompletedExportByCycle(cycleId, session) {
      return withOptionalSession(
        StockExportRequest.findOne({ cycleId, status: 'Completed' }),
        session,
      ).lean();
    },
    async createStockExportRequest(data, session) {
      return createOne(StockExportRequest, data, session);
    },

    async findPackingByCommandKey(commandKey, session) {
      return withOptionalSession(PackingRecord.findOne({ commandKey }), session).lean();
    },
    async findCompletedPackingByCycle(cycleId, session) {
      return withOptionalSession(
        PackingRecord.findOne({ cycleId, status: 'Completed' }),
        session,
      ).lean();
    },
    async createPackingRecord(data, session) {
      return createOne(PackingRecord, data, session);
    },

    async findDestinationByKey(versionKey, session) {
      return withOptionalSession(
        ShipmentDestinationVersion.findOne({ versionKey }),
        session,
      ).lean();
    },
    async listDestinationVersions(cycleId, session) {
      return withOptionalSession(
        ShipmentDestinationVersion.find({ cycleId }).sort({ version: 1 }),
        session,
      ).lean();
    },
    async createDestinationVersion(data, session) {
      return createOne(ShipmentDestinationVersion, data, session);
    },

    async findShipmentByCommandKey(commandKey, session) {
      return withOptionalSession(Shipment.findOne({ commandKey }), session).lean();
    },
    async findShipmentById(id, session) {
      return withOptionalSession(Shipment.findById(id), session).lean();
    },
    async findShipmentByCycle(cycleId, session) {
      return withOptionalSession(Shipment.findOne({ cycleId }), session).lean();
    },
    async listShipmentsAwaitingReturnedReceipt(session) {
      return withOptionalSession(
        Shipment.find({ status: 'ReturnedToShop' }).sort({ updatedAt: 1, _id: 1 }),
        session,
      ).lean();
    },
    async createShipment(data, session) {
      return createOne(Shipment, data, session);
    },
    async updateShipment(id, patch, session) {
      return withOptionalSession(Shipment.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, runValidators: true },
      ), session).lean();
    },

    async findEventByKey(eventKey, session) {
      return withOptionalSession(ShipmentEvent.findOne({ eventKey }), session).lean();
    },
    async findEventById(id, session) {
      return withOptionalSession(ShipmentEvent.findById(id), session).lean();
    },
    async listShipmentEvents(shipmentId, session) {
      return withOptionalSession(
        ShipmentEvent.find({ shipmentId }).sort({ occurredAt: 1, _id: 1 }),
        session,
      ).lean();
    },
    async createShipmentEvent(data, session) {
      return createOne(ShipmentEvent, data, session);
    },

    async createOutbox(data, session) {
      return withOptionalSession(DomainOutbox.findOneAndUpdate(
        { identityKey: data.identityKey },
        { $setOnInsert: data },
        { new: true, upsert: true, runValidators: true },
      ), session).lean();
    },
    async listPendingPostCommitWork(eventTypes, staleBefore, session) {
      return withOptionalSession(
        DomainOutbox.find({
          eventType: { $in: eventTypes },
          payloadSchemaVersion: { $ne: 1 },
          $or: [
            { status: { $in: ['Pending', 'Failed'] } },
            { status: 'Processing', processingStartedAt: { $lte: staleBefore } },
          ],
        }).sort({ createdAt: 1, _id: 1 }),
        session,
      ).lean();
    },
    async claimPostCommitWork(id, staleBefore, now, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          {
            _id: id,
            payloadSchemaVersion: { $ne: 1 },
            $or: [
              { status: { $in: ['Pending', 'Failed'] } },
              { status: 'Processing', processingStartedAt: { $lte: staleBefore } },
            ],
          },
          {
            $set: { status: 'Processing', processingStartedAt: now, lastError: '' },
            $inc: { attemptCount: 1 },
          },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async markPostCommitWorkDone(id, processingStartedAt, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          { _id: id, status: 'Processing', processingStartedAt },
          {
            $set: {
              status: 'Completed',
              completedAt: new Date(),
              processingStartedAt: null,
              lastError: '',
            },
          },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async markPostCommitWorkFailed(id, processingStartedAt, error, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          { _id: id, status: 'Processing', processingStartedAt },
          {
            $set: {
              status: 'Failed',
              processingStartedAt: null,
              lastError: String(error?.message || error || ''),
            },
          },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },

    async findCodDiscrepancyByOrder(orderId, session) {
      return withOptionalSession(CodDiscrepancy.findOne({ orderId }), session).lean();
    },
    async upsertCodDiscrepancy(data, session) {
      return withOptionalSession(CodDiscrepancy.findOneAndUpdate(
        { orderId: data.orderId },
        { $setOnInsert: data },
        { new: true, upsert: true, runValidators: true },
      ), session).lean();
    },
    async createCodEvidence(data, session) {
      return createOne(CodEvidence, data, session);
    },

    async findPaymentByOrderId(orderId, session) {
      return withOptionalSession(Payment.findOne({ orderId }), session).lean();
    },
    async updatePayment(id, patch, session) {
      return withOptionalSession(Payment.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async findPrimaryPaymentAttemptByOrder(orderId, session) {
      return withOptionalSession(
        PaymentAttempt.findOne({ orderId }).sort({ createdAt: 1, _id: 1 }),
        session,
      ).lean();
    },
    async findPrimaryPaidPaymentAttemptByOrder(orderId, session) {
      return withOptionalSession(
        PaymentAttempt.findOne({ orderId, paymentStatus: 'Paid' })
          .sort({ paidAt: 1, createdAt: 1, _id: 1 }),
        session,
      ).lean();
    },
    async updatePaymentAttempt(id, patch, session) {
      return withOptionalSession(PaymentAttempt.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, runValidators: true },
      ), session).lean();
    },

    async findIncidentBySourceEvent(sourceEventId, session) {
      return withOptionalSession(DeliveryIncident.findOne({ sourceEventId }), session).lean();
    },
    async findIncidentById(id, session) {
      return withOptionalSession(DeliveryIncident.findById(id), session).lean();
    },
    async findIncidentByShipment(shipmentId, session) {
      return withOptionalSession(
        DeliveryIncident.findOne({ shipmentId, incidentType: 'ReturnedToShop' }),
        session,
      ).lean();
    },
    async createIncident(data, session) {
      return createOne(DeliveryIncident, data, session);
    },
    async updateIncident(id, patch, session) {
      return withOptionalSession(DeliveryIncident.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async listIncidentsByOrder(orderId, session) {
      return withOptionalSession(
        DeliveryIncident.find({ orderId }).sort({ createdAt: 1 }),
        session,
      ).lean();
    },

    async findReceiptByKey(receiptKey, session) {
      return withOptionalSession(ReturnedParcelReceipt.findOne({ receiptKey }), session).lean();
    },
    async findReceiptByShipment(shipmentId, session) {
      return withOptionalSession(ReturnedParcelReceipt.findOne({ shipmentId }), session).lean();
    },
    async createReturnedReceipt(data, session) {
      return createOne(ReturnedParcelReceipt, data, session);
    },

    async findInventoryByProductId(productId, session) {
      return withOptionalSession(Inventory.findOne({ productId }), session).lean();
    },
    async addReturnedInventory(id, sellable, damaged, userId, session) {
      return withOptionalSession(Inventory.findOneAndUpdate(
        { _id: id, inventoryHealth: { $ne: 'ReconciliationRequired' } },
        {
          $inc: {
            stockQuantity: sellable,
            sellableQuantity: sellable,
            damagedQuantity: damaged,
          },
          $set: { lastUpdatedBy: userId },
        },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async reserveInventory(productId, quantity, userId, session) {
      return withOptionalSession(Inventory.findOneAndUpdate(
        {
          productId,
          inventoryHealth: 'Normal',
          $expr: {
            $gte: [
              { $subtract: [{ $ifNull: ['$sellableQuantity', '$stockQuantity'] }, '$reservedQuantity'] },
              quantity,
            ],
          },
        },
        {
          $inc: { reservedQuantity: quantity },
          $set: { lastUpdatedBy: userId },
        },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async createInventoryTransaction(data, session) {
      return createOne(InventoryTransaction, data, session);
    },
    async createOrderReservation(data, session) {
      return createOne(OrderReservation, data, session);
    },

    async upsertRefundRequest(data, session) {
      return withOptionalSession(ReturnRefundRequest.findOneAndUpdate(
        { orderId: data.orderId, obligationKey: data.obligationKey },
        { $setOnInsert: data },
        { new: true, upsert: true, runValidators: true },
      ), session).lean();
    },
    async findRefundRequestByObligationKey(obligationKey, session) {
      return withOptionalSession(
        ReturnRefundRequest.findOne({ obligationKey }),
        session,
      ).lean();
    },
    async upsertRefundPending(data, session) {
      return withOptionalSession(RefundPending.findOneAndUpdate(
        { obligationKey: data.obligationKey },
        { $setOnInsert: data },
        { new: true, upsert: true, runValidators: true },
      ), session).lean();
    },
    async findRefundPendingByObligationKey(obligationKey, session) {
      return withOptionalSession(
        RefundPending.findOne({ obligationKey }),
        session,
      ).lean();
    },
  };
}

function createFulfillmentService(options = {}) {
  const dependencies = {
    repository: options.repository || createModelRepository(),
    transactionManager: options.transactionManager || createModelTransactionManager(),
    auditLogger: options.auditLogger || { log: logAudit },
    assignmentCoordinator: options.assignmentCoordinator || defaultAssignmentCoordinator,
    clock: options.clock || (() => new Date()),
    runtime: options.runtime || process.env.NODE_ENV || 'development',
    operationalEvidenceClaim: options.operationalEvidenceClaim || null,
  };
  const notificationPublisher = options.notificationPublisher || notificationService;

  async function runPostCommitWork(item) {
    if (!FULFILLMENT_NOTIFICATION_EVENT_TYPES.includes(item.eventType)) return;
    const order = await dependencies.repository.findOrderById(item.payload?.orderId);
    if (!order) throw new Error(`Fulfillment notification Order not found: ${item.payload?.orderId || ''}`);
    const orderCode = order.orderCode || String(order._id);
    await notificationPublisher.createInAppNotification({
      userId: order.customerId,
      type: item.eventType,
      displayValues: { orderCode },
      eventId: `FULFILLMENT:${String(item.identityKey)}`,
      targetCollection: 'Order',
      targetId: order._id,
    });
  }

  async function drainPostCommitWork() {
    if (!dependencies.repository.listPendingPostCommitWork) return;
    const startedAt = new Date(dependencies.clock());
    const staleBefore = new Date(startedAt.getTime() - 60_000);
    const items = await dependencies.repository.listPendingPostCommitWork(
      FULFILLMENT_NOTIFICATION_EVENT_TYPES,
      staleBefore,
    );
    for (const item of items) {
      const claimed = item._id && dependencies.repository.claimPostCommitWork
        ? await dependencies.repository.claimPostCommitWork(
          item._id,
          staleBefore,
          new Date(dependencies.clock()),
        )
        : item;
      if (!claimed) continue;
      try {
        await runPostCommitWork(claimed);
        if (claimed._id && dependencies.repository.markPostCommitWorkDone) {
          await dependencies.repository.markPostCommitWorkDone(
            claimed._id,
            claimed.processingStartedAt,
          );
        }
      } catch (error) {
        if (claimed._id && dependencies.repository.markPostCommitWorkFailed) {
          try {
            await dependencies.repository.markPostCommitWorkFailed(
              claimed._id,
              claimed.processingStartedAt,
              error,
            );
          } catch {
            // A stale Processing lease is independently reclaimable on a later drain.
          }
        }
      }
    }
  }

  async function buildFulfillmentProjection(
    customerId,
    orderId,
    { includeOperationalEvidence = false } = {},
  ) {
    const order = await dependencies.repository.findOrderById(orderId);
    if (!order) {
      const ApiError = require('../utils/apiError');
      throw new ApiError(404, 'Order not found');
    }
    if (String(order.customerId) !== String(customerId)) {
      const ApiError = require('../utils/apiError');
      throw new ApiError(403, 'Order is not owned by this Customer');
    }
    const cycles = await dependencies.repository.listCyclesByOrder(orderId);
    const cycleViews = [];
    for (const cycle of cycles) {
      const shipment = await dependencies.repository.findShipmentByCycle(cycle._id);
      const [events, destinations] = shipment
        ? await Promise.all([
          dependencies.repository.listShipmentEvents(shipment._id),
          dependencies.repository.listDestinationVersions(cycle._id),
        ])
        : [[], await dependencies.repository.listDestinationVersions(cycle._id)];
      cycleViews.push({
        id: String(cycle._id),
        cycleNumber: cycle.cycleNumber,
        cycleType: cycle.cycleType,
        status: cycle.status,
        shipment: shipment ? {
          id: String(shipment._id),
          carrierName: shipment.carrierName,
          trackingReference: shipment.trackingReference,
          status: shipment.status,
          handedOffAt: shipment.handedOffAt,
          deliveredAt: shipment.deliveredAt,
          note: shipment.note || '',
        } : null,
        events: events.map((event) => ({
          id: String(event._id),
          eventType: event.eventType,
          source: event.source,
          occurredAt: event.occurredAt,
          reason: event.reason || '',
          hasEvidence: Boolean(event.evidenceReference),
          ...(includeOperationalEvidence ? {
            evidenceReferences: Array.isArray(event.evidenceReferences)
              ? event.evidenceReferences
              : [],
          } : {}),
        })),
        destinations: destinations.map((destination) => ({
          id: String(destination._id),
          version: destination.version,
          receiverName: destination.receiverName,
          receiverPhone: destination.receiverPhone,
          shippingAddress: destination.shippingAddress,
          confirmationSource: destination.confirmationSource,
        })),
      });
    }
    const incidents = await dependencies.repository.listIncidentsByOrder(orderId);
    const details = await dependencies.repository.listOrderDetails(orderId);
    let exactResendStockAvailable = details.length > 0;
    for (const detail of details) {
      const inventory = await dependencies.repository.findInventoryByProductId(detail.productId);
      const available = Number(inventory?.sellableQuantity ?? inventory?.stockQuantity ?? 0)
        - Number(inventory?.reservedQuantity || 0);
      if (
        !inventory
        || inventory.inventoryHealth !== 'Normal'
        || available < Number(detail.quantity)
      ) {
        exactResendStockAvailable = false;
        break;
      }
    }
    return {
      order: {
        id: String(order._id),
        orderCode: order.orderCode,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        deliveredAt: order.deliveredAt,
        returnDeadlineAt: order.returnDeadlineAt,
        exchangeDeadlineAt: order.exchangeDeadlineAt,
      },
      cycles: cycleViews,
      incidents: incidents.map((incident) => ({
        id: String(incident._id),
        incidentType: incident.incidentType,
        status: incident.status,
        customerChoice: incident.customerChoice,
        irrecoverable: incident.irrecoverable,
        availableChoices: incident.status === 'AwaitingCustomerChoice'
          ? (
            exactResendStockAvailable
              ? ['Resend', 'TerminalRefund']
              : ['Wait', 'TerminalRefund']
          )
          : (
            incident.status === 'WaitingForStock'
              ? (
                exactResendStockAvailable
                  ? ['Resend', 'TerminalRefund']
                  : ['TerminalRefund']
              )
              : []
          ),
      })),
      trackingMode: 'Recorded carrier events; live location is not available',
    };
  }

  async function getCustomerFulfillment(customerId, orderId) {
    return buildFulfillmentProjection(customerId, orderId);
  }

  async function getStaffFulfillment(orderId) {
    const order = await dependencies.repository.findOrderById(orderId);
    if (!order) {
      const ApiError = require('../utils/apiError');
      throw new ApiError(404, 'Order not found');
    }
    const projection = await buildFulfillmentProjection(
      order.customerId,
      orderId,
      { includeOperationalEvidence: true },
    );
    return {
      ...projection,
      capabilities: {
        manualCodReconciliation: dependencies.runtime !== 'production',
      },
    };
  }

  async function listReturnedParcels() {
    const shipments = await dependencies.repository.listShipmentsAwaitingReturnedReceipt();
    const items = [];
    for (const shipment of shipments) {
      if (await dependencies.repository.findReceiptByShipment(shipment._id)) continue;
      const [order, details, events] = await Promise.all([
        dependencies.repository.findOrderById(shipment.orderId),
        dependencies.repository.listOrderDetails(shipment.orderId),
        dependencies.repository.listShipmentEvents(shipment._id),
      ]);
      if (!order || !details.length) continue;
      const returnEvent = [...events]
        .reverse()
        .find((event) => event.eventType === 'RETURNED_TO_SHOP');
      items.push({
        shipmentId: String(shipment._id),
        orderId: String(order._id),
        orderCode: order.orderCode,
        cycleId: String(shipment.cycleId),
        carrierName: shipment.carrierName,
        trackingReference: shipment.trackingReference,
        returnedAt: returnEvent?.occurredAt || null,
        returnEvidenceAvailable: Boolean(returnEvent?.evidenceReference),
        lines: details.map((detail) => ({
          orderDetailId: String(detail._id),
          productId: String(detail.productId),
          productName: detail.productNameSnapshot || '',
          productSku: detail.productSkuSnapshot || '',
          expectedQuantity: Number(detail.quantity),
        })),
      });
    }
    return { items, total: items.length };
  }

  return {
    ...createFulfillmentCommandService(dependencies),
    ...createDeliveryResolutionService(dependencies),
    getCustomerFulfillment,
    getStaffFulfillment,
    listReturnedParcels,
    drainPostCommitWork,
  };
}

const fulfillmentService = createFulfillmentService();

module.exports = {
  createFulfillmentService,
  createModelRepository,
  fulfillmentService,
};
