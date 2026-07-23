import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EXCHANGE_STATUSES,
  translateExchangeStatus,
  translateShipmentStatus,
  translateShipmentEventType,
  translateShipmentDirection,
  translateShippingPayer,
  translateExchangeResponsibility,
  translateAfterSalesNotificationType,
} from './afterSalesLabels.js';

describe('Vietnamese after-sales labels', () => {
  it('exhaustively translates all 18 Exchange statuses without raw enums', () => {
    assert.equal(EXCHANGE_STATUSES.length, 18);
    EXCHANGE_STATUSES.forEach((status) => {
      assert.notEqual(translateExchangeStatus(status), status);
      assert.doesNotMatch(translateExchangeStatus(status), /^[A-Za-z]+$/);
    });
  });

  it('translates all shipment statuses, directions, and payer values', () => {
    ['InTransit', 'Delivered', 'Incident'].forEach((status) => {
      assert.notEqual(translateShipmentStatus(status), status);
    });
    [
      'CUSTOMER_TO_WAREHOUSE',
      'REPLACEMENT_TO_CUSTOMER',
      'REJECTED_ORIGINAL_TO_CUSTOMER',
    ].forEach((direction) => {
      assert.notEqual(translateShipmentDirection(direction), direction);
    });
    ['', 'SHOP', 'CUSTOMER'].forEach((payer) => {
      assert.notEqual(translateShippingPayer(payer), payer);
    });
  });

  it('exhaustively translates every known shipment event type without raw enums', () => {
    ['DELIVERED', 'LOST', 'DAMAGED', 'DISPUTED', 'CORRECTION'].forEach((eventType) => {
      assert.notEqual(translateShipmentEventType(eventType), eventType);
      assert.doesNotMatch(translateShipmentEventType(eventType), /^[A-Z_]+$/);
    });
  });

  it('translates Exchange rejected and completed notifications', () => {
    assert.notEqual(translateAfterSalesNotificationType('EXCHANGE_REJECTED'), 'EXCHANGE_REJECTED');
    assert.notEqual(translateAfterSalesNotificationType('EXCHANGE_COMPLETED'), 'EXCHANGE_COMPLETED');
  });

  it('translates every Exchange responsibility without raw enums', () => {
    ['', 'SHOP_FAULT', 'CUSTOMER_PREFERENCE'].forEach((responsibility) => {
      assert.notEqual(translateExchangeResponsibility(responsibility), responsibility);
    });
  });
});
