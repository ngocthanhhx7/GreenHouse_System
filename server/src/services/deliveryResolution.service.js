const {
  ApiError,
  normalizeIdentity,
  optionalText,
  positiveInteger,
  requiredDate,
  requiredText,
  sameId,
} = require('./fulfillmentValidation');
const { canonicalEnvelope } = require('./domainEventProducer.service');

function isDuplicateKey(error) {
  return Number(error?.code) === 11000 || error?.codeName === 'DuplicateKey';
}

function validateReceiptItems(details, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length !== details.length) {
    throw new ApiError(400, 'Returned receipt must classify every order line exactly once');
  }
  const byDetail = new Map(details.map((detail) => [String(detail._id), detail]));
  const seen = new Set();
  const items = rawItems.map((raw) => {
    const detailKey = String(raw.orderDetailId || '');
    const detail = byDetail.get(detailKey);
    if (!detail || seen.has(detailKey)) {
      throw new ApiError(400, 'Returned receipt must classify every order line exactly once');
    }
    seen.add(detailKey);
    const receivedQuantity = positiveInteger(raw.receivedQuantity, 'receivedQuantity', { allowZero: true });
    const sellableQuantity = positiveInteger(raw.sellableQuantity, 'sellableQuantity', { allowZero: true });
    const damagedQuantity = positiveInteger(raw.damagedQuantity, 'damagedQuantity', { allowZero: true });
    if (
      receivedQuantity !== Number(detail.quantity)
      || sellableQuantity + damagedQuantity !== receivedQuantity
    ) {
      throw new ApiError(400, 'Returned receipt must classify the full quantity of every order line');
    }
    return {
      orderDetailId: detail._id,
      productId: detail.productId,
      expectedQuantity: Number(detail.quantity),
      receivedQuantity,
      sellableQuantity,
      damagedQuantity,
    };
  });
  return items;
}

function createDeliveryResolutionService({
  repository,
  transactionManager,
  auditLogger,
  assignmentCoordinator,
  clock,
}) {
  async function recordReturnedReceipt(warehouseId, shipmentId, input = {}) {
    const commandKey = normalizeIdentity(input.idempotencyKey);
    const receiptKey = `returned-receipt:${commandKey}`;
    const existing = await repository.findReceiptByKey(receiptKey);
    if (existing) return { receipt: existing, idempotentReplay: true };
    const receivedAt = requiredDate(input.receivedAt, 'receivedAt');
    const evidenceReference = requiredText(input.evidenceReference, 'evidenceReference');

    let result;
    try {
      result = await transactionManager.withTransaction(async (session) => {
      await assignmentCoordinator?.coordinate?.({
        userId: warehouseId,
        expectedRole: 'WarehouseManager',
        session,
      });
      const shipment = await repository.findShipmentById(shipmentId, session);
      if (!shipment) throw new ApiError(404, 'Shipment not found');
      const prior = await repository.findReceiptByShipment(shipmentId, session);
      if (prior) {
        const priorIncident = await repository.findIncidentByShipment?.(shipmentId, session);
        if (priorIncident?.status === 'AwaitingWarehouseReceipt') {
          await repository.updateIncident(
            priorIncident._id,
            { status: 'AwaitingCustomerChoice' },
            session,
          );
        }
        return { receipt: prior, idempotentReplay: true };
      }
      const returnEvents = await repository.listShipmentEvents(shipmentId, session);
      if (!returnEvents.some((event) => event.eventType === 'RETURNED_TO_SHOP')) {
        throw new ApiError(409, 'Carrier return custody evidence is required before Warehouse receipt');
      }
      const details = await repository.listOrderDetails(shipment.orderId, session);
      const items = validateReceiptItems(details, input.items);
      const receipt = await repository.createReturnedReceipt({
        receiptKey,
        orderId: shipment.orderId,
        cycleId: shipment.cycleId,
        shipmentId: shipment._id,
        items,
        evidenceReference,
        receivedAt,
        recordedBy: warehouseId,
      }, session);
      for (const item of items) {
        const inventory = await repository.findInventoryByProductId(item.productId, session);
        if (!inventory) throw new ApiError(409, 'Inventory record is missing for returned item');
        if (inventory.inventoryHealth === 'ReconciliationRequired') {
          throw new ApiError(409, 'Returned receipt is blocked while Inventory reconciliation is required');
        }
        const beforeSellable = Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? 0);
        const beforeDamaged = Number(inventory.damagedQuantity || 0);
        await repository.addReturnedInventory(
          inventory._id,
          item.sellableQuantity,
          item.damagedQuantity,
          warehouseId,
          session,
        );
        if (item.sellableQuantity > 0) {
          await repository.createInventoryTransaction({
            productId: item.productId,
            orderId: shipment.orderId,
            relatedCollection: 'ReturnedParcelReceipt',
            relatedId: receipt._id,
            performedBy: warehouseId,
            transactionType: 'DELIVERY_RETURN_SELLABLE',
            quantity: item.sellableQuantity,
            beforeQuantity: beforeSellable,
            afterQuantity: beforeSellable + item.sellableQuantity,
            reason: 'Warehouse classified returned delivery as sellable',
            dimension: 'sellable',
            beforeSellableQuantity: beforeSellable,
            afterSellableQuantity: beforeSellable + item.sellableQuantity,
            movementKey: `delivery-return:${String(receipt._id)}:${String(item.orderDetailId)}:sellable`,
            idempotencyKey: `delivery-return:${String(receipt._id)}:${String(item.orderDetailId)}:sellable`,
          }, session);
        }
        if (item.damagedQuantity > 0) {
          await repository.createInventoryTransaction({
            productId: item.productId,
            orderId: shipment.orderId,
            relatedCollection: 'ReturnedParcelReceipt',
            relatedId: receipt._id,
            performedBy: warehouseId,
            transactionType: 'DELIVERY_RETURN_DAMAGED',
            quantity: item.damagedQuantity,
            beforeQuantity: beforeDamaged,
            afterQuantity: beforeDamaged + item.damagedQuantity,
            reason: 'Warehouse classified returned delivery as damaged',
            dimension: 'damaged',
            beforeDamagedQuantity: beforeDamaged,
            afterDamagedQuantity: beforeDamaged + item.damagedQuantity,
            movementKey: `delivery-return:${String(receipt._id)}:${String(item.orderDetailId)}:damaged`,
            idempotencyKey: `delivery-return:${String(receipt._id)}:${String(item.orderDetailId)}:damaged`,
          }, session);
        }
      }
      const incident = await repository.findIncidentByShipment?.(shipmentId, session);
      if (incident?.status === 'AwaitingWarehouseReceipt') {
        await repository.updateIncident(
          incident._id,
          { status: 'AwaitingCustomerChoice' },
          session,
        );
      }
      await auditLogger?.log?.({
        userId: warehouseId,
        action: 'RETURNED_DELIVERY_RECEIVED',
        targetEntity: 'Shipment',
        targetId: String(shipmentId),
        description: 'Recorded complete Warehouse returned-parcel classification',
      }, session);
      return { receipt, idempotentReplay: false };
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const winner = await repository.findReceiptByKey(receiptKey);
        if (winner) return { receipt: winner, idempotentReplay: true };
      }
      throw error;
    }
    return result;
  }

  async function chooseIncidentResolution(customerId, orderId, incidentId, input = {}) {
    const commandKey = normalizeIdentity(input.idempotencyKey);
    const choice = String(input.choice || '').trim();
    if (!['Resend', 'Wait', 'TerminalRefund'].includes(choice)) {
      throw new ApiError(400, 'choice must be Resend, Wait, or TerminalRefund');
    }

    return transactionManager.withTransaction(async (session) => {
      const order = await repository.findOrderById(orderId, session);
      if (!order) throw new ApiError(404, 'Order not found');
      if (!sameId(order.customerId, customerId)) {
        throw new ApiError(403, 'Order is not owned by this Customer');
      }
      const incident = await repository.findIncidentById(incidentId, session);
      if (!incident || !sameId(incident.orderId, orderId)) {
        throw new ApiError(404, 'Delivery incident not found');
      }
      if (incident.incidentType === 'ReturnedToShop') {
        const receipt = await repository.findReceiptByShipment(incident.shipmentId, session);
        if (!receipt) {
          throw new ApiError(
            409,
            'Warehouse returned-parcel receipt is required before Customer resolution',
            [],
            'RETURNED_PARCEL_RECEIPT_REQUIRED',
          );
        }
      }
      if (
        incident.choiceCommandKey === commandKey
        || incident.waitCommandKey === commandKey
      ) {
        const replayCycle = incident.resendCycleId
          ? await repository.findCycleById(incident.resendCycleId, session)
          : null;
        return { incident, cycle: replayCycle, idempotentReplay: true };
      }
      const progressingFromWait = incident.customerChoice === 'Wait'
        && incident.status === 'WaitingForStock';
      if (incident.customerChoice && !progressingFromWait) {
        throw new ApiError(409, 'A Customer resolution choice was already recorded');
      }
      if (progressingFromWait && choice === 'Wait') {
        throw new ApiError(409, 'This incident is already waiting for exact stock');
      }

      if (choice === 'TerminalRefund') {
        const updated = await repository.updateIncident(incident._id, {
          customerChoice: choice,
          customerChoiceAt: clock(),
          chosenBy: customerId,
          choiceCommandKey: commandKey,
          status: choice === 'Wait' ? 'WaitingForStock' : 'TerminalRequested',
        }, session);
        await auditLogger?.log?.({
          userId: customerId,
          action: 'DELIVERY_INCIDENT_CHOICE_RECORDED',
          targetEntity: 'DeliveryIncident',
          targetId: String(incident._id),
          description: 'Customer selected terminal delivery resolution',
        }, session);
        return { incident: updated, cycle: null, idempotentReplay: false };
      }

      const details = await repository.listOrderDetails(orderId, session);
      if (!details.length) throw new ApiError(409, 'Order details are missing');
      if (choice === 'Wait') {
        let exactStockAvailable = true;
        for (const detail of details) {
          const inventory = await repository.findInventoryByProductId(detail.productId, session);
          const available = Number(inventory?.sellableQuantity ?? inventory?.stockQuantity ?? 0)
            - Number(inventory?.reservedQuantity || 0);
          if (
            !inventory
            || inventory.inventoryHealth !== 'Normal'
            || available < Number(detail.quantity)
          ) {
            exactStockAvailable = false;
            break;
          }
        }
        if (exactStockAvailable) {
          throw new ApiError(
            409,
            'Exact resend stock is available; choose Resend or terminal resolution',
            [],
            'RESEND_STOCK_AVAILABLE',
          );
        }
        const updated = await repository.updateIncident(incident._id, {
          customerChoice: 'Wait',
          customerChoiceAt: clock(),
          waitChosenAt: clock(),
          waitCommandKey: commandKey,
          chosenBy: customerId,
          status: 'WaitingForStock',
        }, session);
        await auditLogger?.log?.({
          userId: customerId,
          action: 'DELIVERY_INCIDENT_CHOICE_RECORDED',
          targetEntity: 'DeliveryIncident',
          targetId: String(incident._id),
          description: 'Customer selected to wait for exact resend stock',
        }, session);
        return { incident: updated, cycle: null, idempotentReplay: false };
      }

      const cycles = await repository.listCyclesByOrder(orderId, session);
      const cycleNumber = Math.max(0, ...cycles.map((entry) => Number(entry.cycleNumber || 0))) + 1;
      for (const detail of details) {
        const reserved = await repository.reserveInventory(
          detail.productId,
          Number(detail.quantity),
          customerId,
          session,
        );
        if (!reserved) {
          throw new ApiError(
            409,
            'Exact resend stock is unavailable or requires Inventory reconciliation',
            [],
            'RESEND_INVENTORY_UNAVAILABLE',
          );
        }
      }
      const cycle = await repository.createFulfillmentCycle({
        cycleKey: `fulfillment:${String(order._id)}:${cycleNumber}`,
        orderId: order._id,
        cycleNumber,
        cycleType: 'Resend',
        status: 'AwaitingExport',
        resendOfCycleId: incident.cycleId,
        sourceIncidentId: incident._id,
        customerChoice: 'Resend',
        commandKey,
        createdBy: customerId,
      }, session);
      for (const detail of details) {
        await repository.createOrderReservation({
          reservationKey: `resend:${String(cycle._id)}:${String(detail._id)}`,
          orderId: order._id,
          orderDetailId: detail._id,
          productId: detail.productId,
          quantity: Number(detail.quantity),
          status: 'Reserved',
          reservedAt: clock(),
        }, session);
      }
      await repository.createStockExportRequest({
        orderId: order._id,
        cycleId: cycle._id,
        requestKind: 'Resend',
        requestedBy: customerId,
        status: 'Pending',
        note: `Same-order resend cycle ${cycleNumber}`,
      }, session);
      const updated = await repository.updateIncident(incident._id, {
        customerChoice: 'Resend',
        customerChoiceAt: clock(),
        chosenBy: customerId,
        choiceCommandKey: commandKey,
        resendCycleId: cycle._id,
        status: 'ResendCreated',
      }, session);
      await auditLogger?.log?.({
        userId: customerId,
        action: 'DELIVERY_INCIDENT_CHOICE_RECORDED',
        targetEntity: 'DeliveryIncident',
        targetId: String(incident._id),
        description: 'Customer selected same-Order resend',
      }, session);
      return { incident: updated, cycle, idempotentReplay: false };
    });
  }

  async function resolveDeliveryFailure(staffId, orderId, input = {}) {
    const commandKey = normalizeIdentity(input.idempotencyKey);
    const incidentId = requiredText(input.incidentId, 'incidentId', 160);

    const result = await transactionManager.withTransaction(async (session) => {
      await assignmentCoordinator?.coordinate?.({
        userId: staffId,
        expectedRole: 'Staff',
        session,
      });
      const order = await repository.findOrderById(orderId, session);
      if (!order) throw new ApiError(404, 'Order not found');
      const incident = await repository.findIncidentById(incidentId, session);
      if (!incident || !sameId(incident.orderId, orderId)) {
        throw new ApiError(404, 'Delivery incident not found');
      }
      if (incident.status === 'Resolved') {
        if (incident.resolutionCommandKey !== commandKey) {
          throw new ApiError(
            409,
            'Delivery incident was already resolved by another command',
            [],
            'DELIVERY_INCIDENT_ALREADY_RESOLVED',
          );
        }
        const primaryAttempt = order.paymentStatus === 'Paid'
          ? await repository.findPrimaryPaidPaymentAttemptByOrder(order._id, session)
          : null;
        const obligationKey = primaryAttempt
          ? `FAILED_DELIVERY:${String(incident._id)}:${String(primaryAttempt._id)}`
          : null;
        const [refund, refundRequest] = await Promise.all([
          obligationKey
            ? repository.findRefundPendingByObligationKey?.(obligationKey, session) || null
            : null,
          obligationKey
            ? repository.findRefundRequestByObligationKey?.(obligationKey, session) || null
            : null,
        ]);
        return {
          order,
          incident,
          refund,
          refundRequest,
          idempotentReplay: true,
        };
      }
      if (incident.customerChoice !== 'TerminalRefund') {
        throw new ApiError(409, 'Customer terminal resolution choice is required');
      }
      if (order.orderStatus !== 'Shipped') {
        throw new ApiError(
          409,
          'Failed-delivery terminal resolution requires a Shipped order',
          [],
          'DELIVERY_RESOLUTION_STALE_ORDER',
        );
      }
      if (!incident.irrecoverable) {
        const receipt = await repository.findReceiptByShipment(incident.shipmentId, session);
        if (!receipt) {
          throw new ApiError(409, 'A Warehouse receipt is required unless loss or damage is irrecoverable');
        }
      }

      const orderPatch = {
        moneyObligationsSettled: false,
        deliveryResolutionCommandKey: commandKey,
      };
      let refund = null;
      let refundRequest = null;
      if (order.paymentStatus === 'Paid') {
        const payment = await repository.findPaymentByOrderId(order._id, session);
        const attempt = await repository.findPrimaryPaidPaymentAttemptByOrder(order._id, session);
        if (!payment || !attempt) throw new ApiError(409, 'Paid order payment evidence is missing');
        if (
          attempt.paymentStatus !== 'Paid'
          || Number(attempt.amount) !== Number(order.totalAmount)
        ) {
          throw new ApiError(
            409,
            'Primary Paid attempt does not prove the exact failed-delivery refund allocation',
            [],
            'FAILED_DELIVERY_PRIMARY_PAYMENT_MISMATCH',
          );
        }
        const obligationKey = `FAILED_DELIVERY:${String(incident._id)}:${String(attempt._id)}`;
        refundRequest = await repository.upsertRefundRequest({
          orderId: order._id,
          requestCode: `FD-${String(order.orderCode || order._id)}`,
          customerId: order.customerId,
          paymentId: payment._id,
          obligationKey,
          originalRequestedAt: clock(),
          reason: 'Terminal failed delivery resolution',
          status: 'ReadyForRefund',
          refundAmount: Number(order.totalAmount),
          requestedAt: clock(),
          staffNote: optionalText(input.note),
        }, session);
        refund = await repository.upsertRefundPending({
          orderId: order._id,
          paymentAttemptId: attempt._id,
          customerId: order.customerId,
          returnRefundRequestId: refundRequest._id,
          amount: Number(order.totalAmount),
          obligationType: 'FAILED_DELIVERY',
          obligationKey,
          currency: order.currency || 'VND',
          reason: 'Terminal failed delivery resolution',
          status: 'RefundPending',
        }, session);
      } else if (order.paymentMethod === 'COD' && order.paymentStatus === 'Unpaid') {
        orderPatch.paymentStatus = 'Cancelled';
        orderPatch.moneyObligationsSettled = true;
        const payment = await repository.findPaymentByOrderId(order._id, session);
        const attempt = await repository.findPrimaryPaymentAttemptByOrder(order._id, session);
        if (payment) await repository.updatePayment(payment._id, { paymentStatus: 'Cancelled' }, session);
        if (attempt) await repository.updatePaymentAttempt(attempt._id, { paymentStatus: 'Cancelled' }, session);
      }
      const updatedOrder = await repository.claimOrderState(
        order._id,
        'Shipped',
        orderPatch,
        session,
      );
      if (!updatedOrder) throw new ApiError(409, 'Order changed during failed-delivery resolution');
      const updatedIncident = await repository.updateIncident(incident._id, {
        status: 'Resolved',
        resolutionCommandKey: commandKey,
        resolvedAt: clock(),
      }, session);
      await repository.updateCycle(incident.cycleId, { status: 'Closed' }, session);
      const occurredAt = new Date(clock());
      const businessEventId = `delivery-failed:${String(incident._id)}`;
      await repository.createOutbox(canonicalEnvelope({
        identityKey: `notification:${businessEventId}:customer`,
        businessEventId,
        eventType: 'DELIVERY_FAILED',
        aggregateType: 'DeliveryIncident',
        aggregateId: String(incident._id),
        occurredAt,
        recipientId: String(order.customerId),
        targetCollection: 'Order',
        targetId: String(order._id),
        displayValues: { orderCode: order.orderCode || String(order._id) },
      }, () => occurredAt), session);
      await auditLogger?.log?.({
        userId: staffId,
        action: 'DELIVERY_FAILURE_RESOLVED',
        targetEntity: 'Order',
        targetId: String(orderId),
        description: 'Resolved irrecoverable or returned original delivery',
      }, session);
      return {
        order: updatedOrder,
        incident: updatedIncident,
        refund,
        refundRequest,
        idempotentReplay: false,
      };
    });

    return result;
  }

  return {
    chooseIncidentResolution,
    recordReturnedReceipt,
    resolveDeliveryFailure,
  };
}

module.exports = { createDeliveryResolutionService };
