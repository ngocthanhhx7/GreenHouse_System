const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createReplenishmentService } = require('./replenishment.service');

function createRepository() {
  const inventory = {
    _id: 'inv-1',
    productId: 'product-1',
    productName: 'Eco Dish Soap',
    stockQuantity: 3,
    sellableQuantity: 3,
    reservedQuantity: 0,
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
    async findInventoryByProductId(id) { return id === inventory.productId ? inventory : null; },
    async findRequestById(id) { return requests.find((request) => request._id === id) || null; },
    async findRequestByIdempotencyKey(key) { return requests.find((request) => request.idempotencyKey === key) || null; },
    async findActiveRequestByProductId(productId) {
      return requests.find((request) => request.productId === productId
        && ['PendingApproval', 'Approved', 'PartiallyReceived', 'ShortClosurePending'].includes(request.status)) || null;
    },
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
    async findReceiptByIdempotencyKey(key) { return receipts.find((receipt) => receipt.idempotencyKey === key) || null; },
    async createReceipt(data) {
      const receipt = { _id: `receipt-${receipts.length + 1}`, ...data };
      receipts.push(receipt);
      return receipt;
    },
    async claimReceiptProjection(id, expected, patch, receipt) {
      const request = requests.find((entry) => entry._id === id
        && entry.status === expected.status
        && Number(entry.netAcceptedQuantity || 0) === Number(expected.netAcceptedQuantity || 0));
      if (!request) return null;
      Object.assign(request, patch);
      request.receipts = [...(request.receipts || []), receipt];
      return request;
    },
    async updateInventory(id, patch) {
      if (id !== inventory._id) return null;
      Object.assign(inventory, patch);
      return inventory;
    },
    async createTransaction(data) {
      const transaction = { _id: `txn-${transactions.length + 1}`, ...data };
      transactions.push(transaction);
      return transaction;
    },
  };
}

function createService(repository, assignmentCoordinator = { async coordinate() {} }) {
  return createReplenishmentService({
    repository,
    transactionManager: { withTransaction: async (work) => work({ id: 'replenishment-tx' }) },
    auditLogger: { async log() {} },
    eventPublisher: null,
    lowStockLifecycle: { async evaluate() {} },
    assignmentCoordinator,
  });
}

describe('replenishment service', () => {
  it('creates an evidence-backed warehouse request and lets Admin approve it', async () => {
    const repository = createRepository();
    const service = createService(repository);
    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1',
      quantity: 20,
      reason: 'Low stock restock',
      evidence: [{ file: 'count-sheet.jpg' }],
      idempotencyKey: 'request-1',
    });
    assert.equal(request.status, 'PendingApproval');
    const approved = await service.updateRequestStatus('admin-1', request.id, {
      status: 'Approved',
      note: 'Approved against the count sheet',
    });
    assert.equal(approved.status, 'Approved');
  });

  it('rejects one-shot legacy receipts and records an accepted delivery atomically', async () => {
    const repository = createRepository();
    const service = createService(repository);
    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1',
      quantity: 5,
      reason: 'Low stock restock',
      evidence: [{ file: 'count-sheet.jpg' }],
      idempotencyKey: 'request-2',
    });
    await service.updateRequestStatus('admin-1', request.id, {
      status: 'Approved',
      note: 'Approved against the count sheet',
    });
    await assert.rejects(
      () => service.receiveRequest('warehouse-1', request.id, { receivedQuantity: 5 }),
      /delivery receipt contract/i,
    );
    const result = await service.receiveRequest('warehouse-1', request.id, {
      deliveredQuantity: 5,
      acceptedSellableQuantity: 5,
      rejectedQuantity: 0,
      supplierReference: 'SUP-1',
      deliveryReference: 'DEL-1',
      evidence: [{ file: 'delivery.jpg' }],
      idempotencyKey: 'receipt-2',
    });
    assert.equal(result.status, 'Completed');
    assert.equal(repository.inventory.sellableQuantity, 8);
    assert.equal(repository.transactions.length, 1);
  });

  it('does not assign Replenishment after a passed Warehouse request loses its role', async () => {
    const repository = createRepository();
    const service = createService(repository, {
      async coordinate({ userId, expectedRole, session }) {
        assert.deepEqual(
          { userId, expectedRole, session },
          {
            userId: 'warehouse-1',
            expectedRole: 'WarehouseManager',
            session: { id: 'replenishment-tx' },
          },
        );
        const error = new Error('role changed after middleware');
        error.errorCode = 'ASSIGNMENT_ACTOR_STALE';
        throw error;
      },
    });

    await assert.rejects(
      () => service.createRequest('warehouse-1', {
        inventoryId: 'inv-1',
        quantity: 20,
        reason: 'Low stock restock',
        evidence: [{ file: 'count-sheet.jpg' }],
        idempotencyKey: 'request-race-1',
      }),
      (error) => error.errorCode === 'ASSIGNMENT_ACTOR_STALE',
    );
    assert.equal(repository.requests.length, 0);
  });
});
