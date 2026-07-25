const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { cartVersionFilter } = require('./cartPersistence');

describe('Cart persistence version compatibility', () => {
  it('atomically promotes a legacy Cart without version when expectedVersion is zero', () => {
    assert.equal(typeof cartVersionFilter, 'function');
    assert.deepEqual(
      cartVersionFilter('cart-1', 0),
      {
        _id: 'cart-1',
        status: 'Active',
        $or: [
          { version: 0 },
          { version: { $exists: false } },
        ],
      },
    );
  });

  it('requires the exact persisted version after the legacy promotion', () => {
    assert.deepEqual(
      cartVersionFilter('cart-1', 3),
      {
        _id: 'cart-1',
        status: 'Active',
        version: 3,
      },
    );
  });
});
