const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createDamageReportService } = require('./damageReport.service');

function createRepository() {
  const inventory = { _id: 'inv-1', productId: 'product-1', stockQuantity: 10, reservedQuantity: 2, damagedQuantity: 0 };
  const reports = [];
  const transactions = [];
  return {
    inventory, reports, transactions,
    async listReports(query = {}) { return reports.filter((report) => !query.status || report.status === query.status); },
    async createReport(data) { const report = { _id: `damage-${reports.length + 1}`, status: 'PendingWarehouseConfirmation', ...data }; reports.push(report); return report; },
    async findReportById(id) { return reports.find((report) => report._id === id) || null; },
    async claimConfirmation(id, warehouseId) { const report = reports.find((entry) => entry._id === id && entry.status === 'PendingWarehouseConfirmation'); if (!report) return null; Object.assign(report, { status: 'Confirming', confirmedBy: warehouseId }); return report; },
    async completeConfirmation(id) { const report = reports.find((entry) => entry._id === id && entry.status === 'Confirming'); if (!report) return null; Object.assign(report, { status: 'Confirmed', confirmedAt: new Date() }); return report; },
    async findInventoryById(id) { return id === inventory._id ? inventory : null; },
    async applyDamage(id, quantity) { if (id !== inventory._id || inventory.stockQuantity - inventory.reservedQuantity < quantity) return null; inventory.stockQuantity -= quantity; inventory.damagedQuantity += quantity; return inventory; },
    async createTransaction(data) { transactions.push(data); return data; },
  };
}

describe('damage report service contract', () => {
  it('lists the warehouse queue and returns one report detail', async () => {
    const repository = createRepository();
    const service = createDamageReportService({
      repository,
      transactionManager: { withTransaction: async (work) => work(null) },
      auditLogger: { async log() {} },
    });
    const report = await service.createStaffReport('staff-1', { inventoryId: 'inv-1', quantity: 2, reason: 'Broken during inspection' });

    const queue = await service.listWarehouseReports({ status: 'PendingWarehouseConfirmation' });
    const detail = await service.getWarehouseReport(report.id);

    assert.equal(queue.total, 1);
    assert.equal(queue.items[0].id, report.id);
    assert.equal(detail.id, report.id);

    await assert.rejects(() => service.listWarehouseReports({ status: 'Unknown' }), /Invalid damage report status/);
    await assert.rejects(() => service.getWarehouseReport('missing'), /Damage report not found/);
  });

  it('does not alter inventory until warehouse confirms a staff report', async () => {
    const repository = createRepository();
    const auditEntries = [];
    const service = createDamageReportService({
      repository,
      transactionManager: { withTransaction: async (work) => work(null) },
      auditLogger: { async log(entry) { auditEntries.push(entry); } },
    });

    const report = await service.createStaffReport('staff-1', { inventoryId: 'inv-1', quantity: 3, reason: 'Vỡ khi kiểm đếm' });
    assert.equal(report.status, 'PendingWarehouseConfirmation');
    assert.equal(repository.inventory.stockQuantity, 10);

    await service.confirmWarehouseReport('warehouse-1', report.id);
    assert.equal(repository.inventory.stockQuantity, 7);
    assert.equal(repository.inventory.damagedQuantity, 3);
    assert.equal(repository.transactions[0].transactionType, 'DAMAGE_CONFIRMED');
    assert.equal(repository.transactions[0].relatedCollection, 'DamageReport');
    assert.deepEqual(auditEntries.map((entry) => entry.action), ['DAMAGE_REPORT_CREATE', 'DAMAGE_REPORT_CONFIRM']);
  });
});
