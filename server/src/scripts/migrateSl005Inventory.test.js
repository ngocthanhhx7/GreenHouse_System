const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  normalizeInventoryDocument,
  normalizeDamageDocument,
  normalizeReplenishmentDocument,
  updateBackfillDocument,
  migrateSl005Inventory,
} = require('./migrateSl005Inventory');

describe('SL-005 inventory migration', () => {
  it('normalizes legacy stock into sellable and reconciliation-aware fields', () => {
    assert.deepEqual(
      normalizeInventoryDocument({ stockQuantity: 2, reservedQuantity: 4, damagedQuantity: 1 }),
      {
        stockQuantity: 2,
        sellableQuantity: 2,
        reservedQuantity: 4,
        quarantinedQuantity: 0,
        damagedQuantity: 1,
        inventoryHealth: 'ReconciliationRequired',
        lowStockThresholdOverride: null,
      },
    );
  });

  it('maps legacy damage and replenishment lifecycle fields', () => {
    assert.deepEqual(normalizeDamageDocument({ quantity: 3, status: 'PendingWarehouseConfirmation' }), {
      quantity: 3,
      reportedQuantity: 3,
      evidence: [{ type: 'migration', reference: 'sl005-migration-damage:' }],
      status: 'PendingReview',
    });
    assert.deepEqual(normalizeReplenishmentDocument({ quantity: 5, receivedQuantity: 2, status: 'Receiving' }), {
      quantity: 5,
      requestedQuantity: 5,
      approvedQuantity: 5,
      netAcceptedQuantity: 2,
      receivedQuantity: 2,
      status: 'PartiallyReceived',
    });
    assert.equal(
      normalizeReplenishmentDocument({ quantity: 5, receivedQuantity: 0, status: 'Pending' }).status,
      'PendingApproval',
    );
  });

  it('preflights active-request conflicts and reconciles legacy quarantine before indexes', async () => {
    const calls = [];
    const result = await migrateSl005Inventory({
      repository: {
        async assertNoActiveReplenishmentConflicts() { calls.push('preflight'); },
        async backfillInventories() { calls.push('inventory'); return 2; },
        async reconcileDamageReports() { calls.push('damage'); return { reports: 1, quarantines: 1 }; },
        async backfillReplenishments() { calls.push('replenishment'); return 3; },
        async verifyIndexes() { calls.push('indexes'); return 4; },
      },
    });
    assert.deepEqual(calls, ['preflight', 'inventory', 'damage', 'replenishment', 'indexes']);
    assert.deepEqual(result, {
      inventoriesBackfilled: 2,
      damageReportsBackfilled: 1,
      damageQuarantinesCreated: 1,
      replenishmentsBackfilled: 3,
      indexesVerified: 4,
    });
  });

  it('does not advance timestamps when applying repeat-safe backfills', async () => {
    const calls = [];
    const Model = {
      async updateOne(filter, update, options) {
        calls.push({ filter, update, options });
        return { modifiedCount: 0 };
      },
    };

    await updateBackfillDocument(
      Model,
      { _id: 'inventory-1' },
      { sellableQuantity: 4 },
      { session: 'migration-session' },
    );

    assert.deepEqual(calls, [{
      filter: { _id: 'inventory-1' },
      update: { $set: { sellableQuantity: 4 } },
      options: { session: 'migration-session', timestamps: false },
    }]);
  });
});
