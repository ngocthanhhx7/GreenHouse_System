const {
  ApiError,
  hasOwn,
  normalizeIdentity,
  optionalText,
  positiveInteger,
  requiredDate,
  requiredText,
  sameId,
} = require('./fulfillmentValidation');

const DELIVERY_EVENT_TYPES = new Set([
  'ATTEMPT_FAILED',
  'RESCHEDULED',
  'DELIVERED',
  'RETURNED_TO_SHOP',
  'LOST',
  'DAMAGED',
  'DISPUTED',
  'CORRECTION',
]);
const ACTIVE_DELIVERY_EVENT_TYPES = new Set([
  'ATTEMPT_FAILED',
  'RESCHEDULED',
  'DELIVERED',
  'RETURNED_TO_SHOP',
  'LOST',
  'DAMAGED',
]);
const ACTIVE_SHIPMENT_STATUSES = new Set(['HandedOff', 'AttemptFailed']);

function addDays(value, numberOfDays) {
  return new Date(value.getTime() + numberOfDays * 24 * 60 * 60 * 1000);
}

function exactPackingItems(details, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length !== details.length) {
    throw new ApiError(400, 'Packing checklist must contain every order line exactly once');
  }
  const byDetail = new Map(details.map((detail) => [String(detail._id), detail]));
  const seen = new Set();
  const items = rawItems.map((raw) => {
    const key = String(raw.orderDetailId || '');
    const detail = byDetail.get(key);
    if (!detail || seen.has(key)) {
      throw new ApiError(400, 'Packing checklist must contain every order line exactly once');
    }
    seen.add(key);
    const checkedQuantity = positiveInteger(raw.checkedQuantity, 'checkedQuantity', { allowZero: true });
    return {
      orderDetailId: detail._id,
      productId: detail.productId,
      expectedQuantity: Number(detail.quantity),
      checkedQuantity,
      checked: raw.checked === true,
      discrepancyReason: optionalText(raw.discrepancyReason, 500),
    };
  });
  return {
    items,
    exact: items.every((item) => item.checked && item.checkedQuantity === item.expectedQuantity),
  };
}

function validateHandoff(input) {
  const errors = [];
  const commandKey = (() => {
    try { return normalizeIdentity(input.idempotencyKey); } catch (error) {
      errors.push(...(error.errors || []));
      return '';
    }
  })();
  const values = {};
  for (const [field, maxLength] of [
    ['carrierName', 120],
    ['trackingReference', 160],
    ['evidenceReference', 256],
  ]) {
    try { values[field] = requiredText(input[field], field, maxLength); } catch (error) {
      errors.push(...(error.errors || [{ field, message: error.message }]));
    }
  }
  try { values.handedOffAt = requiredDate(input.handedOffAt, 'handedOffAt'); } catch (error) {
    errors.push(...(error.errors || [{ field: 'handedOffAt', message: error.message }]));
  }
  if (errors.length) {
    throw new ApiError(
      400,
      'Complete Carrier handoff evidence is required',
      errors,
      'HANDOFF_VALIDATION_FAILED',
    );
  }
  return { commandKey, ...values };
}

function validateActor(actorContext, source) {
  const actorType = String(actorContext?.actorType || '');
  if (!['Staff', 'Warehouse', 'Customer', 'Carrier'].includes(actorType)) {
    throw new ApiError(403, 'Fulfillment actor is not allowed');
  }
  if (actorType === 'Carrier' && source !== 'CARRIER') {
    throw new ApiError(403, 'Signed Carrier evidence must use the CARRIER source');
  }
  return { actorType, actorId: actorContext?.actorId || null };
}

function createFulfillmentCommandService({
  repository,
  transactionManager,
  auditLogger,
  assignmentCoordinator,
  clock,
}) {
  async function confirmPacking(staffId, orderId, input = {}) {
    const commandKey = normalizeIdentity(input.idempotencyKey);
    const existing = await repository.findPackingByCommandKey(commandKey);
    if (existing) return { packingRecord: existing, idempotentReplay: true };

    const result = await transactionManager.withTransaction(async (session) => {
      await assignmentCoordinator?.coordinate?.({
        userId: staffId,
        expectedRole: 'Staff',
        session,
      });
      const order = await repository.findOrderById(orderId, session);
      if (!order) throw new ApiError(404, 'Order not found');
      const cycle = await repository.findActiveCycleByOrder(orderId, session);
      if (!cycle) throw new ApiError(409, 'Fulfillment cycle is missing');
      const isResend = cycle.cycleType === 'Resend';
      const expectedOrderStatus = isResend ? 'Shipped' : 'Confirmed';
      if (order.orderStatus !== expectedOrderStatus) {
        throw new ApiError(
          409,
          isResend
            ? 'Resend packing requires the original Order to remain Shipped'
            : 'Packing requires a Confirmed order',
        );
      }
      if (cycle.status !== 'Exported') {
        throw new ApiError(409, 'Packing requires an Exported fulfillment cycle');
      }
      const stockExport = await repository.findCompletedExportByCycle(cycle._id, session);
      if (!stockExport) throw new ApiError(409, 'Packing requires a Completed stock export');
      const alreadyCompleted = await repository.findCompletedPackingByCycle(cycle._id, session);
      if (alreadyCompleted) return { packingRecord: alreadyCompleted, order, idempotentReplay: true };
      const details = await repository.listOrderDetails(orderId, session);
      if (!details.length) throw new ApiError(409, 'Order details are missing');
      const checklist = exactPackingItems(details, input.items);
      const packingRecord = await repository.createPackingRecord({
        commandKey,
        orderId: order._id,
        cycleId: cycle._id,
        stockExportRequestId: stockExport._id,
        status: checklist.exact ? 'Completed' : 'Discrepancy',
        items: checklist.items,
        packedBy: staffId,
        packedAt: clock(),
        note: optionalText(input.note),
        evidenceReferences: Array.isArray(input.evidenceReferences)
          ? input.evidenceReferences.map((entry) => requiredText(entry, 'evidenceReference'))
          : [],
      }, session);
      if (!checklist.exact) return { packingRecord, order, idempotentReplay: false };
      let updatedOrder = order;
      if (!isResend) {
        updatedOrder = await repository.claimOrderState(orderId, 'Confirmed', {
          orderStatus: 'Packed',
          packedAt: packingRecord.packedAt,
        }, session);
        if (!updatedOrder) throw new ApiError(409, 'Order changed while packing');
      }
      await repository.updateCycle(cycle._id, { status: 'Packed' }, session);
      return { packingRecord, order: updatedOrder, idempotentReplay: false };
    });

    await auditLogger?.log?.({
      userId: staffId,
      action: 'ORDER_PACKING_RECORDED',
      targetEntity: 'Order',
      targetId: String(orderId),
      description: `Recorded ${result.packingRecord.status} packing checklist`,
    });
    return result;
  }

  async function recordHandoff(staffId, orderId, input = {}) {
    const handoff = validateHandoff(input);
    const existing = await repository.findShipmentByCommandKey(handoff.commandKey);
    if (existing) return { shipment: existing, idempotentReplay: true };

    const result = await transactionManager.withTransaction(async (session) => {
      await assignmentCoordinator?.coordinate?.({
        userId: staffId,
        expectedRole: 'Staff',
        session,
      });
      const order = await repository.findOrderById(orderId, session);
      if (!order) throw new ApiError(404, 'Order not found');
      const cycle = await repository.findActiveCycleByOrder(orderId, session);
      if (!cycle) throw new ApiError(409, 'Fulfillment cycle is missing');
      const isResend = cycle.cycleType === 'Resend';
      const expectedOrderStatus = isResend ? 'Shipped' : 'Packed';
      if (order.orderStatus !== expectedOrderStatus) {
        throw new ApiError(
          409,
          isResend
            ? 'Resend Carrier handoff requires the original Order to remain Shipped'
            : 'Carrier handoff requires a Packed order',
        );
      }
      if (cycle.status !== 'Packed') {
        throw new ApiError(409, 'Carrier handoff requires a Packed fulfillment cycle');
      }
      const packingRecord = cycle
        ? await repository.findCompletedPackingByCycle(cycle._id, session)
        : null;
      if (!cycle || !packingRecord) throw new ApiError(409, 'Completed packing evidence is missing');
      const concurrent = await repository.findShipmentByCycle(cycle._id, session);
      if (concurrent) return { shipment: concurrent, idempotentReplay: true };

      let destinations = await repository.listDestinationVersions(cycle._id, session);
      if (!destinations.length) {
        const checkout = await repository.createDestinationVersion({
          versionKey: `checkout:${String(cycle._id)}`,
          orderId: order._id,
          cycleId: cycle._id,
          shipmentId: null,
          version: 1,
          receiverName: requiredText(order.receiverName, 'receiverName', 120),
          receiverPhone: requiredText(order.receiverPhone, 'receiverPhone', 20),
          shippingAddress: requiredText(order.shippingAddress, 'shippingAddress', 500),
          confirmationSource: 'CHECKOUT_SNAPSHOT',
          confirmationReference: `checkout:${order.orderCode || String(order._id)}`,
          createdBy: staffId,
        }, session);
        destinations = [checkout];
      }
      const currentDestination = destinations.at(-1);
      const shipment = await repository.createShipment({
        commandKey: handoff.commandKey,
        shipmentKey: `shipment:${String(cycle._id)}`,
        orderId: order._id,
        cycleId: cycle._id,
        packingRecordId: packingRecord._id,
        carrierName: handoff.carrierName,
        trackingReference: handoff.trackingReference,
        handedOffAt: handoff.handedOffAt,
        handoffEvidenceReference: handoff.evidenceReference,
        recordedBy: staffId,
        currentDestinationVersionId: currentDestination._id,
        status: 'HandedOff',
      }, session);
      const event = await repository.createShipmentEvent({
        eventKey: `handoff:${handoff.commandKey}`,
        orderId: order._id,
        cycleId: cycle._id,
        shipmentId: shipment._id,
        eventType: 'HANDOFF',
        source: 'STAFF_EVIDENCE',
        occurredAt: handoff.handedOffAt,
        recordedAt: clock(),
        evidenceReference: handoff.evidenceReference,
        actorId: staffId,
      }, session);
      let updatedOrder = order;
      if (!isResend) {
        updatedOrder = await repository.claimOrderState(orderId, 'Packed', {
          orderStatus: 'Shipped',
          shippedAt: handoff.handedOffAt,
        }, session);
        if (!updatedOrder) throw new ApiError(409, 'Order changed during Carrier handoff');
      }
      await repository.updateCycle(cycle._id, { status: 'HandedOff' }, session);
      await repository.createOutbox({
        identityKey: `shipment:${String(event._id)}:ORDER_SHIPPED`,
        eventType: 'ORDER_SHIPPED',
        payload: { orderId: String(order._id), shipmentId: String(shipment._id) },
      }, session);
      return { shipment, event, order: updatedOrder, idempotentReplay: false };
    });

    await auditLogger?.log?.({
      userId: staffId,
      action: 'ORDER_HANDED_TO_CARRIER',
      targetEntity: 'Order',
      targetId: String(orderId),
      description: `Recorded Carrier handoff ${handoff.trackingReference}`,
    });
    return result;
  }

  async function recordShipmentEvent(actorContext, shipmentId, input = {}) {
    const eventKey = normalizeIdentity(input.eventKey, 'eventKey');
    const eventType = String(input.eventType || '').trim().toUpperCase();
    if (!DELIVERY_EVENT_TYPES.has(eventType)) {
      throw new ApiError(400, 'Unsupported shipment eventType');
    }
    const source = String(input.source || '').trim().toUpperCase();
    if (!['CARRIER', 'STAFF_EVIDENCE', 'CUSTOMER_DISPUTE', 'WAREHOUSE'].includes(source)) {
      throw new ApiError(400, 'Unsupported shipment event source');
    }
    const actor = validateActor(actorContext, source);
    if (actor.actorType === 'Staff' && source !== 'STAFF_EVIDENCE') {
      throw new ApiError(403, 'Staff shipment events must use STAFF_EVIDENCE source');
    }
    if (actor.actorType === 'Carrier' && source !== 'CARRIER') {
      throw new ApiError(403, 'Signed Carrier shipment events must use CARRIER source');
    }
    if (!['Staff', 'Carrier'].includes(actor.actorType)) {
      throw new ApiError(403, 'Only Staff or signed Carrier may record Shipment events');
    }
    const existing = await repository.findEventByKey(eventKey);
    if (existing) {
      const incident = await repository.findIncidentBySourceEvent(existing._id);
      return { event: existing, incident, idempotentReplay: true };
    }
    const occurredAt = requiredDate(input.occurredAt, 'occurredAt');
    const evidenceReference = requiredText(input.evidenceReference, 'evidenceReference');
    if (hasOwn(input, 'amount') || hasOwn(input, 'codExpectedAmount')) {
      throw new ApiError(400, 'COD amounts are established only by attributable collection evidence');
    }

    return transactionManager.withTransaction(async (session) => {
      const shipment = await repository.findShipmentById(shipmentId, session);
      if (!shipment) throw new ApiError(404, 'Shipment not found');
      const order = await repository.findOrderById(shipment.orderId, session);
      if (!order) throw new ApiError(404, 'Order not found');
      if (
        ACTIVE_DELIVERY_EVENT_TYPES.has(eventType)
        && (
          order.orderStatus !== 'Shipped'
          || !ACTIVE_SHIPMENT_STATUSES.has(shipment.status)
        )
      ) {
        throw new ApiError(
          409,
          `${eventType} requires an active Shipped order and Shipment`,
          [],
          'SHIPMENT_EVENT_TERMINAL_STATE',
        );
      }
      if (['DISPUTED', 'CORRECTION'].includes(eventType)) {
        if (!input.replacesEventId || !await repository.findEventById(input.replacesEventId, session)) {
          throw new ApiError(400, `${eventType} requires an existing replacesEventId`);
        }
      }
      const event = await repository.createShipmentEvent({
        eventKey,
        orderId: order._id,
        cycleId: shipment.cycleId,
        shipmentId: shipment._id,
        eventType,
        source,
        occurredAt,
        recordedAt: clock(),
        evidenceReference,
        actorId: actor.actorId,
        replacesEventId: input.replacesEventId || null,
        reason: optionalText(input.reason),
      }, session);

      let updatedOrder = order;
      let updatedShipment = shipment;
      let incident = null;
      if (eventType === 'ATTEMPT_FAILED' || eventType === 'RESCHEDULED') {
        if (order.orderStatus !== 'Shipped') throw new ApiError(409, 'Delivery attempt requires a Shipped order');
        updatedShipment = await repository.updateShipment(shipment._id, {
          status: eventType === 'ATTEMPT_FAILED' ? 'AttemptFailed' : shipment.status,
        }, session);
        await repository.createOutbox({
          identityKey: `shipment-event:${String(event._id)}:${eventType}`,
          eventType: eventType === 'ATTEMPT_FAILED'
            ? 'DELIVERY_ATTEMPT_FAILED'
            : 'DELIVERY_RESCHEDULED',
          payload: { orderId: String(order._id), shipmentId: String(shipment._id), eventId: String(event._id) },
        }, session);
      } else if (eventType === 'DELIVERED') {
        if (order.orderStatus !== 'Shipped') throw new ApiError(409, 'Delivery requires a Shipped order');
        const deadline = addDays(occurredAt, 5);
        const orderPatch = {
          orderStatus: 'Delivered',
          deliveredAt: occurredAt,
          returnDeadlineAt: order.returnDeadlineAt || deadline,
          exchangeDeadlineAt: order.exchangeDeadlineAt || deadline,
        };
        if (
          order.paymentMethod !== 'COD'
          && order.paymentStatus === 'Paid'
          && !order.completedSaleAt
        ) {
          orderPatch.completedSaleAt = occurredAt;
        }
        if (order.paymentMethod === 'COD') {
          const expected = Number(order.codExpectedAmount ?? order.totalAmount);
          const collection = input.customerCollectionEvidence;
          if (collection && actor.actorType !== 'Carrier') {
            throw new ApiError(
              403,
              'Signed Carrier evidence is required for Customer COD collection',
              [],
              'COD_COLLECTION_CARRIER_SIGNATURE_REQUIRED',
            );
          }
          const collected = collection ? Number(collection.customerCollectedAmount) : null;
          const timing = collection ? String(collection.collectionTiming || '') : '';
          const isFullCollection = collection
            && Number.isSafeInteger(collected)
            && collected === expected
            && ['AT_DELIVERY', 'AFTER_DELIVERY'].includes(timing);
          if (collection && (!Number.isSafeInteger(collected) || collected < 0 || collected > expected)) {
            throw new ApiError(400, 'customerCollectedAmount must be between zero and the fixed COD expected amount');
          }
          let collectionOccurredAt = null;
          if (collection) {
            collectionOccurredAt = timing === 'AT_DELIVERY'
              ? occurredAt
              : requiredDate(
                collection.occurredAt,
                'customerCollectionEvidence.occurredAt',
              );
            if (timing === 'AFTER_DELIVERY' && collectionOccurredAt <= occurredAt) {
              throw new ApiError(
                400,
                'AFTER_DELIVERY collection occurredAt must be after physical delivery',
              );
            }
            await repository.createCodEvidence({
              orderId: order._id,
              eventId: normalizeIdentity(collection.eventId, 'customerCollectionEvidence.eventId'),
              eventType: 'COLLECTION',
              source: 'CARRIER',
              customerCollectedAmount: collected,
              carrierSettlementAmount: null,
              collectionTiming: timing || null,
              occurredAt: collectionOccurredAt,
              evidenceReference: requiredText(collection.evidenceReference, 'customerCollectionEvidence.evidenceReference'),
            }, session);
          }
          if (isFullCollection) {
            const payment = await repository.findPaymentByOrderId(order._id, session);
            const attempt = await repository.findPrimaryPaymentAttemptByOrder(order._id, session);
            if (!payment || !attempt) throw new ApiError(409, 'COD payment records are missing');
            const completedSaleAt = collectionOccurredAt;
            await repository.updatePayment(payment._id, { paymentStatus: 'Paid', paidAt: completedSaleAt }, session);
            await repository.updatePaymentAttempt(attempt._id, { paymentStatus: 'Paid', paidAt: completedSaleAt }, session);
            Object.assign(orderPatch, {
              paymentStatus: 'Paid',
              customerCollectedAmount: collected,
              customerCollectedAt: completedSaleAt,
              customerCollectionEvidenceId: collection.eventId,
              completedSaleAt,
              codDiscrepancyStatus: 'None',
            });
          } else {
            Object.assign(orderPatch, {
              paymentStatus: 'Unpaid',
              codDiscrepancyStatus: 'Open',
              codDiscrepancyOpenedAt: clock(),
            });
            await repository.upsertCodDiscrepancy({
              orderId: order._id,
              shipmentId: shipment._id,
              deliveryEventId: event._id,
              expectedAmount: expected,
              customerCollectedAmount: collection ? collected : null,
              carrierSettlementAmount: 0,
              status: 'Open',
              openedAt: clock(),
            }, session);
          }
        }
        updatedOrder = await repository.claimOrderState(order._id, 'Shipped', orderPatch, session);
        if (!updatedOrder) throw new ApiError(409, 'Order changed during delivery');
        updatedShipment = await repository.updateShipment(shipment._id, {
          status: 'Delivered',
          deliveredAt: occurredAt,
          terminalEventId: event._id,
        }, session);
        await repository.updateCycle(shipment.cycleId, { status: 'Delivered' }, session);
        await repository.createOutbox({
          identityKey: `shipment-event:${String(event._id)}:ORDER_DELIVERED`,
          eventType: 'ORDER_DELIVERED',
          payload: { orderId: String(order._id), shipmentId: String(shipment._id), eventId: String(event._id) },
        }, session);
      } else if (eventType === 'RETURNED_TO_SHOP') {
        updatedShipment = await repository.updateShipment(shipment._id, {
          status: 'ReturnedToShop',
          terminalEventId: event._id,
        }, session);
        await repository.updateCycle(shipment.cycleId, { status: 'Incident' }, session);
        incident = await repository.findIncidentBySourceEvent(event._id, session);
        if (!incident) {
          incident = await repository.createIncident({
            incidentKey: `incident:${eventKey}`,
            orderId: order._id,
            cycleId: shipment.cycleId,
            shipmentId: shipment._id,
            sourceEventId: event._id,
            incidentType: 'ReturnedToShop',
            status: 'AwaitingWarehouseReceipt',
            irrecoverable: false,
          }, session);
        }
      } else if (eventType === 'LOST' || eventType === 'DAMAGED') {
        updatedShipment = await repository.updateShipment(shipment._id, {
          status: eventType === 'LOST' ? 'Lost' : 'Damaged',
          terminalEventId: event._id,
        }, session);
        await repository.updateCycle(shipment.cycleId, { status: 'Incident' }, session);
        incident = await repository.findIncidentBySourceEvent(event._id, session);
        if (!incident) {
          incident = await repository.createIncident({
            incidentKey: `incident:${eventKey}`,
            orderId: order._id,
            cycleId: shipment.cycleId,
            shipmentId: shipment._id,
            sourceEventId: event._id,
            incidentType: eventType === 'LOST' ? 'Lost' : 'Damaged',
            status: 'AwaitingCustomerChoice',
            irrecoverable: input.irrecoverable === true,
          }, session);
        }
      }
      return {
        event,
        shipment: updatedShipment,
        order: updatedOrder,
        incident,
        idempotentReplay: false,
      };
    });
  }

  async function addDestinationVersion(actorContext, orderId, input = {}) {
    const actor = validateActor(actorContext, 'STAFF_EVIDENCE');
    if (!['Staff', 'Customer'].includes(actor.actorType)) {
      throw new ApiError(403, 'Only Customer or Staff may request a destination change');
    }
    const commandKey = normalizeIdentity(input.idempotencyKey);
    const versionKey = `destination:${commandKey}`;
    const existing = await repository.findDestinationByKey(versionKey);
    if (existing) return { destination: existing, idempotentReplay: true };
    const receiverName = requiredText(input.receiverName, 'receiverName', 120);
    const receiverPhone = requiredText(input.receiverPhone, 'receiverPhone', 20);
    const shippingAddress = requiredText(input.shippingAddress, 'shippingAddress', 500);
    const customerReference = requiredText(
      input.customerConfirmationReference,
      'customerConfirmationReference',
    );

    return transactionManager.withTransaction(async (session) => {
      const order = await repository.findOrderById(orderId, session);
      if (!order) throw new ApiError(404, 'Order not found');
      if (actor.actorType === 'Customer' && !sameId(order.customerId, actor.actorId)) {
        throw new ApiError(403, 'Order is not owned by this Customer');
      }
      const cycle = await repository.findActiveCycleByOrder(orderId, session);
      if (!cycle) throw new ApiError(409, 'Fulfillment cycle is missing');
      const shipment = await repository.findShipmentByCycle(cycle._id, session);
      if (shipment && actor.actorType === 'Customer') {
        throw new ApiError(
          409,
          'Staff must record Carrier acceptance evidence after handoff',
          [],
          'CARRIER_ACCEPTANCE_STAFF_EVIDENCE_REQUIRED',
        );
      }
      if (shipment && !String(input.carrierAcceptanceReference || '').trim()) {
        throw new ApiError(409, 'Carrier acceptance is required after handoff');
      }
      const versions = await repository.listDestinationVersions(cycle._id, session);
      const destination = await repository.createDestinationVersion({
        versionKey,
        orderId: order._id,
        cycleId: cycle._id,
        shipmentId: shipment?._id || null,
        version: versions.length + 1,
        receiverName,
        receiverPhone,
        shippingAddress,
        confirmationSource: shipment ? 'CARRIER_ACCEPTED' : 'CUSTOMER_CONFIRMED',
        confirmationReference: shipment
          ? requiredText(input.carrierAcceptanceReference, 'carrierAcceptanceReference')
          : customerReference,
        createdBy: actor.actorId,
      }, session);
      if (shipment) {
        await repository.updateShipment(shipment._id, {
          currentDestinationVersionId: destination._id,
        }, session);
        await repository.createShipmentEvent({
          eventKey: `destination-event:${commandKey}`,
          orderId: order._id,
          cycleId: cycle._id,
          shipmentId: shipment._id,
          eventType: 'DESTINATION_CHANGED',
          source: actor.actorType === 'Customer' ? 'CUSTOMER_DISPUTE' : 'STAFF_EVIDENCE',
          occurredAt: clock(),
          recordedAt: clock(),
          evidenceReference: customerReference,
          actorId: actor.actorId,
          reason: 'Carrier accepted destination version',
        }, session);
      }
      return { destination, idempotentReplay: false };
    });
  }

  return {
    addDestinationVersion,
    confirmPacking,
    recordHandoff,
    recordShipmentEvent,
  };
}

module.exports = { createFulfillmentCommandService };
