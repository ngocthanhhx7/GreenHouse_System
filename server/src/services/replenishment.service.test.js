const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createReplenishmentService } = require('./replenishment.service');

function createRepository() {
  const inventories = [
    {
      _id: 'inv-1',
      productId: 'product-1',
      productName: 'Eco Dish Soap',
      stockQuantity: 3,
      lowStockThreshold: 6,
      lastUpdatedBy: 'warehouse-1',
    },
  ];
  const requests = [];
  const transactions = [];
  const productStocks = new Map(inventories.map((item) => [item.productId, item.stockQuantity]));

  return {
    inventories,
    requests,
    transactions,
    productStocks,
    async findInventoryById(id) {
      return inventories.find((item) => item._id === id) || null;
    },
    async findInventoryByProductId(productId) {
      return inventories.find((item) => item.productId === productId) || null;
    },
    async updateInventory(id, data) {
      const inventory = inventories.find((item) => item._id === id);
      Object.assign(inventory, data);
      return inventory;
    },
    async updateProductStock(productId, stockQuantity) {
      productStocks.set(String(productId), stockQuantity);
    },
    async createRequest(data) {
      const request = { _id: `rep-${requests.length + 1}`, status: 'Pending', ...data };
      requests.push(request);
      return request;
    },
    async listRequests(query = {}) {
      return requests.filter((request) => {
        if (!query.status) return true;
        if (query.status === 'PendingApproval') return ['Pending', 'PendingApproval'].includes(request.status);
        return request.status === query.status;
      });
    },
    async findRequestById(id) {
      return requests.find((item) => item._id === id) || null;
    },
    async updateRequest(id, data) {
      const request = requests.find((item) => item._id === id);
      Object.assign(request, data);
      return request;
    },
    async claimDecision(id, status, adminId, note) {
      const request = requests.find((item) => item._id === id && ['Pending', 'PendingApproval'].includes(item.status));
      if (!request) return null;
      Object.assign(request, { status, approvedBy: adminId, adminNote: note });
      return request;
    },
    async claimReceipt(id, receivedQuantity, userId) {
      const request = requests.find((item) => item._id === id && item.status === 'Approved' && item.quantity === receivedQuantity && Number(item.receivedQuantity || 0) === 0);
      if (!request) return null;
      Object.assign(request, { status: 'Receiving', receivedQuantity, receivedBy: userId });
      return request;
    },
    async completeReceipt(id) {
      const request = requests.find((item) => item._id === id && item.status === 'Receiving');
      if (!request) return null;
      Object.assign(request, { status: 'Received', receivedAt: new Date() });
      return request;
    },
    async addReceivedStock(id, quantity, userId) {
      const inventory = inventories.find((item) => item._id === id);
      if (!inventory) return null;
      inventory.stockQuantity += quantity;
      inventory.lastUpdatedBy = userId;
      return inventory;
    },
    async createTransaction(data) {
      const transaction = { _id: `txn-${transactions.length + 1}`, ...data };
      transactions.push(transaction);
      return transaction;
    },
  };
}

function createAuditLogger() {
  return {
    entries: [],
    async log(entry) {
      this.entries.push(entry);
    },
  };
}

describe('replenishment service', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = createRepository();
    service = createReplenishmentService({
      repository,
      auditLogger: createAuditLogger(),
      transactionManager: { withTransaction: async (work) => work(null) },
      eventPublisher: null,
    });
  });

  it('creates a warehouse replenishment request for a positive quantity', async () => {
    const result = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1',
      quantity: 20,
      reason: 'Low stock demo restock',
    });

    assert.equal(result.status, 'PendingApproval');
    assert.equal(result.quantity, 20);
    assert.equal(repository.requests.length, 1);
  });

  it('rejects invalid replenishment quantity', async () => {
    await assert.rejects(
      () => service.createRequest('warehouse-1', { inventoryId: 'inv-1', quantity: 0, reason: 'Bad' }),
      /positive integer/
    );
  });

  it('lets admin approve a pending request', async () => {
    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1',
      quantity: 20,
      reason: 'Low stock demo restock',
    });

    const result = await service.updateRequestStatus('admin-1', request.id, { status: 'Approved', note: 'Approved' });

    assert.equal(result.status, 'Approved');
    assert.equal(result.approvedBy, 'admin-1');
  });

  it('receives the exact approved replenishment once and creates an inventory transaction', async () => {
    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1',
      quantity: 20,
      reason: 'Low stock demo restock',
    });
    await service.updateRequestStatus('admin-1', request.id, { status: 'Approved' });

    const result = await service.receiveRequest('warehouse-1', request.id, { receivedQuantity: 20 });

    assert.equal(result.status, 'Received');
    assert.equal(repository.inventories[0].stockQuantity, 23);
    assert.equal(repository.productStocks.get('product-1'), 23);
    assert.equal(repository.transactions[0].transactionType, 'REPLENISHMENT_RECEIVE');
  });

  it('keeps legacy Pending requests actionable as PendingApproval', async () => {
    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1', quantity: 20, reason: 'Legacy request',
    });
    repository.requests[0].status = 'Pending';

    const listed = await service.listAdminRequests({ status: 'PendingApproval' });
    const approved = await service.updateRequestStatus('admin-1', request.id, { status: 'Approved' });

    assert.equal(listed.items[0].status, 'PendingApproval');
    assert.equal(approved.status, 'Approved');
  });

  it('rejects a partial receipt', async () => {
    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1', quantity: 20, reason: 'Low stock demo restock',
    });
    await service.updateRequestStatus('admin-1', request.id, { status: 'Approved' });

    await assert.rejects(
      () => service.receiveRequest('warehouse-1', request.id, { receivedQuantity: 15 }),
      /must exactly match/
    );
  });

  it('rejects receiving more than the approved request quantity', async () => {
    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1',
      quantity: 20,
      reason: 'Low stock demo restock',
    });
    await service.updateRequestStatus('admin-1', request.id, { status: 'Approved' });

    await assert.rejects(
      () => service.receiveRequest('warehouse-1', request.id, { receivedQuantity: 21 }),
      /must exactly match/
    );
  });

  it('rejects receiving a request before admin approval', async () => {
    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1',
      quantity: 20,
      reason: 'Low stock demo restock',
    });

    await assert.rejects(
      () => service.receiveRequest('warehouse-1', request.id, { receivedQuantity: 10 }),
      /Only Approved replenishment requests can be received/
    );
  });

  it('allows only one concurrent receipt and never increments inventory twice', async () => {
    const request = await service.createRequest('warehouse-1', {
      inventoryId: 'inv-1', quantity: 20, reason: 'Low stock demo restock',
    });
    await service.updateRequestStatus('admin-1', request.id, { status: 'Approved' });

    const results = await Promise.allSettled([
      service.receiveRequest('warehouse-1', request.id, { receivedQuantity: 20 }),
      service.receiveRequest('warehouse-2', request.id, { receivedQuantity: 20 }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(repository.inventories[0].stockQuantity, 23);
    assert.equal(repository.transactions.length, 1);
    await assert.rejects(
      () => service.receiveRequest('warehouse-1', request.id, { receivedQuantity: 20 }),
      /Only Approved replenishment requests can be received/,
    );
  });
});
