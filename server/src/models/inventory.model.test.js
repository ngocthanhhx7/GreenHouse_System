const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const Inventory = require('./inventory.model');

describe('inventory model', () => {
  it('rejects fractional quantities and reservations above stock', () => {
    const inventory = new Inventory({
      productId: new mongoose.Types.ObjectId(),
      stockQuantity: 4,
      reservedQuantity: 5,
      damagedQuantity: 0.5,
      lowStockThreshold: 1,
    });

    const error = inventory.validateSync();

    assert.match(error.errors.reservedQuantity.message, /cannot exceed/);
    assert.match(error.errors.damagedQuantity.message, /non-negative integer/);
  });
});
