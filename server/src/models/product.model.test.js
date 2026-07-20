const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const Product = require('./product.model');

describe('product model', () => {
  it('stores stock quantity for cart and order stock validation', () => {
    const path = Product.schema.path('stockQuantity');

    assert.ok(path);
    assert.equal(path.instance, 'Number');
    assert.equal(path.options.min, 0);
  });

  it('defaults legacy products to VND and rejects unsupported currencies', () => {
    const currencyPath = Product.schema.path('currency');
    const product = new Product({
      name: 'Legacy Product',
      price: 10,
      unit: 'piece',
      categoryId: new mongoose.Types.ObjectId(),
    });
    const invalidProduct = new Product({
      name: 'Foreign Currency Product',
      price: 10,
      unit: 'piece',
      categoryId: new mongoose.Types.ObjectId(),
      currency: 'USD',
    });

    assert.ok(currencyPath);
    assert.equal(currencyPath.options.default, 'VND');
    assert.deepEqual(currencyPath.enumValues, ['VND']);
    assert.equal(product.currency, 'VND');
    assert.match(invalidProduct.validateSync().errors.currency.message, /USD/);
  });

  it('enforces uniqueness only for non-empty SKU values', () => {
    const skuIndex = Product.schema.indexes().find(([key]) => key.sku === 1);

    assert.ok(skuIndex);
    assert.equal(skuIndex[1].unique, true);
    assert.deepEqual(skuIndex[1].partialFilterExpression, { sku: { $type: 'string', $gt: '' } });
  });
});
