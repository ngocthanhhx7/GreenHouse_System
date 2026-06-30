const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const Product = require('./product.model');

describe('product model', () => {
  it('stores stock quantity for cart and order stock validation', () => {
    const path = Product.schema.path('stockQuantity');

    assert.ok(path);
    assert.equal(path.instance, 'Number');
    assert.equal(path.options.min, 0);
  });
});
