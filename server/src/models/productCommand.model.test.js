const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

describe('Product creation command persistence', () => {
  it('keeps one immutable create command per Admin and Idempotency-Key', () => {
    const ProductCommand = require('./productCommand.model');
    const indexes = ProductCommand.schema.indexes();
    const scopedUnique = indexes.find(
      ([key, options]) => options.name === 'product_command_admin_key_unique'
        && options.unique === true
        && key.adminId === 1
        && key.idempotencyKey === 1,
    );

    assert.ok(scopedUnique);
    for (const path of [
      'adminId',
      'idempotencyKey',
      'commandType',
      'requestHash',
      'productId',
      'resultSnapshot',
    ]) {
      assert.equal(ProductCommand.schema.path(path).options.immutable, true);
    }
  });
});
