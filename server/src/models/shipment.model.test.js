const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const Shipment = require('./shipment.model');

describe('shipment customer receipt concurrency metadata', () => {
  it('keeps one private non-physical guard version for customer receipt serialization', () => {
    const guard = Shipment.schema.path('customerReceiptGuardVersion');

    assert.ok(guard);
    assert.equal(guard.instance, 'Number');
    assert.equal(guard.options.default, 0);
    assert.equal(guard.options.min, 0);
    assert.equal(guard.options.select, false);
    for (const physicalField of ['status', 'terminalEventId', 'deliveredAt']) {
      assert.notEqual(
        Shipment.schema.path(physicalField),
        guard,
        `${physicalField} remains separate from technical receipt concurrency metadata`,
      );
    }
  });
});
