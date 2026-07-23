const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createInventoryService } = require('./inventory.service');
const { createDamageReportService } = require('./damageReport.service');
const { createReplenishmentService } = require('./replenishment.service');

function createInventoryRepository() {
  const inventory = {
    _id: 'inv-1',
    productId: 'product-1',
    productName: 'Test Product',
    sellableQuantity: 10,
    reservedQuantity: 2,
    quarantinedQuantity: 0,
    damagedQuantity: 0,
    lowStockThreshold: 5,
    inventoryHealth: 'Normal',
  };
  const transactions = [];
  return {
    inventory,
    transactions,
    async findInventoryById(id) { return id === inventory._id ? inventory : null; },
    async claimPhysicalCount(id, countedSellableQuantity, userId) {
      if (id !== inventory._id) return null;
      const before = inventory.sellableQuantity;
      inventory.sellableQuantity = countedSellableQuantity;
      inventory.lastUpdatedBy = userId;
      return { ...inventory, beforeSellableQuantity: before };
    },
    async createTransaction(data) { transactions.push(data); return data; },
  };
}

function createDamageRepository() {
  const inventory = {
    _id: 'inv-1',
    productId: 'product-1',
    sellableQuantity: 10,
    reservedQuantity: 2,
    quarantinedQuantity: 0,
    damagedQuantity: 0,
  };
  const reports = [];
  const transactions = [];
  return {
    inventory,
    reports,
    transactions,
    async findInventoryById(id) { return id === inventory._id ? inventory : null; },
    async findReportById(id) { return reports.find((entry) => entry._id === id) || null; },
    async findReportByIdempotencyKey(key) { return reports.find((entry) => entry.idempotencyKey === key) || null; },
    async createReport(data) {
      const report = { _id: `damage-${reports.length + 1}`, ...data };
      reports.push(report);
      return report;
    },
    async claimDamageReport(id, patch) {
      const report = reports.find((entry) => entry._id === id && entry.status === 'PendingReview');
      if (!report) return null;
      Object.assign(report, patch);
      return report;
    },
    async updateInventory(id, patch) {
      if (id !== inventory._id) return null;
      Object.assign(inventory, patch);
      return inventory;
    },
    async createTransaction(data) { transactions.push(data); return data; },
  };
}

function createReplenishmentRepository() {
  const inventory = {
    _id: 'inv-1',
    productId: 'product-1',
    productName: 'Test Product',
    sellableQuantity: 2,
    reservedQuantity: 0,
    quarantinedQuantity: 0,
    damagedQuantity: 0,
  };
  const requests = [];
  const receipts = [];
  const transactions = [];
  return {
    inventory,
    requests,
    receipts,
    transactions,
    async findInventoryById(id) { return id === inventory._id ? inventory : null; },
    async findActiveRequestByProductId(productId) {
      return requests.find((entry) => entry.productId === productId && ['PendingApproval', 'Approved', 'PartiallyReceived', 'ShortClosurePending'].includes(entry.status)) || null;
    },
    async findRequestById(id) { return requests.find((entry) => entry._id === id) || null; },
    async findRequestByIdempotencyKey(key) { return requests.find((entry) => entry.idempotencyKey === key) || null; },
    async createRequest(data) {
      const request = { _id: `rep-${requests.length + 1}`, ...data };
      requests.push(request);
      return request;
    },
    async claimDecision(id, patch) {
      const request = requests.find((entry) => entry._id === id && entry.status === 'PendingApproval');
      if (!request) return null;
      Object.assign(request, patch);
      return request;
    },
    async createReceipt(data) {
      const receipt = { _id: `receipt-${receipts.length + 1}`, ...data };
      receipts.push(receipt);
      return receipt;
    },
    async findReceiptByIdempotencyKey(key) {
      return receipts.find((receipt) => receipt.idempotencyKey === key) || null;
    },
    async claimReceiptProjection(id, expected, patch, receipt) {
      const request = requests.find((entry) => entry._id === id
        && ['Approved', 'PartiallyReceived'].includes(entry.status)
        && Number(entry.netAcceptedQuantity || 0) === Number(expected.netAcceptedQuantity || 0));
      if (!request) return null;
      Object.assign(request, patch);
      request.receipts = [...(request.receipts || []), receipt];
      return request;
    },
    async updateRequest(id, patch) {
      const request = requests.find((entry) => entry._id === id);
      if (!request) return null;
      Object.assign(request, patch);
      return request;
    },
    async updateInventory(id, patch) {
      if (id !== inventory._id) return null;
      Object.assign(inventory, patch);
      return inventory;
    },
    async createTransaction(data) { transactions.push(data); return data; },
  };
}

describe('SL-005 acceptance contracts', () => {
  it('records a counted sellable quantity and derives the adjustment transaction', async () => {
    const repository = createInventoryRepository();
    const service = createInventoryService({
      repository,
      transactionManager: { withTransaction: async (work) => work(null) },
      auditLogger: { async log() {} },
      assignmentCoordinator: { async coordinate() {} },
      eventPublisher: null,
    });

    const result = await service.recordPhysicalCount('warehouse-1', 'inv-1', {
      countedSellableQuantity: 7,
      reason: 'Cycle count with evidence',
      evidence: [{ file: 'count.jpg' }],
      idempotencyKey: 'count-1',
    });

    assert.equal(result.inventory.sellableQuantity, 7);
    assert.equal(result.transaction.quantity, -3);
    assert.equal(result.transaction.beforeSellableQuantity, 10);
    assert.equal(result.transaction.afterSellableQuantity, 7);
  });

  it('quarantines damage on report, supports a partial warehouse decision, and is idempotent', async () => {
    const repository = createDamageRepository();
    const service = createDamageReportService({
      repository,
      transactionManager: { withTransaction: async (work) => work(null) },
      auditLogger: { async log() {} },
      assignmentCoordinator: { async coordinate() {} },
    });

    const report = await service.createStaffReport('staff-1', {
      inventoryId: 'inv-1',
      quantity: 4,
      reason: 'Cracked units',
      evidence: [{ file: 'damage.jpg' }],
      idempotencyKey: 'damage-1',
    });
    assert.equal(repository.inventory.sellableQuantity, 6);
    assert.equal(repository.inventory.quarantinedQuantity, 4);
    assert.equal((await service.createStaffReport('staff-1', {
      inventoryId: 'inv-1', quantity: 4, reason: 'retry', evidence: [{ file: 'damage.jpg' }], idempotencyKey: 'damage-1',
    })).id, report.id);

    const decision = await service.resolveWarehouseReport('warehouse-1', report.id, {
      confirmedQuantity: 1,
      decisionReason: 'One unit is damaged',
      evidence: [{ file: 'inspection.jpg' }],
      idempotencyKey: 'damage-decision-1',
    });
    assert.equal(decision.status, 'PartiallyConfirmed');
    assert.equal(repository.inventory.sellableQuantity, 9);
    assert.equal(repository.inventory.quarantinedQuantity, 0);
    assert.equal(repository.inventory.damagedQuantity, 1);
  });

  it('approves immutable replenishment quantity and accepts partial receipt with rejected units', async () => {
    const repository = createReplenishmentRepository();
    const service = createReplenishmentService({
      repository,
      transactionManager: { withTransaction: async (work) => work(null) },
      auditLogger: { async log() {} },
      eventPublisher: null,
      assignmentCoordinator: { async coordinate() {} },
    });

    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1',
      quantity: 5,
      reason: 'Below threshold',
      evidence: [{ file: 'stock-count.jpg' }],
      idempotencyKey: 'request-1',
    });
    const approved = await service.updateRequestStatus('admin-1', request.id, {
      status: 'Approved',
      note: 'Approved exact quantity',
    });
    assert.equal(approved.approvedQuantity, 5);
    assert.equal(repository.inventory.sellableQuantity, 2);

    const received = await service.receiveRequest('warehouse-1', request.id, {
      supplierReference: 'SUP-1',
      deliveryReference: 'DEL-1',
      deliveredQuantity: 4,
      acceptedSellableQuantity: 3,
      rejectedQuantity: 1,
      rejectedReason: 'One dented unit',
      evidence: [{ file: 'delivery.jpg' }],
      idempotencyKey: 'receipt-1',
    });
    assert.equal(received.status, 'PartiallyReceived');
    assert.equal(repository.inventory.sellableQuantity, 5);
    assert.equal(repository.transactions[0].transactionType, 'REPLENISHMENT_RECEIVE');
  });
});
