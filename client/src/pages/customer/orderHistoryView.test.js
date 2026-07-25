import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ORDER_TABS,
  filterOrdersByTab,
  getOrderActions,
  orderTabFor,
} from './orderHistoryView.js';

describe('customer order history projection', () => {
  it('maps backend states into the seven approved tabs', () => {
    assert.deepEqual(ORDER_TABS.map((tab) => tab.id), [
      'all', 'payment', 'pending', 'processing', 'shipping', 'completed', 'cancelled',
    ]);
    assert.equal(orderTabFor({ orderStatus: 'Pending', paymentStatus: 'Pending', paymentMethod: 'ONLINE' }), 'payment');
    assert.equal(orderTabFor({ orderStatus: 'Pending', paymentStatus: 'Unpaid', paymentMethod: 'COD' }), 'pending');
    assert.equal(orderTabFor({ orderStatus: 'Confirmed' }), 'processing');
    assert.equal(orderTabFor({ orderStatus: 'Packed' }), 'processing');
    assert.equal(orderTabFor({ orderStatus: 'Shipped' }), 'shipping');
    assert.equal(orderTabFor({ orderStatus: 'Delivered' }), 'completed');
    assert.equal(orderTabFor({ orderStatus: 'Cancelled' }), 'cancelled');
  });

  it('filters without inventing backend states', () => {
    const orders = [
      { id: 'a', orderStatus: 'Shipped' },
      { id: 'b', orderStatus: 'Delivered' },
    ];
    assert.deepEqual(filterOrdersByTab(orders, 'shipping').map((order) => order.id), ['a']);
    assert.deepEqual(filterOrdersByTab(orders, 'all').map((order) => order.id), ['a', 'b']);
  });

  it('shows only actions allowed by current order facts', () => {
    const payment = getOrderActions({
      id: 'a',
      orderStatus: 'Pending',
      paymentStatus: 'Pending',
      paymentMethod: 'ONLINE',
      paymentDeadlineAt: '2099-01-01T00:00:00.000Z',
    }, new Date('2026-07-25T00:00:00.000Z'));
    assert.equal(payment.canPay, true);
    assert.equal(payment.canCancel, true);
    assert.equal(payment.canReview, false);
    assert.equal(getOrderActions({ id: 'b', orderStatus: 'Delivered' }).canReview, true);
  });
});
