const { createHash } = require('node:crypto');
const mongoose = require('mongoose');

const ApiError = require('../utils/apiError');
const AuditLog = require('../models/auditLog.model');
const CustomerDeliveryReceipt = require('../models/customerDeliveryReceipt.model');
const DomainOutbox = require('../models/domainOutbox.model');
const Order = require('../models/order.model');
const Shipment = require('../models/shipment.model');
const ShipmentEvent = require('../models/shipmentEvent.model');

const DAY_MS = 24 * 60 * 60 * 1000;
const AFTER_SALES_DAYS = 5;
const TERMINAL_SHIPMENT_STATUSES = ['Delivered', 'ReturnedToShop', 'Lost', 'Damaged'];
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{7,159}$/;

function sameId(left, right) {
  return String(left || '') === String(right || '');
}

function normalizedReason(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function commandHash({ orderId, outcome, expectedDeliveryEventId, reason }) {
  return createHash('sha256').update(JSON.stringify({
    orderId: String(orderId),
    outcome,
    expectedDeliveryEventId: String(expectedDeliveryEventId),
    reason,
  })).digest('hex');
}

function safeDecision(decision) {
  if (!decision) return null;
  return {
    _id: decision._id,
    orderId: decision.orderId,
    customerId: decision.customerId,
    shipmentId: decision.shipmentId,
    deliveryEventId: decision.deliveryEventId,
    outcome: decision.outcome,
    reason: decision.reason || '',
    supersedesId: decision.supersedesId || null,
    respondedAt: decision.respondedAt,
    exchangeDeadlineAt: decision.exchangeDeadlineAt || null,
    returnDeadlineAt: decision.returnDeadlineAt || null,
  };
}

function typedError(statusCode, errorCode, message, data = null) {
  return new ApiError(statusCode, message, [], errorCode, data);
}

function validateCommand(input = {}) {
  const outcome = String(input.outcome || '').trim().toUpperCase();
  const expectedDeliveryEventId = String(input.expectedDeliveryEventId || '').trim();
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  const reason = normalizedReason(input.reason);

  if (!['RECEIVED', 'NOT_RECEIVED'].includes(outcome)) {
    throw typedError(422, 'DELIVERY_RECEIPT_OUTCOME_INVALID', 'Delivery receipt outcome is invalid');
  }
  if (!expectedDeliveryEventId) {
    throw typedError(
      422,
      'DELIVERY_EVENT_REQUIRED',
      'The delivered shipment event must be supplied',
    );
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw typedError(
      422,
      'IDEMPOTENCY_KEY_INVALID',
      'Idempotency key must contain 8 to 160 safe characters',
    );
  }
  if (outcome === 'NOT_RECEIVED' && (reason.length < 10 || reason.length > 500)) {
    throw typedError(
      422,
      'NOT_RECEIVED_REASON_INVALID',
      'A non-receipt reason between 10 and 500 characters is required',
    );
  }
  if (outcome === 'RECEIVED' && reason) {
    throw typedError(
      422,
      'DELIVERY_RECEIPT_REASON_NOT_ALLOWED',
      'A reason is only accepted for a non-receipt decision',
    );
  }

  return {
    outcome,
    expectedDeliveryEventId,
    idempotencyKey,
    reason,
  };
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function createModelRepository() {
  return {
    async findOwnedOrder(customerId, orderId, session) {
      return withSession(Order.findOne({ _id: orderId, customerId }), session).lean();
    },
    async findLatestTerminalShipment(orderId, session) {
      return withSession(
        Shipment.findOne({ orderId, status: { $in: TERMINAL_SHIPMENT_STATUSES } })
          .sort({ createdAt: -1, _id: -1 }),
        session,
      ).lean();
    },
    async findShipmentEvent(eventId, session) {
      return withSession(ShipmentEvent.findById(eventId), session).lean();
    },
    async findByCommand(customerId, idempotencyKey, session) {
      return withSession(
        CustomerDeliveryReceipt.findOne({ customerId, idempotencyKey }),
        session,
      ).lean();
    },
    async findTerminalReceived(orderId, session) {
      return withSession(
        CustomerDeliveryReceipt.findOne({ orderId, outcome: 'RECEIVED' }),
        session,
      ).lean();
    },
    async findLatestDecision(orderId, session) {
      return withSession(
        CustomerDeliveryReceipt.findOne({ orderId }).sort({ respondedAt: -1, _id: -1 }),
        session,
      ).lean();
    },
    async createDecision(data, session) {
      const [created] = await CustomerDeliveryReceipt.create([data], { session });
      return created.toObject();
    },
    async updateOrderReceiptProjection(orderId, patch, session) {
      return withSession(
        Order.findOneAndUpdate(
          { _id: orderId, orderStatus: 'Delivered' },
          { $set: patch },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
  };
}

function createTransactionManager() {
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

function createAuditLogger() {
  return {
    async append(entry, session) {
      const [created] = await AuditLog.create([entry], { session });
      return created.toObject();
    },
  };
}

function createOutboxWriter() {
  return {
    async append(entry, session) {
      const [created] = await DomainOutbox.create([entry], { session });
      return created.toObject();
    },
  };
}

function conflictWithWinner(errorCode, message, winner) {
  return typedError(409, errorCode, message, { winner: safeDecision(winner) });
}

function createCustomerDeliveryReceiptService({
  repository = createModelRepository(),
  transactionManager = createTransactionManager(),
  auditLogger = createAuditLogger(),
  outboxWriter = createOutboxWriter(),
  clock = () => new Date(),
} = {}) {
  async function resolveDuplicate(customerId, orderId, command) {
    const replay = await repository.findByCommand(
      customerId,
      command.idempotencyKey,
      null,
    );
    if (replay) {
      if (replay.requestHash !== command.requestHash) {
        throw typedError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'The idempotency key was already used for different delivery receipt facts',
        );
      }
      return safeDecision(replay);
    }

    const terminal = await repository.findTerminalReceived(orderId, null);
    if (terminal) {
      throw conflictWithWinner(
        'DELIVERY_RECEIPT_ALREADY_CONFIRMED',
        'Customer delivery receipt was already confirmed',
        terminal,
      );
    }
    const winner = await repository.findLatestDecision(orderId, null);
    if (winner) {
      throw conflictWithWinner(
        'DELIVERY_RECEIPT_CONFLICT',
        'Another delivery receipt decision was recorded first',
        winner,
      );
    }
    throw typedError(
      409,
      'DELIVERY_RECEIPT_CONFLICT',
      'Another delivery receipt decision was recorded first',
    );
  }

  return {
    async recordDecision(customerId, orderId, input) {
      const normalized = validateCommand(input);
      const command = {
        ...normalized,
        requestHash: commandHash({
          orderId,
          outcome: normalized.outcome,
          expectedDeliveryEventId: normalized.expectedDeliveryEventId,
          reason: normalized.reason,
        }),
      };

      try {
        return await transactionManager.withTransaction(async (session) => {
          const order = await repository.findOwnedOrder(customerId, orderId, session);
          if (!order) {
            throw typedError(404, 'ORDER_NOT_FOUND', 'Order not found');
          }

          const replay = await repository.findByCommand(
            customerId,
            command.idempotencyKey,
            session,
          );
          if (replay) {
            if (replay.requestHash !== command.requestHash) {
              throw typedError(
                409,
                'IDEMPOTENCY_KEY_REUSED',
                'The idempotency key was already used for different delivery receipt facts',
              );
            }
            return safeDecision(replay);
          }

          if (order.orderStatus !== 'Delivered') {
            throw typedError(
              409,
              'ORDER_NOT_DELIVERED',
              'The order has no authoritative physical delivery',
            );
          }

          const shipment = await repository.findLatestTerminalShipment(orderId, session);
          const event = shipment
            ? await repository.findShipmentEvent(command.expectedDeliveryEventId, session)
            : null;
          const evidenceMatches = (
            shipment
            && shipment.status === 'Delivered'
            && sameId(shipment.terminalEventId, command.expectedDeliveryEventId)
            && event
            && event.eventType === 'DELIVERED'
            && sameId(event.orderId, orderId)
            && sameId(event.shipmentId, shipment._id)
          );
          if (!evidenceMatches) {
            throw typedError(
              409,
              'DELIVERY_EVIDENCE_STALE',
              'The delivered shipment evidence has changed; reload the order',
            );
          }

          const terminal = await repository.findTerminalReceived(orderId, session);
          if (terminal) {
            throw conflictWithWinner(
              'DELIVERY_RECEIPT_ALREADY_CONFIRMED',
              'Customer delivery receipt was already confirmed',
              terminal,
            );
          }
          const latest = await repository.findLatestDecision(orderId, session);
          if (latest && (
            command.outcome !== 'RECEIVED'
            || latest.outcome !== 'NOT_RECEIVED'
          )) {
            throw conflictWithWinner(
              'DELIVERY_RECEIPT_CONFLICT',
              'Another delivery receipt decision was recorded first',
              latest,
            );
          }

          const respondedAt = new Date(clock());
          const deadline = command.outcome === 'RECEIVED'
            ? new Date(respondedAt.getTime() + AFTER_SALES_DAYS * DAY_MS)
            : null;
          const receipt = await repository.createDecision({
            orderId: order._id,
            customerId: order.customerId,
            shipmentId: shipment._id,
            deliveryEventId: event._id,
            outcome: command.outcome,
            reason: command.reason,
            supersedesId: latest?._id || null,
            respondedAt,
            exchangeDeadlineAt: deadline,
            returnDeadlineAt: deadline,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
          }, session);

          if (command.outcome === 'RECEIVED') {
            const updated = await repository.updateOrderReceiptProjection(order._id, {
              exchangeDeadlineAt: deadline,
              returnDeadlineAt: deadline,
            }, session);
            if (!updated) {
              throw typedError(
                409,
                'ORDER_DELIVERY_STATE_CHANGED',
                'Order delivery state changed while recording the receipt',
              );
            }
          }

          const eventType = command.outcome === 'RECEIVED'
            ? 'CUSTOMER_DELIVERY_RECEIVED'
            : 'CUSTOMER_DELIVERY_NOT_RECEIVED';
          const businessEventId = `customer-delivery-receipt:${receipt._id}`;
          const safeFacts = {
            outcome: command.outcome,
            shipmentId: String(shipment._id),
            deliveryEventId: String(event._id),
          };
          if (deadline) {
            safeFacts.exchangeDeadlineAt = deadline.toISOString();
            safeFacts.returnDeadlineAt = deadline.toISOString();
          }
          await auditLogger.append({
            actorType: 'User',
            actorId: String(customerId),
            actorRole: 'Customer',
            source: 'CustomerDeliveryReceipt',
            action: eventType,
            targetType: 'Order',
            targetId: String(order._id),
            outcome: 'Success',
            correlationId: businessEventId,
            businessEventId,
            reasonCode: eventType,
            reason: '',
            previousState: latest?.outcome || 'Awaiting',
            newState: command.outcome,
            safeFacts,
            timestamp: respondedAt,
          }, session);
          await outboxWriter.append({
            identityKey: businessEventId,
            eventType,
            payload: {
              businessEventId,
              orderId: String(order._id),
              customerId: String(customerId),
              outcome: command.outcome,
              shipmentId: String(shipment._id),
              deliveryEventId: String(event._id),
            },
            status: 'Pending',
          }, session);

          return safeDecision(receipt);
        });
      } catch (error) {
        if (error?.code === 11000) {
          return resolveDuplicate(customerId, orderId, command);
        }
        throw error;
      }
    },
  };
}

module.exports = {
  AFTER_SALES_DAYS,
  createCustomerDeliveryReceiptService,
  createModelRepository,
};
