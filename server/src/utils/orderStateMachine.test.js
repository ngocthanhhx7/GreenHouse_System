const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { canTransitionOrderStatus, getAllowedOrderStatusTransitions } = require('./orderStateMachine');

describe('order state machine', () => {
  it('allows staff operation statuses in the expected order', () => {
    assert.equal(canTransitionOrderStatus('Pending', 'Confirmed'), true);
    assert.equal(canTransitionOrderStatus('Confirmed', 'Packed'), true);
    assert.equal(canTransitionOrderStatus('Packed', 'Shipped'), true);
    assert.equal(canTransitionOrderStatus('Shipped', 'Delivered'), true);
    assert.equal(canTransitionOrderStatus('Pending', 'Cancelled'), true);
    assert.equal(canTransitionOrderStatus('Confirmed', 'Cancelled'), true);
    assert.equal(canTransitionOrderStatus('Delivered', 'Returned'), true);
    assert.equal(canTransitionOrderStatus('Shipped', 'DeliveryFailed'), false);
  });

  it('rejects skipped staff order transitions', () => {
    assert.equal(canTransitionOrderStatus('Confirmed', 'Shipped'), false);
    assert.deepEqual(getAllowedOrderStatusTransitions('Confirmed'), ['Packed', 'Cancelled']);
    assert.deepEqual(getAllowedOrderStatusTransitions('DeliveryFailed'), []);
  });
});
