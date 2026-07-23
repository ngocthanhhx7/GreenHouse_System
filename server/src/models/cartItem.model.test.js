const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const CartItem = require('./cartItem.model');

describe('cart item model SL-003 price evidence', () => {
  it('stores the product price version shown to the customer', () => {
    const path = CartItem.schema.path('priceVersion');
    assert.ok(path);
    assert.equal(path.instance, 'Date');
    assert.equal(path.options.required, true);
  });
});
