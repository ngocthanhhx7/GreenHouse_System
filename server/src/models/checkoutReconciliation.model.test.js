const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const Cart = require('./cart.model');
const CartItem = require('./cartItem.model');
const Order = require('./order.model');
const PaymentCallbackEvent = require('./paymentCallbackEvent.model');

describe('checkout reconciliation model contracts', () => {
  it('permits only one active cart per customer via a partial unique index', () => {
    const index = Cart.schema.indexes().find(([key, options]) => key.customerId === 1 && options.name === 'one_active_cart_per_customer');
    assert.ok(index);
    assert.equal(index[1].unique, true);
    assert.deepEqual(index[1].partialFilterExpression, { status: 'Active' });
  });

  it('requires cart item quantities to be positive integers', () => {
    const item = new CartItem({ cartId: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId(), productName: 'Pan', unitPrice: 1, quantity: 1.5 });
    assert.match(item.validateSync().errors.quantity.message, /positive integer/);
  });

  it('deduplicates checkout and callback delivery identities with unique indexes', () => {
    const checkoutIndex = Order.schema.indexes().find(([key, options]) => key.customerId === 1 && key.idempotencyKey === 1 && options.name === 'order_checkout_idempotency_key');
    const callbackIndex = PaymentCallbackEvent.schema.indexes().find(([key, options]) => key.paymentProvider === 1 && key.providerMessageId === 1);
    assert.ok(checkoutIndex?.[1].unique);
    assert.ok(callbackIndex?.[1].unique);
  });
});
