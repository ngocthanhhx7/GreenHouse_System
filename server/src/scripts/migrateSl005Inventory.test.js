const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  normalizeInventoryDocument,
  normalizeDamageDocument,
  normalizeReplenishmentDocument,
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
      quantity: 3, reportedQuantity: 3, status: 'PendingReview',
    });
    assert.deepEqual(normalizeReplenishmentDocument({ quantity: 5, receivedQuantity: 2, status: 'Receiving' }), {
      quantity: 5,
      requestedQuantity: 5,
      approvedQuantity: 5,
      netAcceptedQuantity: 2,
      receivedQuantity: 2,
      status: 'PartiallyReceived',
    });
  });

  it('runs all backfills and verifies indexes', async () => {
    const calls = [];
    const result = await migrateSl005Inventory({
      repository: {
        async backfillInventories() { calls.push('inventory'); return 2; },
        async backfillDamageReports() { calls.push('damage'); return 1; },
        async backfillReplenishments() { calls.push('replenishment'); return 3; },
        async verifyIndexes() { calls.push('indexes'); return 4; },
      },
    });
    assert.deepEqual(calls, ['inventory', 'damage', 'replenishment', 'indexes']);
    assert.deepEqual(result, {
      inventoriesBackfilled: 2,
      damageReportsBackfilled: 1,
      replenishmentsBackfilled: 3,
      indexesVerified: 4,
    });
  });
});
