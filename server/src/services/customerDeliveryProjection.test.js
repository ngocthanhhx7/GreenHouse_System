const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { projectCustomerDelivery } = require('./customerDeliveryProjection');

describe('customer delivery projection', () => {
  const deliveredOrder = { orderStatus: 'Delivered' };
  const deliveredShipment = { status: 'Delivered', terminalEventId: 'delivery-event-1' };

  it('keeps orders without authoritative physical delivery unavailable', () => {
    assert.deepEqual(projectCustomerDelivery(
      { orderStatus: 'Shipping' },
      { status: 'HandedOff' },
      null,
    ), {
      customerOrderStatus: 'Shipping',
      deliveryReceipt: {
        status: 'Unavailable',
        latestDecisionAt: null,
        reason: '',
      },
      availableDeliveryActions: [],
      afterSales: {
        receiptGatePassed: false,
        enabled: false,
        blockReason: 'ORDER_NOT_AUTHORITATIVELY_DELIVERED',
      },
    });
  });

  it('keeps legacy Delivered orders awaiting an explicit Customer decision', () => {
    assert.deepEqual(projectCustomerDelivery(deliveredOrder, deliveredShipment, null), {
      customerOrderStatus: 'AwaitingCustomerConfirmation',
      deliveryReceipt: {
        status: 'Awaiting',
        latestDecisionAt: null,
        reason: '',
        expectedDeliveryEventId: 'delivery-event-1',
      },
      availableDeliveryActions: ['RECEIVED', 'NOT_RECEIVED'],
      afterSales: {
        receiptGatePassed: false,
        enabled: false,
        blockReason: 'AWAITING_CUSTOMER_CONFIRMATION',
      },
    });
  });

  it('keeps a non-receipt dispute under delivery and permits only a later receipt', () => {
    assert.deepEqual(projectCustomerDelivery(deliveredOrder, deliveredShipment, {
      outcome: 'NOT_RECEIVED',
      reason: 'The carrier did not hand over the parcel',
      respondedAt: new Date('2026-07-26T12:00:00.000Z'),
      deliveryEventId: 'delivery-event-1',
    }), {
      customerOrderStatus: 'DeliveryDisputed',
      deliveryReceipt: {
        status: 'Disputed',
        latestDecisionAt: '2026-07-26T12:00:00.000Z',
        reason: 'The carrier did not hand over the parcel',
        expectedDeliveryEventId: 'delivery-event-1',
      },
      availableDeliveryActions: ['RECEIVED'],
      afterSales: {
        receiptGatePassed: false,
        enabled: false,
        blockReason: 'DELIVERY_DISPUTED',
      },
    });
  });

  it('marks only explicit Customer receipt as completed and after-sales eligible', () => {
    assert.deepEqual(projectCustomerDelivery(deliveredOrder, deliveredShipment, {
      outcome: 'RECEIVED',
      reason: '',
      respondedAt: new Date('2026-07-26T13:00:00.000Z'),
      deliveryEventId: 'delivery-event-1',
    }), {
      customerOrderStatus: 'Completed',
      deliveryReceipt: {
        status: 'Received',
        latestDecisionAt: '2026-07-26T13:00:00.000Z',
        reason: '',
        expectedDeliveryEventId: 'delivery-event-1',
      },
      availableDeliveryActions: [],
      afterSales: {
        receiptGatePassed: true,
        enabled: true,
        blockReason: null,
      },
    });
  });
});
