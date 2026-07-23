const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createReplenishmentService } = require('./replenishment.service');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRepository() {
  const inventory = {
    _id: 'inv-1',
    productId: 'product-1',
    productName: 'Test Product',
    stockQuantity: 10,
    sellableQuantity: 10,
    reservedQuantity: 0,
    inventoryHealth: 'Normal',
  };
  const originalReceipt = {
    _id: 'receipt-1',
    recordType: 'Receipt',
    replenishmentRequestId: 'rep-1',
    productId: 'product-1',
    supplierReference: 'SUP-1',
    deliveryReference: 'DEL-1',
    deliveredQuantity: 5,
    acceptedSellableQuantity: 5,
    rejectedQuantity: 0,
    evidence: [{ file: 'original.jpg' }],
    idempotencyKey: 'receipt-original',
  };
  const requests = [{
    _id: 'rep-1',
    productId: 'product-1',
    inventoryId: 'inv-1',
    requestedBy: 'warehouse-1',
    quantity: 5,
    requestedQuantity: 5,
    approvedQuantity: 5,
    receivedQuantity: 5,
    netAcceptedQuantity: 5,
    status: 'Completed',
    reason: 'Restock',
    evidence: [{ file: 'request.jpg' }],
    idempotencyKey: 'request-existing',
    receipts: [{ ...originalReceipt }],
  }];
  const receiptRecords = [{ ...originalReceipt }];
  const transactions = [];
  const repository = {
    inventory,
    requests,
    receiptRecords,
    transactions,
    async findInventoryById(id) { return String(id) === inventory._id ? inventory : null; },
    async findInventoryByProductId(productId) { return String(productId) === inventory.productId ? inventory : null; },
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
    async findReceiptById(id) { return receiptRecords.find((receipt) => receipt._id === id) || null; },
    async findReceiptByIdempotencyKey(key) {
      return receiptRecords.find((receipt) => receipt.idempotencyKey === key) || null;
    },
    async createReceipt(data) {
      if (receiptRecords.some((receipt) => receipt.idempotencyKey === data.idempotencyKey)) {
        const error = new Error('duplicate receipt');
        error.code = 11000;
        throw error;
      }
      const receipt = { _id: `receipt-${receiptRecords.length + 1}`, ...data };
      receiptRecords.push(receipt);
      return receipt;
    },
    async claimCorrectionProjection(id, expected, patch, receiptSummary) {
      const request = requests.find((entry) => entry._id === id
        && entry.status === expected.status
        && Number(entry.netAcceptedQuantity) === Number(expected.netAcceptedQuantity));
      if (!request) return null;
      Object.assign(request, patch);
      request.receipts.push(receiptSummary);
      return request;
    },
    async claimReceiptProjection(id, expected, patch, receiptSummary) {
      const request = requests.find((entry) => entry._id === id
        && entry.status === expected.status
        && Number(entry.netAcceptedQuantity || 0) === Number(expected.netAcceptedQuantity || 0));
      if (!request) return null;
      Object.assign(request, patch);
      request.receipts.push(receiptSummary);
      return request;
    },
    async updateInventory(id, patch) {
      if (String(id) !== inventory._id) return null;
      Object.assign(inventory, patch);
      return inventory;
    },
    async updateRequest(id, patch) {
      const request = requests.find((entry) => entry._id === id);
      if (!request) return null;
      Object.assign(request, patch);
      return request;
    },
    async createTransaction(data) {
      if (transactions.some((entry) => entry.idempotencyKey === data.idempotencyKey)) {
        const error = new Error('duplicate transaction');
        error.code = 11000;
        throw error;
      }
      const transaction = { _id: `txn-${transactions.length + 1}`, ...data };
      transactions.push(transaction);
      return transaction;
    },
    async claimWithdrawal(id, requestedBy, patch) {
      const request = requests.find((entry) => entry._id === id
        && entry.status === 'PendingApproval'
        && entry.requestedBy === requestedBy);
      if (!request) return null;
      Object.assign(request, patch);
      return request;
    },
    async claimShortClosureRequest(id, patch) {
      const request = requests.find((entry) => entry._id === id
        && ['Approved', 'PartiallyReceived'].includes(entry.status));
      if (!request) return null;
      Object.assign(request, patch);
      return request;
    },
    async claimShortClosureDecision(id, patch) {
      const request = requests.find((entry) => entry._id === id && entry.status === 'ShortClosurePending');
      if (!request) return null;
      Object.assign(request, patch);
      return request;
    },
  };
  return repository;
}

function createRollbackManager(repository, calls) {
  let tail = Promise.resolve();
  return {
    async withTransaction(work) {
      const run = tail.then(async () => {
        calls.push('transaction');
        const snapshot = clone({
          inventory: repository.inventory,
          requests: repository.requests,
          receiptRecords: repository.receiptRecords,
          transactions: repository.transactions,
        });
        try {
          return await work(null);
        } catch (error) {
          for (const key of Object.keys(repository.inventory)) delete repository.inventory[key];
          Object.assign(repository.inventory, snapshot.inventory);
          repository.requests.splice(0, repository.requests.length, ...snapshot.requests);
          repository.receiptRecords.splice(0, repository.receiptRecords.length, ...snapshot.receiptRecords);
          repository.transactions.splice(0, repository.transactions.length, ...snapshot.transactions);
          throw error;
        }
      });
      tail = run.catch(() => {});
      return run;
    },
  };
}

function createService(repository, calls = [], events = []) {
  return createReplenishmentService({
    repository,
    transactionManager: createRollbackManager(repository, calls),
    auditLogger: { async log() {} },
    eventPublisher: { async publishDomainEvent(event) { events.push(event); } },
    lowStockLifecycle: { async evaluate() {} },
    assignmentCoordinator: { async coordinate() {} },
  });
}

describe('replenishment hardening', () => {
  it('rejects legacy request and one-shot receipt payloads', async () => {
    const repository = createRepository();
    repository.requests.length = 0;
    const service = createService(repository);

    await assert.rejects(
      () => service.createRequest('warehouse-1', {
        inventoryId: 'inv-1',
        quantity: 5,
        reason: 'Restock',
        idempotencyKey: 'request-1',
      }),
      /Replenishment evidence is required/,
    );
    await assert.rejects(
      () => service.createRequest('warehouse-1', {
        inventoryId: 'inv-1',
        quantity: 5,
        reason: 'Restock',
        evidence: [{ file: 'request.jpg' }],
      }),
      /Replenishment request idempotencyKey is required/,
    );

    repository.requests.push({
      _id: 'rep-legacy',
      productId: 'product-1',
      inventoryId: 'inv-1',
      requestedBy: 'warehouse-1',
      quantity: 5,
      requestedQuantity: 5,
      approvedQuantity: 5,
      netAcceptedQuantity: 0,
      status: 'Approved',
    });
    await assert.rejects(
      () => service.receiveRequest('warehouse-1', 'rep-legacy', { receivedQuantity: 5 }),
      /delivery receipt contract/i,
    );
  });

  it('rolls back correction evidence, inventory, request projection, and ledger together', async () => {
    const repository = createRepository();
    const calls = [];
    const service = createService(repository, calls);
    const before = clone({
      inventory: repository.inventory,
      request: repository.requests[0],
      receiptRecords: repository.receiptRecords,
    });
    repository.createTransaction = async () => {
      throw new Error('ledger unavailable');
    };

    await assert.rejects(
      () => service.correctReceipt('warehouse-1', 'rep-1', {
        originalReceiptId: 'receipt-1',
        acceptedQuantityCorrection: -2,
        reason: 'Two accepted units were counted in error',
        evidence: [{ file: 'correction.jpg' }],
        idempotencyKey: 'correction-rollback',
      }),
      /ledger unavailable/,
    );

    assert.deepEqual(repository.inventory, before.inventory);
    assert.deepEqual(repository.requests[0], before.request);
    assert.deepEqual(repository.receiptRecords, before.receiptRecords);
    assert.deepEqual(repository.transactions, []);
    assert.deepEqual(calls, ['transaction']);
  });

  it('links an immutable correction, changes stock once, and replays the same key', async () => {
    const repository = createRepository();
    const originalEvidence = clone(repository.receiptRecords[0].evidence);
    const service = createService(repository);
    const input = {
      originalReceiptId: 'receipt-1',
      acceptedQuantityCorrection: -2,
      reason: 'Two accepted units were counted in error',
      evidence: [{ file: 'correction.jpg' }],
      idempotencyKey: 'correction-once',
    };

    const corrected = await service.correctReceipt('warehouse-1', 'rep-1', input);
    const replay = await service.correctReceipt('warehouse-1', 'rep-1', input);

    assert.equal(corrected.status, 'PartiallyReceived');
    assert.equal(corrected.netAcceptedQuantity, 3);
    assert.equal(repository.inventory.sellableQuantity, 8);
    assert.equal(replay.replay, true);
    assert.equal(repository.receiptRecords.length, 2);
    assert.equal(repository.receiptRecords[1].recordType, 'Correction');
    assert.equal(repository.receiptRecords[1].correctionOf, 'receipt-1');
    assert.deepEqual(repository.receiptRecords[0].evidence, originalEvidence);
    assert.equal(repository.transactions.length, 1);
  });

  it('allows at most one stale concurrent correction calculation to commit', async () => {
    const repository = createRepository();
    const originalFindRequest = repository.findRequestById.bind(repository);
    let raceReads = 0;
    let releaseReaders;
    const readersReady = new Promise((resolve) => { releaseReaders = resolve; });
    repository.findRequestById = async (id, session) => {
      if (!session?.race) return originalFindRequest(id);
      const snapshot = clone(await originalFindRequest(id));
      raceReads += 1;
      if (raceReads === 2) releaseReaders();
      else await readersReady;
      return snapshot;
    };
    const service = createReplenishmentService({
      repository,
      transactionManager: { withTransaction: async (work) => work({ race: true }) },
      auditLogger: { async log() {} },
      eventPublisher: null,
      lowStockLifecycle: { async evaluate() {} },
    });
    const results = await Promise.allSettled([
      service.correctReceipt('warehouse-1', 'rep-1', {
        originalReceiptId: 'receipt-1',
        acceptedQuantityCorrection: -1,
        reason: 'First correction',
        evidence: [{ file: 'one.jpg' }],
        idempotencyKey: 'correction-race-1',
      }),
      service.correctReceipt('warehouse-2', 'rep-1', {
        originalReceiptId: 'receipt-1',
        acceptedQuantityCorrection: -1,
        reason: 'Second correction',
        evidence: [{ file: 'two.jpg' }],
        idempotencyKey: 'correction-race-2',
      }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(repository.inventory.sellableQuantity, 9);
    assert.equal(repository.requests[0].netAcceptedQuantity, 4);
    assert.equal(repository.transactions.length, 1);
  });

  it('records rejected-only delivery evidence without changing stock or leaving Approved', async () => {
    const repository = createRepository();
    repository.requests[0].status = 'Approved';
    repository.requests[0].netAcceptedQuantity = 0;
    repository.requests[0].receivedQuantity = 0;
    repository.requests[0].receipts = [];
    repository.receiptRecords.length = 0;
    const service = createService(repository);

    const result = await service.receiveRequest('warehouse-1', 'rep-1', {
      supplierReference: 'SUP-1',
      deliveryReference: 'DEL-REJECTED',
      deliveredQuantity: 3,
      acceptedSellableQuantity: 0,
      rejectedQuantity: 3,
      rejectedReason: 'All units damaged',
      evidence: [{ file: 'rejected.jpg' }],
      idempotencyKey: 'receipt-rejected-only',
    });

    assert.equal(result.status, 'Approved');
    assert.equal(repository.inventory.sellableQuantity, 10);
    assert.equal(repository.receiptRecords.length, 1);
    assert.equal(repository.transactions.length, 0);
  });

  it('uses conditional claims for withdrawal and short-closure transitions', async () => {
    const repository = createRepository();
    repository.updateRequest = async () => {
      throw new Error('unsafe unrestricted transition');
    };
    repository.requests[0].status = 'PendingApproval';
    repository.requests[0].netAcceptedQuantity = 0;
    repository.requests[0].receivedQuantity = 0;
    const service = createService(repository);

    const withdrawn = await service.withdrawRequest('warehouse-1', 'rep-1', { reason: 'Submitted in error' });
    assert.equal(withdrawn.status, 'Withdrawn');

    repository.requests[0].status = 'Approved';
    const pending = await service.requestShortClosure('warehouse-1', 'rep-1', {
      reason: 'Supplier cannot fulfill',
      evidence: [{ file: 'short.jpg' }],
    });
    assert.equal(pending.status, 'ShortClosurePending');

    const decided = await service.decideShortClosure('admin-1', 'rep-1', {
      status: 'Approved',
      reason: 'Close remaining balance',
    });
    assert.equal(decided.status, 'ClosedShort');
  });

  it('emits the request handoff to Admin after commit', async () => {
    const repository = createRepository();
    repository.requests.length = 0;
    const events = [];
    const service = createService(repository, [], events);

    await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1',
      quantity: 5,
      reason: 'Restock',
      evidence: [{ file: 'request.jpg' }],
      idempotencyKey: 'request-event-1',
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].recipientRole, 'Admin');
    assert.equal(events[0].targetCollection, 'ReplenishmentRequest');
  });
});
