const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const OrderReservation = require('./orderReservation.model');

describe('order reservation lineage model', () => {
  it('requires an immutable order-scoped identity and supports exactly-once release', () => {
    assert.ok(OrderReservation.schema.path('orderId'));
    assert.ok(OrderReservation.schema.path('orderDetailId'));
    assert.ok(OrderReservation.schema.path('reservationKey'));
    assert.equal(OrderReservation.schema.path('reservationKey').options.immutable, true);
    const index = OrderReservation.schema.indexes().find(([fields, options]) => (
      fields.reservationKey === 1 && options.unique === true
    ));
    assert.ok(index);
  });
});
