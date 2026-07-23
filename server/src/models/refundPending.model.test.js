const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const RefundPending = require('./refundPending.model');

describe('RefundPending obligation identity', () => {
  it('keys new obligations by obligationKey without preventing distinct obligations on one order', () => {
    const byKey = RefundPending.schema.indexes().find(([fields, options]) => fields.obligationKey === 1 && options.unique === true);
    const byType = RefundPending.schema.indexes().find(([fields, options]) => fields.orderId === 1 && fields.obligationType === 1);
    assert.ok(byKey, 'an obligation key must be unique');
    assert.ok(byType, 'order/type must remain queryable');
    assert.notEqual(byType[1].unique, true, 'one order can have more than one obligation of a type when each key is distinct');
    assert.ok(RefundPending.schema.path('payoutOperationKey'));
    assert.ok(RefundPending.schema.path('payoutProviderReference'));
  });
});
