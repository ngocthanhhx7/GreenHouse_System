const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const Order = require('./order.model');

describe('SL-003 Order persistence contract', () => {
  it('keeps payment waiting and expiry out of the Order lifecycle', () => {
    const statuses = Order.schema.path('orderStatus').enumValues;

    assert.equal(statuses.includes('WaitingForPayment'), false);
    assert.equal(statuses.includes('Expired'), false);
    assert.ok(statuses.includes('Pending'));
    assert.ok(statuses.includes('Cancelled'));
  });

  it('persists and serializes an immutable online payment deadline', () => {
    const deadlinePath = Order.schema.path('paymentDeadlineAt');
    const deadline = new Date('2026-07-23T10:15:00.000Z');
    const order = new Order({ paymentDeadlineAt: deadline });

    assert.ok(deadlinePath);
    assert.equal(deadlinePath.instance, 'Date');
    assert.equal(deadlinePath.options.default, null);
    assert.equal(deadlinePath.options.immutable, true);
    assert.equal(order.toJSON().paymentDeadlineAt.toISOString(), deadline.toISOString());
  });

  it('stores the immutable payment-timeout setting snapshot used to derive the deadline', () => {
    const minutesPath = Order.schema.path('paymentTimeoutMinutesSnapshot');
    const versionPath = Order.schema.path('paymentTimeoutSettingVersion');

    assert.equal(minutesPath.options.immutable, true);
    assert.equal(minutesPath.options.min, 5);
    assert.equal(minutesPath.options.max, 60);
    assert.equal(versionPath.options.immutable, true);
    assert.equal(versionPath.options.min, 0);
  });

  it('stores trimmed checkout and cancellation replay identities with empty defaults', () => {
    const fields = ['checkoutRequestHash', 'cancelIdempotencyKey', 'cancelRequestHash'];
    for (const field of fields) {
      const path = Order.schema.path(field);
      assert.ok(path, field);
      assert.equal(path.options.default, '', field);
      assert.equal(path.options.trim, true, field);
    }

    const emptyOrder = new Order();
    assert.deepEqual(
      fields.map((field) => emptyOrder[field]),
      ['', '', ''],
    );

    const populatedOrder = new Order({
      checkoutRequestHash: '  checkout-hash  ',
      cancelIdempotencyKey: '  cancel-key  ',
      cancelRequestHash: '  cancel-hash  ',
    });
    assert.deepEqual(
      fields.map((field) => populatedOrder[field]),
      ['checkout-hash', 'cancel-key', 'cancel-hash'],
    );
  });
});
