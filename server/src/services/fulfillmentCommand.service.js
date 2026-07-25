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
const { canonicalEnvelope } = require('./domainEventProducer.service');

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
const STAFF_DELIVERY_FAILURE_REASONS = new Set([
  'CUSTOMER_UNREACHABLE',
  'CUSTOMER_REFUSED',
  'ADDRESS_UNDELIVERABLE',
  'OTHER_DELIVERY_FAILURE',
]);
const STAFF_EVENTS_REQUIRING_FAILURE_REASON = new Set(['ATTEMPT_FAILED', 'RETURNED_TO_SHOP']);
const STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE = 'STAFF_RECORDED_CARRIER_EVIDENCE';
const LEGACY_STAFF_EVIDENCE_SOURCES = new Set(['STAFF_EVIDENCE', 'STAFF_RECONCILIATION']);

function isStaffRecordedCarrierEvidence(source) {
  return source === STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE
    || LEGACY_STAFF_EVIDENCE_SOURCES.has(source);
}

function canonicalEvidenceSource(source) {
  return isStaffRecordedCarrierEvidence(source)
    ? STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE
    : source;
}

function customerNotificationOutbox({
  identityKey,
  eventType,
  order,
  shipment,
  occurredAt,
}) {
  const businessEventId = String(identityKey);
  return canonicalEnvelope({
    identityKey: `notification:${businessEventId}:customer`,
    businessEventId,
    eventType,
    aggregateType: 'Shipment',
    aggregateId: String(shipment._id),
    occurredAt,
    recipientId: String(order.customerId),
    targetCollection: 'Order',
    targetId: String(order._id),
    displayValues: { orderCode: order.orderCode || String(order._id) },
  }, () => occurredAt);
}

function isDuplicateKey(error) {
  return Number(error?.code) === 11000 || error?.codeName === 'DuplicateKey';
}

function addDays(value, numberOfDays) {
  return new Date(value.getTime() + numberOfDays * 24 * 60 * 60 * 1000);
}

function normalizeOperationalEvidence(input, verifier, { required = false } = {}) {
  const validationError = (
    statusCode,
    message,
    errorCode = 'OPERATIONAL_EVIDENCE_INVALID',
  ) => new ApiError(
    statusCode,
    message,
    [{ field: 'evidenceReferences', message }],
    errorCode,
  );
  if (!hasOwn(input, 'evidenceReferences')) {
    if (required) {
      throw validationError(400, 'Cần ít nhất 1 ảnh dẫn chứng vận hành đã ký');
    }
    return [];
  }
  if (!Array.isArray(input.evidenceReferences)) {
    throw validationError(400, 'Ảnh dẫn chứng phải là một danh sách URL đã ký');
  }
  const submitted = input.evidenceReferences
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!submitted.length) {
    throw validationError(400, 'Cần ít nhất 1 ảnh dẫn chứng vận hành đã ký');
  }
  if (submitted.length > 5) {
    throw validationError(400, 'Chỉ được tải tối đa 5 ảnh dẫn chứng');
  }
  const claim = verifier || require('../utils/operationalEvidenceClaim').operationalEvidenceClaim;
  let verified;
  try {
    verified = submitted.map((value) => claim.verify(value));
  } catch {
    throw validationError(400, 'Ảnh dẫn chứng không hợp lệ hoặc chữ ký đã bị thay đổi');
  }
  const sizes = verified.map((item) => Number(item?.size));
  if (sizes.some((size) => !Number.isSafeInteger(size) || size < 1)) {
    throw validationError(400, 'Dung lượng ảnh dẫn chứng trong chữ ký không hợp lệ');
  }
  const totalSize = sizes.reduce((sum, size) => sum + size, 0);
  if (totalSize > 20 * 1024 * 1024) {
    throw validationError(
      413,
      'Tổng dung lượng ảnh dẫn chứng không được vượt quá 20 MiB',
      'OPERATIONAL_EVIDENCE_BATCH_TOO_LARGE',
    );
  }
  const canonicalUrls = verified.map((item) => String(item?.url || '').trim());
  if (canonicalUrls.some((url) => !url)) {
    throw validationError(400, 'URL chuẩn của ảnh dẫn chứng không hợp lệ');
  }
  if (new Set(canonicalUrls).size !== canonicalUrls.length) {
    throw validationError(400, 'Không được gửi trùng ảnh dẫn chứng');
  }
  return submitted.map((value) => {
    if (value.length > 256) {
      throw validationError(400, 'URL ảnh dẫn chứng không được vượt quá 256 ký tự');
    }
    return value;
  });
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
  values.note = optionalText(input.note, 1000);
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
  runtime,
  operationalEvidenceClaim,
}) {
  async function confirmPacking(staffId, orderId, input = {}) {
    const commandKey = normalizeIdentity(input.idempotencyKey);
    const existing = await repository.findPackingByCommandKey(commandKey);
    if (existing) return { packingRecord: existing, idempotentReplay: true };

    let result;
    try {
      result = await transactionManager.withTransaction(async (session) => {
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
      await auditLogger?.log?.({
        userId: staffId,
        action: 'ORDER_PACKING_RECORDED',
        targetEntity: 'Order',
        targetId: String(orderId),
        description: `Recorded ${packingRecord.status} packing checklist`,
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
    } catch (error) {
      if (isDuplicateKey(error)) {
        const winner = await repository.findPackingByCommandKey(commandKey);
        if (winner) return { packingRecord: winner, idempotentReplay: true };
      }
      throw error;
    }

    return result;
  }

  async function recordHandoff(staffId, orderId, input = {}) {
    const handoff = validateHandoff(input);
    const existing = await repository.findShipmentByCommandKey(handoff.commandKey);
    if (existing) return { shipment: existing, idempotentReplay: true };

    let result;
    try {
      result = await transactionManager.withTransaction(async (session) => {
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
        note: handoff.note,
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
        source: STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE,
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
      await repository.createOutbox(customerNotificationOutbox({
        identityKey: `shipment:${String(event._id)}:ORDER_SHIPPED`,
        eventType: 'ORDER_SHIPPED',
        order,
        shipment,
        occurredAt: handoff.handedOffAt,
      }), session);
      await auditLogger?.log?.({
        userId: staffId,
        action: 'ORDER_HANDED_TO_CARRIER',
        targetEntity: 'Order',
        targetId: String(orderId),
        description: `Recorded Carrier handoff ${handoff.trackingReference}`,
      }, session);
        return { shipment, event, order: updatedOrder, idempotentReplay: false };
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const winner = await repository.findShipmentByCommandKey(handoff.commandKey);
        if (winner) return { shipment: winner, idempotentReplay: true };
      }
      throw error;
    }

    return result;
  }

  async function recordShipmentEvent(actorContext, shipmentId, input = {}) {
    const eventKey = normalizeIdentity(input.eventKey, 'eventKey');
    const eventType = String(input.eventType || '').trim().toUpperCase();
    if (!DELIVERY_EVENT_TYPES.has(eventType)) {
      throw new ApiError(400, 'Unsupported shipment eventType');
    }
    const requestedSource = String(input.source || '').trim().toUpperCase();
    if (![
      'CARRIER',
      STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE,
      'STAFF_EVIDENCE',
      'CUSTOMER_DISPUTE',
      'WAREHOUSE',
    ].includes(requestedSource)) {
      throw new ApiError(400, 'Unsupported shipment event source');
    }
    const actor = validateActor(actorContext, requestedSource);
    if (actor.actorType === 'Staff' && !isStaffRecordedCarrierEvidence(requestedSource)) {
      throw new ApiError(
        403,
        `Staff shipment events must use ${STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE} source`,
      );
    }
    if (actor.actorType === 'Carrier' && requestedSource !== 'CARRIER') {
      throw new ApiError(403, 'Signed Carrier shipment events must use CARRIER source');
    }
    if (!['Staff', 'Carrier'].includes(actor.actorType)) {
      throw new ApiError(403, 'Only Staff or signed Carrier may record Shipment events');
    }
    const source = actor.actorType === 'Staff'
      ? STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE
      : requestedSource;
    const assertReplayIdentity = (event) => {
      if (
        !sameId(event.shipmentId, shipmentId)
        || event.eventType !== eventType
        || canonicalEvidenceSource(event.source) !== source
        || !sameId(event.actorId, actor.actorId)
      ) {
        throw new ApiError(
          409,
          'Shipment event key was already used for different command facts',
          [],
          'SHIPMENT_EVENT_KEY_REUSED',
        );
      }
    };
    const existing = await repository.findEventByKey(eventKey);
    if (existing) {
      assertReplayIdentity(existing);
      const incident = await repository.findIncidentBySourceEvent(existing._id);
      return { event: existing, incident, idempotentReplay: true };
    }
    const occurredAt = requiredDate(input.occurredAt, 'occurredAt');
    if (
      hasOwn(input, 'amount')
      || hasOwn(input, 'codExpectedAmount')
      || hasOwn(input, 'customerCollectedAmount')
      || hasOwn(input, 'carrierSettlementAmount')
    ) {
      throw new ApiError(400, 'COD amounts are established only by attributable collection evidence');
    }
    const codCollectionResult = String(input.codCollectionResult || '').trim().toUpperCase();
    if (codCollectionResult && !['COLLECTED', 'NOT_COLLECTED'].includes(codCollectionResult)) {
      throw new ApiError(400, 'codCollectionResult must be COLLECTED or NOT_COLLECTED');
    }
    if (codCollectionResult && eventType !== 'DELIVERED') {
      throw new ApiError(409, 'COD reconciliation is allowed only with a Delivered result');
    }
    if (codCollectionResult && actor.actorType !== 'Staff') {
      throw new ApiError(403, 'codCollectionResult is reserved for Staff-recorded Carrier evidence');
    }
    const evidenceReferences = normalizeOperationalEvidence(
      input,
      operationalEvidenceClaim,
      { required: Boolean(codCollectionResult) },
    );
    const evidenceReference = evidenceReferences[0]
      || requiredText(input.evidenceReference, 'evidenceReference');
    const reason = optionalText(input.reason);
    if (
      actor.actorType === 'Staff'
      && STAFF_EVENTS_REQUIRING_FAILURE_REASON.has(eventType)
      && !STAFF_DELIVERY_FAILURE_REASONS.has(reason)
    ) {
      throw new ApiError(
        400,
        'Cần chọn lý do không giao được hợp lệ',
        [{
          field: 'reason',
          message: 'Chọn một lý do không giao được trong danh sách',
        }],
        'DELIVERY_FAILURE_REASON_INVALID',
      );
    }

    try {
      return await transactionManager.withTransaction(async (session) => {
      const shipment = await repository.findShipmentById(shipmentId, session);
      if (!shipment) throw new ApiError(404, 'Shipment not found');
      const order = await repository.findOrderById(shipment.orderId, session);
      if (!order) throw new ApiError(404, 'Order not found');
      const isStaffCodDelivery = (
        actor.actorType === 'Staff'
        && eventType === 'DELIVERED'
        && order.paymentMethod === 'COD'
      );
      if (isStaffCodDelivery && !codCollectionResult && !input.customerCollectionEvidence) {
        throw new ApiError(
          400,
          'codCollectionResult is required for Staff COD delivery',
          [{
            field: 'codCollectionResult',
            message: 'Chọn đã thu hoặc chưa thu COD',
          }],
          'COD_COLLECTION_RESULT_REQUIRED',
        );
      }
      if (codCollectionResult && order.paymentMethod !== 'COD') {
        throw new ApiError(409, 'COD reconciliation is available only for COD orders');
      }
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
        const replaced = input.replacesEventId
          ? await repository.findEventById(input.replacesEventId, session)
          : null;
        if (!replaced) {
          throw new ApiError(400, `${eventType} requires an existing replacesEventId`);
        }
        if (!sameId(replaced.shipmentId, shipment._id) || !sameId(replaced.orderId, order._id)) {
          throw new ApiError(409, `${eventType} may replace evidence only from the same Shipment`);
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
        evidenceReferences,
        actorId: actor.actorId,
        replacesEventId: input.replacesEventId || null,
        reason,
      }, session);

      let updatedOrder = order;
      let updatedShipment = shipment;
      let incident = null;
      if (eventType === 'ATTEMPT_FAILED' || eventType === 'RESCHEDULED') {
        if (order.orderStatus !== 'Shipped') throw new ApiError(409, 'Delivery attempt requires a Shipped order');
        updatedShipment = await repository.updateShipment(shipment._id, {
          status: eventType === 'ATTEMPT_FAILED' ? 'AttemptFailed' : shipment.status,
        }, session);
        const notificationType = eventType === 'ATTEMPT_FAILED'
          ? 'DELIVERY_ATTEMPT_FAILED'
          : 'DELIVERY_RESCHEDULED';
        await repository.createOutbox(customerNotificationOutbox({
          identityKey: `shipment-event:${String(event._id)}:${eventType}`,
          eventType: notificationType,
          order,
          shipment,
          occurredAt,
        }), session);
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
          if (codCollectionResult && collection) {
            throw new ApiError(400, 'Use either Staff reconciliation or Carrier collection evidence, not both');
          }
          const staffCollection = codCollectionResult === 'COLLECTED'
            ? {
              eventId: `staff-reconciliation:${String(event._id)}`,
              customerCollectedAmount: expected,
              collectionTiming: 'AT_DELIVERY',
              occurredAt,
              evidenceReference,
              evidenceReferences,
              source: STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE,
            }
            : null;
          const effectiveCollection = collection || staffCollection;
          const collected = effectiveCollection ? Number(effectiveCollection.customerCollectedAmount) : null;
          const timing = effectiveCollection ? String(effectiveCollection.collectionTiming || '') : '';
          const isFullCollection = effectiveCollection
            && Number.isSafeInteger(collected)
            && collected === expected
            && ['AT_DELIVERY', 'AFTER_DELIVERY'].includes(timing);
          if (effectiveCollection && (!Number.isSafeInteger(collected) || collected < 0 || collected > expected)) {
            throw new ApiError(400, 'customerCollectedAmount must be between zero and the fixed COD expected amount');
          }
          let collectionOccurredAt = null;
          if (effectiveCollection) {
            collectionOccurredAt = timing === 'AT_DELIVERY'
              ? occurredAt
              : requiredDate(
                effectiveCollection.occurredAt,
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
              eventId: normalizeIdentity(effectiveCollection.eventId, 'customerCollectionEvidence.eventId'),
              eventType: 'COLLECTION',
              source: effectiveCollection.source || 'CARRIER',
              customerCollectedAmount: collected,
              carrierSettlementAmount: null,
              collectionTiming: timing || null,
              occurredAt: collectionOccurredAt,
              evidenceReference: requiredText(effectiveCollection.evidenceReference, 'customerCollectionEvidence.evidenceReference'),
              evidenceReferences: effectiveCollection.evidenceReferences || [],
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
              customerCollectionEvidenceId: effectiveCollection.eventId,
              completedSaleAt,
              codDiscrepancyStatus: 'None',
            });
          } else {
            Object.assign(orderPatch, {
              paymentStatus: 'Unpaid',
              codDiscrepancyStatus: 'Open',
              codDiscrepancyOpenedAt: clock(),
            });
            if (codCollectionResult === 'NOT_COLLECTED') {
              orderPatch.customerCollectedAmount = null;
            }
            if (effectiveCollection) {
              Object.assign(orderPatch, {
                customerCollectedAmount: collected,
                customerCollectedAt: collectionOccurredAt,
                customerCollectionEvidenceId: effectiveCollection.eventId,
              });
            }
            await repository.upsertCodDiscrepancy({
              orderId: order._id,
              shipmentId: shipment._id,
              deliveryEventId: event._id,
              expectedAmount: expected,
              customerCollectedAmount: effectiveCollection ? collected : null,
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
        await repository.createOutbox(customerNotificationOutbox({
          identityKey: `shipment-event:${String(event._id)}:ORDER_DELIVERED`,
          eventType: 'ORDER_DELIVERED',
          order,
          shipment,
          occurredAt,
        }), session);
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
      await auditLogger?.log?.({
        userId: actor.actorId,
        action: 'SHIPMENT_EVENT_RECORDED',
        targetEntity: 'Shipment',
        targetId: String(shipment._id),
        description: `Recorded attributable ${eventType} shipment event`,
      }, session);
      return {
        event,
        shipment: updatedShipment,
        order: updatedOrder,
        incident,
        idempotentReplay: false,
      };
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const winner = await repository.findEventByKey(eventKey);
        if (winner) {
          assertReplayIdentity(winner);
          const incident = await repository.findIncidentBySourceEvent(winner._id);
          return { event: winner, incident, idempotentReplay: true };
        }
      }
      throw error;
    }
  }

  async function addDestinationVersion(actorContext, orderId, input = {}) {
    const actor = validateActor(actorContext, STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE);
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

    try {
      return await transactionManager.withTransaction(async (session) => {
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
          source: actor.actorType === 'Customer'
            ? 'CUSTOMER_DISPUTE'
            : STAFF_RECORDED_CARRIER_EVIDENCE_SOURCE,
          occurredAt: clock(),
          recordedAt: clock(),
          evidenceReference: customerReference,
          actorId: actor.actorId,
          reason: 'Carrier accepted destination version',
        }, session);
      }
      await auditLogger?.log?.({
        userId: actor.actorId,
        action: 'SHIPMENT_DESTINATION_VERSION_RECORDED',
        targetEntity: 'Order',
        targetId: String(order._id),
        description: shipment
          ? 'Recorded Carrier-accepted destination version'
          : 'Recorded Customer-confirmed destination version',
      }, session);
      return { destination, idempotentReplay: false };
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const winner = await repository.findDestinationByKey(versionKey);
        if (winner) return { destination: winner, idempotentReplay: true };
      }
      throw error;
    }
  }

  return {
    addDestinationVersion,
    confirmPacking,
    recordHandoff,
    recordShipmentEvent,
  };
}

module.exports = { createFulfillmentCommandService };
