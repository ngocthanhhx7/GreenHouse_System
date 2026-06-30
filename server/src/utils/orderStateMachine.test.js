const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { canTransitionOrderStatus, getAllowedOrderStatusTransitions } = require('./orderStateMachine');

describe('order state machine', () => {
  it('allows staff operation statuses in the expected order', () => {
    assert.equal(canTransitionOrderStatus('Confirmed', 'StockExportRequested'), true);
    assert.equal(canTransitionOrderStatus('StockExportRequested', 'Packed'), true);
    assert.equal(canTransitionOrderStatus('Packed', 'Shipped'), true);
    assert.equal(canTransitionOrderStatus('Shipped', 'Delivered'), true);
  });

  it('rejects skipped staff order transitions', () => {
    assert.equal(canTransitionOrderStatus('Confirmed', 'Shipped'), false);
    assert.deepEqual(getAllowedOrderStatusTransitions('Confirmed'), ['StockExportRequested']);
  });
});
