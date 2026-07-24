const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createInventoryService } = require('./inventory.service');

function createRepository() {
  const inventories = [
    {
      _id: 'inv-1',
      productId: 'product-1',
      productName: 'Green Ceramic Frying Pan',
      stockQuantity: 10,
      sellableQuantity: 10,
      reservedQuantity: 2,
      damagedQuantity: 0,
      lowStockThreshold: 5,
      lastUpdatedBy: 'warehouse-1',
    },
    {
      _id: 'inv-2',
      productId: 'product-2',
      productName: 'Eco Dish Soap',
      stockQuantity: 3,
      sellableQuantity: 3,
      reservedQuantity: 0,
      damagedQuantity: 0,
      lowStockThreshold: 6,
      lastUpdatedBy: 'warehouse-1',
    },
  ];
  const transactions = [];
  const productStocks = new Map(inventories.map((item) => [item.productId, item.stockQuantity]));
  const stockExports = [
    {
      _id: 'export-1',
      orderId: 'order-1',
      requestedBy: 'staff-1',
      status: 'Pending',
      note: 'Prepare shipment',
      createdAt: new Date('2026-07-01T01:00:00Z'),
    },
  ];
  const orders = [
    {
      _id: 'order-1',
      orderCode: 'GH-DEMO-1003',
      orderStatus: 'StockExportRequested',
      paymentStatus: 'Paid',
      customerId: 'customer-1',
      shippingAddress: '12 Nguyen Trai',
      totalAmount: 50,
    },
  ];
  const orderDetails = [
    {
      _id: 'detail-1',
      orderId: 'order-1',
      productId: 'product-1',
      productNameSnapshot: 'Green Ceramic Frying Pan',
      priceSnapshot: 25,
      quantity: 2,
      subtotal: 50,
    },
  ];

  return {
    inventories,
    transactions,
    stockExports,
    orders,
    productStocks,
    async listProducts() {
      return inventories.map((item) => ({
        _id: item.productId,
        name: item.productName,
        stockQuantity: item.stockQuantity,
        status: 'Active',
      }));
    },
    async listInventories() {
      return inventories;
    },
    async findInventoryById(id) {
      return inventories.find((item) => item._id === id) || null;
    },
    async findInventoryByProductId(productId) {
      return inventories.find((item) => item.productId === productId) || null;
    },
    async updateInventory(id, data) {
      const inventory = inventories.find((item) => item._id === id);
      if (!inventory) return null;
      Object.assign(inventory, data);
      return inventory;
    },
    async updateProductStock(productId, stockQuantity) {
      productStocks.set(String(productId), stockQuantity);
    },
    async createTransaction(data) {
      const transaction = { _id: `txn-${transactions.length + 1}`, createdAt: new Date(), ...data };
      transactions.push(transaction);
      return transaction;
    },
    async listTransactions() {
      return transactions;
    },
    async listStockExports() {
      return stockExports;
    },
    async findStockExportById(id) {
      return stockExports.find((item) => item._id === id) || null;
    },
    async updateStockExport(id, data) {
      const exportRequest = stockExports.find((item) => item._id === id);
      if (!exportRequest) return null;
      Object.assign(exportRequest, data);
      return exportRequest;
    },
    async claimExport(id, userId, note) {
      const exportRequest = stockExports.find((item) => item._id === id && item.status === 'Approved');
      if (!exportRequest) return null;
      Object.assign(exportRequest, { status: 'Processing', processedBy: userId, note });
      return exportRequest;
    },
    async claimExportDecision(id, status, userId, note) {
      const exportRequest = stockExports.find((item) => item._id === id && item.status === 'Pending');
      if (!exportRequest) return null;
      Object.assign(exportRequest, { status, processedBy: userId, note });
      return exportRequest;
    },
    async completeExport(id) {
      const exportRequest = stockExports.find((item) => item._id === id && item.status === 'Processing');
      if (!exportRequest) return null;
      Object.assign(exportRequest, { status: 'Exported', exportedAt: new Date() });
      return exportRequest;
    },
    async findOrderById(id) {
      return orders.find((item) => item._id === id) || null;
    },
    async updateOrder(id, data) {
      const order = orders.find((item) => item._id === id);
      if (!order) return null;
      Object.assign(order, data);
      return order;
    },
    async markOrderPacked(id) {
      const order = orders.find((item) => item._id === id && item.orderStatus === 'StockExportRequested');
      if (!order) return null;
      Object.assign(order, { orderStatus: 'Packed', packedAt: new Date() });
      return order;
    },
    async reopenOrderAfterRejectedExport(id) {
      const order = orders.find((item) => item._id === id && item.orderStatus === 'StockExportRequested');
      if (!order) return null;
      order.orderStatus = 'Confirmed';
      return order;
    },
    async listOrderDetails(orderId) {
      return orderDetails.filter((item) => item.orderId === orderId);
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

describe('inventory service', () => {
  let repository;
  let service;
  let transactionCalls;

  beforeEach(() => {
    repository = createRepository();
    transactionCalls = 0;
    service = createInventoryService({
      repository,
      auditLogger: createAuditLogger(),
      transactionManager: { withTransaction: async (work) => { transactionCalls += 1; return work(null); } },
      eventPublisher: null,
      assignmentCoordinator: { async coordinate() {} },
    });
  });

  it('lists inventory with low-stock flags', async () => {
    const result = await service.listInventory();

    assert.equal(result.items.length, 2);
    assert.equal(result.items[1].isLowStock, true);
  });

  it('adjusts stock and creates an inventory transaction', async () => {
    const result = await service.adjustInventory('warehouse-1', 'inv-1', { delta: -2, reason: 'Damaged item removed' });

    assert.equal(result.inventory.stockQuantity, 8);
    assert.equal(repository.productStocks.get('product-1'), 10);
    assert.equal(repository.transactions.length, 1);
    assert.equal(repository.transactions[0].transactionType, 'ADJUSTMENT');
    assert.equal(repository.transactions[0].relatedCollection, 'Inventory');
    assert.equal(transactionCalls, 1);
  });

  it('rejects adjustments that would make stock negative', async () => {
    await assert.rejects(
      () => service.adjustInventory('warehouse-1', 'inv-1', { delta: -20, reason: 'Bad request' }),
      /Inventory stock cannot be negative/
    );
  });

  it('retires the legacy approval/status mutation in favor of the exact process command', async () => {
    assert.equal(typeof service.processStockExport, 'function');
    await assert.rejects(
      () => service.updateStockExportStatus('warehouse-1', 'export-1', { status: 'Approved' }),
      (error) => error.errorCode === 'STOCK_EXPORT_LEGACY_ACTION_RETIRED',
    );
    assert.equal(repository.stockExports[0].status, 'Pending');
  });
});
