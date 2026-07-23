const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createDamageReportService } = require('./damageReport.service');

function createRepository() {
  const inventory = {
    _id: 'inv-1',
    productId: 'product-1',
    sellableQuantity: 10,
    stockQuantity: 10,
    reservedQuantity: 2,
    damagedQuantity: 0,
    quarantinedQuantity: 0,
    inventoryHealth: 'Normal',
  };
  const reports = [];
  const transactions = [];
  return {
    inventory,
    reports,
    transactions,
    async listReports(query = {}) {
      return reports.filter((report) => !query.status || report.status === query.status);
    },
    async createReport(data) {
      const report = {
        _id: `damage-${reports.length + 1}`,
        status: 'PendingReview',
        ...data,
      };
      reports.push(report);
      return report;
    },
    async findReportById(id) { return reports.find((report) => report._id === id) || null; },
    async findReportByIdempotencyKey(key) { return reports.find((report) => report.idempotencyKey === key) || null; },
    async findInventoryById(id) { return id === inventory._id ? inventory : null; },
    async findInventoryByProductId(id) { return id === inventory.productId ? inventory : null; },
    async findAffectedOrderIds() { return ['order-1']; },
    async updateInventory(id, patch) {
      if (id !== inventory._id) return null;
      Object.assign(inventory, patch);
      return inventory;
    },
    async claimWarehouseResolution(id, data) {
      const report = reports.find((entry) => entry._id === id && entry.status === 'PendingReview');
      if (!report) return null;
      Object.assign(report, data, { status: 'Confirmed' });
      return report;
    },
    async quarantineInventory(id, quantity, actorId, patch) {
      if (id !== inventory._id || inventory.sellableQuantity - inventory.reservedQuantity < quantity) return null;
      inventory.sellableQuantity -= quantity;
      inventory.stockQuantity = inventory.sellableQuantity;
      inventory.quarantinedQuantity += quantity;
      Object.assign(inventory, patch);
      return inventory;
    },
    async createTransaction(data) {
      transactions.push(data);
      return data;
    },
  };
}

describe('damage report service contract', () => {
  it('requires evidence and idempotency for staff reports', async () => {
    const service = createDamageReportService({
      repository: createRepository(),
      transactionManager: { withTransaction: async (work) => work(null) },
      auditLogger: { async log() {} },
    });
    await assert.rejects(
      () => service.createStaffReport('staff-1', {
        inventoryId: 'inv-1', quantity: 2, reason: 'Broken during inspection',
      }),
      /Damage evidence is required/,
    );
    const report = await service.createStaffReport('staff-1', {
      inventoryId: 'inv-1',
      quantity: 2,
      reason: 'Broken during inspection',
      evidence: ['evidence://damage-1'],
      idempotencyKey: 'damage-create-1',
    });
    assert.equal(report.status, 'PendingReview');
  });

  it('applies only an evidence-backed Warehouse decision and records quarantine movement', async () => {
    const repository = createRepository();
    const service = createDamageReportService({
      repository,
      transactionManager: { withTransaction: async (work) => work(null) },
      auditLogger: { async log() {} },
    });
    const report = await service.createStaffReport('staff-1', {
      inventoryId: 'inv-1',
      quantity: 3,
      reason: 'Broken during inspection',
      evidence: ['evidence://damage-2'],
      idempotencyKey: 'damage-create-2',
    });
    const resolved = await service.resolveWarehouseReport('warehouse-1', report.id, {
      confirmedQuantity: 3,
      decisionReason: 'Confirmed at receiving desk',
      evidence: ['evidence://warehouse-1'],
      idempotencyKey: 'damage-decision-1',
    });
    assert.equal(resolved.status, 'Confirmed');
    assert.equal(repository.inventory.sellableQuantity, 7);
    assert.equal(repository.inventory.damagedQuantity, 3);
    assert.equal(repository.transactions.at(-1).transactionType, 'DAMAGE_CONFIRMED');
  });
});
