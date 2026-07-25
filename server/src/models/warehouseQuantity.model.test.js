const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const ReplenishmentRequest = require('./replenishmentRequest.model');
const InventoryTransaction = require('./inventoryTransaction.model');

describe('warehouse quantity schema invariants', () => {
  it('rejects fractional replenishment and inventory transaction quantities', () => {
    const replenishment = new ReplenishmentRequest({
      productId: new mongoose.Types.ObjectId(), inventoryId: new mongoose.Types.ObjectId(), requestedBy: new mongoose.Types.ObjectId(),
      quantity: 2.5, receivedQuantity: 1.5, reason: 'Restock',
    });
    const transaction = new InventoryTransaction({
      productId: new mongoose.Types.ObjectId(), performedBy: new mongoose.Types.ObjectId(), transactionType: 'ADJUSTMENT',
      quantity: 0.5, beforeQuantity: 1.5, afterQuantity: 2,
    });

    assert.ok(replenishment.validateSync().errors.quantity);
    assert.ok(replenishment.validateSync().errors.receivedQuantity);
    assert.ok(transaction.validateSync().errors.quantity);
    assert.ok(transaction.validateSync().errors.beforeQuantity);
  });

  it('stores the related business entity for warehouse traceability', () => {
    assert.ok(InventoryTransaction.schema.path('relatedCollection'));
    assert.ok(InventoryTransaction.schema.path('relatedId'));
    assert.equal(InventoryTransaction.schema.path('commandFingerprint').options.maxlength, 64);
  });
});
