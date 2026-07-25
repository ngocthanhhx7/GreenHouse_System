const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createDamageReportService } = require('./damageReport.service');

function createRepository() {
  const inventory = {
    _id: 'inv-1',
    productId: 'product-1',
    stockQuantity: 10,
    sellableQuantity: 10,
    reservedQuantity: 8,
    quarantinedQuantity: 0,
    damagedQuantity: 0,
    inventoryHealth: 'Normal',
    affectedOrderIds: [],
  };
  const reports = [];
  const transactions = [];
  const outbox = [];
  return {
    inventory,
    reports,
    transactions,
    outbox,
    snapshot() {
      return structuredClone({ inventory, reports, transactions, outbox });
    },
    restore(snapshot) {
      for (const key of Object.keys(inventory)) delete inventory[key];
      Object.assign(inventory, snapshot.inventory);
      reports.splice(0, reports.length, ...snapshot.reports);
      transactions.splice(0, transactions.length, ...snapshot.transactions);
      outbox.splice(0, outbox.length, ...snapshot.outbox);
    },
    async findInventoryById(id) { return String(id) === inventory._id ? inventory : null; },
    async findInventoryByProductId(productId) { return String(productId) === inventory.productId ? inventory : null; },
    async findAffectedOrderIds() { return ['order-1']; },
    async findReportById(id) { return reports.find((report) => report._id === id) || null; },
    async findReportByIdempotencyKey(key) { return reports.find((report) => report.idempotencyKey === key) || null; },
    async findTransactionByIdempotencyKey(key) {
      return transactions.find((transaction) => transaction.idempotencyKey === key) || null;
    },
    async createReport(data) {
      const report = { _id: `damage-${reports.length + 1}`, ...data };
      reports.push(report);
      return report;
    },
    async quarantineInventory(id, quantity, actorId, patch = {}) {
      if (String(id) !== inventory._id || inventory.sellableQuantity < quantity) return null;
      inventory.sellableQuantity -= quantity;
      inventory.stockQuantity = inventory.sellableQuantity;
      inventory.quarantinedQuantity += quantity;
      inventory.lastUpdatedBy = actorId;
      Object.assign(inventory, patch);
      return inventory;
    },
    async updateInventory(id, patch) {
      if (String(id) !== inventory._id) return null;
      Object.assign(inventory, patch);
      return inventory;
    },
    async claimDamageReport(id, patch) {
      const report = reports.find((entry) => entry._id === id && entry.status === 'PendingReview');
      if (!report) return null;
      Object.assign(report, patch);
      return report;
    },
    async updateReport(id, patch) {
      const report = reports.find((entry) => entry._id === id);
      if (!report) return null;
      Object.assign(report, patch);
      return report;
    },
    async createTransaction(data) {
      const duplicate = transactions.find((transaction) => transaction.idempotencyKey === data.idempotencyKey);
      if (duplicate) {
        const error = new Error('duplicate transaction');
        error.code = 11000;
        throw error;
      }
      const transaction = { _id: `txn-${transactions.length + 1}`, ...data };
      transactions.push(transaction);
      return transaction;
    },
    async enqueuePostCommitWork(data) {
      const existing = outbox.find((item) => item.identityKey === data.identityKey);
      if (existing) return existing;
      const item = { _id: `outbox-${outbox.length + 1}`, ...data };
      outbox.push(item);
      return item;
    },
  };
}

function createService(repository, events = [], overrides = {}) {
  return createDamageReportService({
    repository,
    transactionManager: overrides.transactionManager || {
      async withTransaction(work) {
        const snapshot = repository.snapshot();
        try {
          return await work({ id: 'damage-session' });
        } catch (error) {
          repository.restore(snapshot);
          throw error;
        }
      },
    },
    auditLogger: overrides.auditLogger || { async log() {} },
    eventPublisher: overrides.eventPublisher || {
      async publishDomainEvent(event) {
        events.push(event);
      },
    },
    lowStockLifecycle: { async evaluate() {} },
    assignmentCoordinator: { async coordinate() {} },
  });
}

describe('damage report hardening', () => {
  it('rejects current write commands that omit evidence or idempotency', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await assert.rejects(
      () => service.createStaffReport('staff-1', {
        inventoryId: 'inv-1',
        quantity: 2,
        reason: 'Cracked',
        idempotencyKey: 'damage-1',
      }),
      /Damage evidence is required/,
    );
    await assert.rejects(
      () => service.createStaffReport('staff-1', {
        inventoryId: 'inv-1',
        quantity: 2,
        reason: 'Cracked',
        evidence: [{ file: 'damage.jpg' }],
      }),
      /Damage report idempotencyKey is required/,
    );

    assert.equal(repository.reports.length, 0);
    assert.equal(repository.inventory.sellableQuantity, 10);
    assert.equal(repository.transactions.length, 0);
  });

  it('uses the resolved Inventory id for a Product-based damage command', async () => {
    const repository = createRepository();
    const service = createService(repository);

    const report = await service.createStaffReport('staff-1', {
      productId: 'product-1',
      quantity: 2,
      reason: 'Cracked',
      evidence: [{ file: 'damage.jpg' }],
      idempotencyKey: 'damage-product-1',
    });

    assert.equal(report.inventoryId, 'inv-1');
    assert.equal(repository.inventory.sellableQuantity, 8);
  });

  it('records physical shortage, affected orders, and zero exposed availability', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.createStaffReport('staff-1', {
      inventoryId: 'inv-1',
      quantity: 4,
      reason: 'Physical inspection',
      evidence: [{ file: 'damage.jpg' }],
      idempotencyKey: 'damage-shortage-1',
    });

    assert.equal(repository.inventory.sellableQuantity, 6);
    assert.equal(repository.inventory.reservedQuantity, 8);
    assert.equal(repository.inventory.quarantinedQuantity, 4);
    assert.equal(repository.inventory.inventoryHealth, 'ReconciliationRequired');
    assert.deepEqual(repository.inventory.affectedOrderIds, ['order-1']);
  });

  it('rolls a Staff damage report back when the required audit cannot be persisted', async () => {
    const repository = createRepository();
    const before = repository.snapshot();
    const service = createService(repository, [], {
      auditLogger: {
        async log() {
          throw new Error('damage create audit unavailable');
        },
      },
    });

    await assert.rejects(
      () => service.createStaffReport('staff-1', {
        inventoryId: 'inv-1',
        quantity: 2,
        reason: 'Cracked',
        evidence: [{ file: 'damage.jpg' }],
        idempotencyKey: 'damage-audit-rollback-1',
      }),
      /damage create audit unavailable/,
    );

    assert.deepEqual(repository.snapshot(), before);
  });

  it('rolls a Staff damage report back when the Warehouse notification outbox cannot be persisted', async () => {
    const repository = createRepository();
    const before = repository.snapshot();
    repository.enqueuePostCommitWork = async () => {
      throw new Error('damage outbox unavailable');
    };
    const service = createService(repository);

    await assert.rejects(
      () => service.createStaffReport('staff-1', {
        inventoryId: 'inv-1',
        quantity: 2,
        reason: 'Cracked',
        evidence: [{ file: 'damage.jpg' }],
        idempotencyKey: 'damage-outbox-rollback-1',
      }),
      /damage outbox unavailable/,
    );

    assert.deepEqual(repository.snapshot(), before);
  });

  it('rolls a Staff damage withdrawal back when the required audit cannot be persisted', async () => {
    const repository = createRepository();
    const service = createService(repository);
    const report = await service.createStaffReport('staff-1', {
      inventoryId: 'inv-1',
      quantity: 2,
      reason: 'Cracked',
      evidence: [{ file: 'damage.jpg' }],
      idempotencyKey: 'damage-withdraw-audit-source',
    });
    const before = repository.snapshot();
    const atomicService = createService(repository, [], {
      auditLogger: {
        async log() {
          throw new Error('damage withdrawal audit unavailable');
        },
      },
    });

    await assert.rejects(
      () => atomicService.withdrawStaffReport('staff-1', report.id, {
        reason: 'Báo nhầm sản phẩm',
      }),
      /damage withdrawal audit unavailable/,
    );

    assert.deepEqual(repository.snapshot(), before);
  });

  it('requires an evidence-backed idempotent warehouse decision and replays it once', async () => {
    const repository = createRepository();
    const service = createService(repository);
    const report = await service.createStaffReport('staff-1', {
      inventoryId: 'inv-1',
      quantity: 2,
      reason: 'Cracked',
      evidence: [{ file: 'damage.jpg' }],
      idempotencyKey: 'damage-decision-source',
    });

    await assert.rejects(
      () => service.confirmWarehouseReport('warehouse-1', report.id, {}),
      /confirmedQuantity/,
    );
    await assert.rejects(
      () => service.resolveWarehouseReport('warehouse-1', report.id, {
        confirmedQuantity: 1,
        evidence: [{ file: 'inspection.jpg' }],
        idempotencyKey: 'decision-1',
      }),
      /decision reason/,
    );
    await assert.rejects(
      () => service.resolveWarehouseReport('warehouse-1', report.id, {
        confirmedQuantity: 1,
        decisionReason: 'One confirmed',
        idempotencyKey: 'decision-1',
      }),
      /decision evidence/,
    );
    await assert.rejects(
      () => service.resolveWarehouseReport('warehouse-1', report.id, {
        confirmedQuantity: 1,
        decisionReason: 'One confirmed',
        evidence: [{ file: 'inspection.jpg' }],
      }),
      /decision idempotencyKey/,
    );

    const input = {
      confirmedQuantity: 1,
      decisionReason: 'One confirmed',
      evidence: [{ file: 'inspection.jpg' }],
      idempotencyKey: 'decision-1',
    };
    const decided = await service.resolveWarehouseReport('warehouse-1', report.id, input);
    const replay = await service.resolveWarehouseReport('warehouse-1', report.id, input);

    assert.equal(decided.status, 'PartiallyConfirmed');
    assert.equal(replay.replay, true);
    assert.equal(repository.transactions.filter((entry) => entry.transactionType === 'DAMAGE_CONFIRMED').length, 1);
  });

  it('persists the Warehouse handoff in the canonical outbox rather than notifying Staff inline', async () => {
    const repository = createRepository();
    const events = [];
    const service = createService(repository, events);

    await service.createStaffReport('staff-1', {
      inventoryId: 'inv-1',
      quantity: 1,
      reason: 'Cracked',
      evidence: [{ file: 'damage.jpg' }],
      idempotencyKey: 'damage-event-1',
    });

    assert.equal(events.length, 0);
    assert.equal(repository.outbox.length, 1);
    assert.equal(repository.outbox[0].eventType, 'DAMAGE_REPORTED');
    assert.equal(repository.outbox[0].payload.recipientRole, 'WarehouseManager');
    assert.equal(repository.outbox[0].payload.targetCollection, 'DamageReport');
  });
});
