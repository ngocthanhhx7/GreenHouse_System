const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const ReplenishmentReceipt = require('./replenishmentReceipt.model');

describe('replenishment receipt model', () => {
  it('rejects delivered totals that do not equal accepted plus rejected', () => {
    const receipt = new ReplenishmentReceipt({
      replenishmentRequestId: new mongoose.Types.ObjectId(),
      productId: new mongoose.Types.ObjectId(),
      supplierReference: 'SUP-1',
      deliveryReference: 'DEL-1',
      deliveredQuantity: 3,
      acceptedSellableQuantity: 2,
      rejectedQuantity: 0,
      inspectedBy: new mongoose.Types.ObjectId(),
      idempotencyKey: 'receipt-1',
    });
    assert.match(receipt.validateSync().errors.deliveredQuantity.message, /must equal/);
  });
});
