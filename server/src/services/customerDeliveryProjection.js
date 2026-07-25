function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function eventIdOf(shipment, receipt) {
  const value = receipt?.deliveryEventId || shipment?.terminalEventId;
  return value ? String(value) : '';
}

function receiptView(status, receipt, shipment) {
  const expectedDeliveryEventId = eventIdOf(shipment, receipt);
  return {
    status,
    latestDecisionAt: toIso(receipt?.respondedAt || receipt?.createdAt),
    reason: receipt?.reason || '',
    ...(expectedDeliveryEventId ? { expectedDeliveryEventId } : {}),
  };
}

function projectCustomerDelivery(order, shipment = null, latestReceipt = null) {
  const authoritativelyDelivered = (
    order?.orderStatus === 'Delivered'
    && shipment?.status === 'Delivered'
  );

  if (!authoritativelyDelivered) {
    return {
      customerOrderStatus: order?.orderStatus || 'Unknown',
      deliveryReceipt: receiptView('Unavailable', null, null),
      availableDeliveryActions: [],
      afterSales: {
        receiptGatePassed: false,
        enabled: false,
        blockReason: 'ORDER_NOT_AUTHORITATIVELY_DELIVERED',
      },
    };
  }

  if (latestReceipt?.outcome === 'RECEIVED') {
    return {
      customerOrderStatus: 'Completed',
      deliveryReceipt: receiptView('Received', latestReceipt, shipment),
      availableDeliveryActions: [],
      afterSales: {
        receiptGatePassed: true,
        enabled: true,
        blockReason: null,
      },
    };
  }

  if (latestReceipt?.outcome === 'NOT_RECEIVED') {
    return {
      customerOrderStatus: 'DeliveryDisputed',
      deliveryReceipt: receiptView('Disputed', latestReceipt, shipment),
      availableDeliveryActions: ['RECEIVED'],
      afterSales: {
        receiptGatePassed: false,
        enabled: false,
        blockReason: 'DELIVERY_DISPUTED',
      },
    };
  }

  return {
    customerOrderStatus: 'AwaitingCustomerConfirmation',
    deliveryReceipt: receiptView('Awaiting', null, shipment),
    availableDeliveryActions: ['RECEIVED', 'NOT_RECEIVED'],
    afterSales: {
      receiptGatePassed: false,
      enabled: false,
      blockReason: 'AWAITING_CUSTOMER_CONFIRMATION',
    },
  };
}

module.exports = { projectCustomerDelivery };
