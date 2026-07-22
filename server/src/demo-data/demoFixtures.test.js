const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const EXPECTED_COUNTS = {
  roles: 4,
  users: 13,
  addresses: 20,
  categories: 5,
  products: 15,
  inventories: 15,
  carts: 12,
  cartItems: 20,
  orders: 22,
  orderDetails: 44,
  payments: 22,
  paymentAttempts: 22,
  paymentCallbacks: 10,
  invoices: 10,
  stockExports: 15,
  inventoryTransactions: 37,
  replenishments: 6,
  damageReports: 3,
  returnRequests: 5,
  returnItems: 4,
  refundPendings: 3,
  supportRequests: 10,
  reviews: 16,
  notifications: 40,
  systemSettings: 3,
  auditLogs: 60,
};

describe('deterministic demo fixture graph', () => {
  it('loads the offline graph without accessing MongoDB', () => {
    assert.doesNotThrow(() => require('./demoFixtures'));
  });

  it('contains the exact stable collection counts', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    const counts = Object.fromEntries(Object.keys(EXPECTED_COUNTS).map((key) => [key, DEMO_GRAPH[key].length]));
    assert.deepEqual(counts, EXPECTED_COUNTS);
  });

  it('provides every role plus ten Vietnamese customer accounts', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    assert.deepEqual(DEMO_GRAPH.roles.map((role) => role.roleName).sort(), ['Admin', 'Customer', 'Staff', 'WarehouseManager']);
    const customers = DEMO_GRAPH.users.filter((user) => user.roleName === 'Customer');
    assert.equal(customers.length, 10);
    assert.ok(customers.every((user) => user.fullName.normalize('NFC') === user.fullName));
    assert.ok(customers.every((user) => /^customer\d{2}@greenhome\.test$/.test(user.email)));
    assert.equal(new Set(customers.map((user) => user.phone)).size, 10);
  });

  it('contains three complete Vietnamese products per category', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    for (const category of DEMO_GRAPH.categories) {
      assert.equal(DEMO_GRAPH.products.filter((product) => product.categoryKey === category.key).length, 3);
    }
    assert.equal(new Set(DEMO_GRAPH.products.map((product) => product.sku)).size, 15);
    assert.ok(DEMO_GRAPH.products.every((product) => product.currency === 'VND'));
    assert.ok(DEMO_GRAPH.products.every((product) => product.price >= 79000 && Number.isInteger(product.price)));
    assert.ok(DEMO_GRAPH.products.every((product) => product.name.length >= 12));
    assert.ok(DEMO_GRAPH.products.every((product) => product.shortDescription.length >= 45));
    assert.ok(DEMO_GRAPH.products.every((product) => product.description.length >= 120));
    assert.ok(DEMO_GRAPH.products.every((product) => /^\/uploads\/products\/[0-9a-f-]{36}\.webp$/.test(product.imageUrl)));
  });

  it('uses the three canonical settings and meaningful report timestamps', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    assert.deepEqual(DEMO_GRAPH.systemSettings.map((setting) => setting.key).sort(), [
      'LOW_STOCK_DEFAULT_THRESHOLD',
      'PAYMENT_TIMEOUT_MINUTES',
      'RETURN_WINDOW_DAYS',
    ]);
    const timestamps = DEMO_GRAPH.orders.map((order) => Date.parse(order.createdAt));
    assert.ok(timestamps.every(Number.isFinite));
    assert.ok(Math.max(...timestamps) - Math.min(...timestamps) >= 21 * 24 * 60 * 60 * 1000);
    assert.ok(DEMO_GRAPH.orders.some((order) => order.orderStatus === 'Expired' && order.paymentStatus === 'Failed'));
  });

  it('makes all ten customers participate in orders, support or reviews', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    const participating = new Set([
      ...DEMO_GRAPH.orders.map((item) => item.customerKey),
      ...DEMO_GRAPH.supportRequests.map((item) => item.customerKey),
      ...DEMO_GRAPH.reviews.map((item) => item.customerKey),
    ]);
    const customerKeys = DEMO_GRAPH.users.filter((user) => user.roleName === 'Customer').map((user) => user.key);
    assert.ok(customerKeys.every((key) => participating.has(key)));
  });

  it('mirrors the warehouse ledger and derives product inventory quantities', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    const byType = Object.fromEntries(['STOCK_EXPORT', 'REPLENISHMENT_RECEIVE', 'DAMAGE_CONFIRMED', 'ADJUSTMENT']
      .map((type) => [type, DEMO_GRAPH.inventoryTransactions.filter((item) => item.transactionType === type).length]));
    assert.deepEqual(byType, { STOCK_EXPORT: 22, REPLENISHMENT_RECEIVE: 2, DAMAGE_CONFIRMED: 1, ADJUSTMENT: 12 });
    for (const inventory of DEMO_GRAPH.inventories) {
      const product = DEMO_GRAPH.products.find((item) => item.key === inventory.productKey);
      assert.equal(product.stockQuantity, inventory.stockQuantity);
      const held = DEMO_GRAPH.orders
        .filter((order) => ['Pending', 'WaitingForPayment', 'Confirmed', 'StockExportRequested'].includes(order.orderStatus))
        .flatMap((order) => DEMO_GRAPH.orderDetails.filter((detail) => detail.orderKey === order.key && detail.productKey === product.key))
        .reduce((sum, detail) => sum + detail.quantity, 0);
      assert.equal(inventory.reservedQuantity, held);
    }
  });

  it('uses only durable service states and coherent linked workflows', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    assert.ok(!DEMO_GRAPH.replenishments.some((item) => item.status === 'Receiving'));
    for (const callback of DEMO_GRAPH.paymentCallbacks) {
      assert.equal(DEMO_GRAPH.orders.find((order) => order.key === callback.orderKey).paymentMethod, 'ONLINE');
    }
    const receivedCallback = DEMO_GRAPH.paymentCallbacks.find((callback) => callback.eventStatus === 'Received');
    assert.ok(receivedCallback && receivedCallback.processingStartedAt === null && receivedCallback.processingResult === null);
    for (const callback of DEMO_GRAPH.paymentCallbacks.filter((item) => item.eventStatus === 'Processed')) {
      const order = DEMO_GRAPH.orders.find((item) => item.key === callback.orderKey);
      const expectedGatewayStatus = order.paymentStatus === 'Failed' ? 'Failed' : 'Paid';
      assert.equal(callback.rawPayload.paymentStatus, expectedGatewayStatus);
      assert.equal(callback.processingResult.accepted, expectedGatewayStatus === 'Paid');
    }
    for (const review of DEMO_GRAPH.reviews) {
      assert.equal(DEMO_GRAPH.orders.find((order) => order.key === review.orderKey).orderStatus, 'Delivered');
    }
    const completed = DEMO_GRAPH.returnRequests.find((request) => request.status === 'Completed');
    const completedOrder = DEMO_GRAPH.orders.find((order) => order.key === completed.orderKey);
    assert.deepEqual([completedOrder.orderStatus, completedOrder.paymentStatus], ['Returned', 'Refunded']);
    assert.ok(DEMO_GRAPH.returnItems.some((item) => item.returnRequestKey === completed.key));
    assert.ok(completed.completedByKey === 'user-staff' && completed.completedAt && completed.inspectionNote);
    assert.ok(Date.parse(completed.requestedAt) <= Date.parse(completed.completedAt));
    assert.ok(DEMO_GRAPH.orders.filter((order) => order.orderStatus === 'Cancelled').every((order) => order.cancelReason));
    assert.ok(DEMO_GRAPH.orders.filter((order) => order.paymentMethod === 'COD' && order.orderStatus !== 'Delivered').every((order) => order.paymentStatus === 'Unpaid'));
    assert.ok(DEMO_GRAPH.damageReports.every((report) => report.status !== 'Rejected'));
    const awaiting = DEMO_GRAPH.returnRequests.find((request) => request.status === 'AwaitingInspection');
    const awaitingOrder = DEMO_GRAPH.orders.find((order) => order.key === awaiting.orderKey);
    assert.ok(awaiting.refundAmount > 0 && awaiting.refundAmount <= awaitingOrder.totalAmount);
  });

  it('contains at least two unreserved low-stock products for the dashboard scenario', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    const lowStock = DEMO_GRAPH.inventories.filter((inventory) => inventory.stockQuantity - inventory.reservedQuantity <= inventory.lowStockThreshold);
    assert.ok(lowStock.length >= 2);
    assert.ok(lowStock.every((inventory) => inventory.reservedQuantity === 0));
  });

  it('keeps invoice lines as a complete snapshot of each order', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    for (const invoice of DEMO_GRAPH.invoices) {
      const details = DEMO_GRAPH.orderDetails.filter((detail) => detail.orderKey === invoice.orderKey);
      assert.deepEqual([...invoice.orderDetailKeys].sort(), details.map((detail) => detail.key).sort());
      assert.equal(invoice.items.length, details.length);
      assert.equal(invoice.items.reduce((sum, item) => sum + item.subtotal, 0), invoice.subtotal);
      for (const detail of details) {
        const snapshot = invoice.items.find((item) => item.orderDetailKey === detail.key);
        assert.equal(snapshot.productNameSnapshot, detail.productNameSnapshot);
        assert.equal(snapshot.priceSnapshot, detail.priceSnapshot);
        assert.equal(snapshot.subtotal, detail.subtotal);
      }
    }
  });

  it('keeps support, stock-export actors and timestamps consistent and not in the future', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    for (const support of DEMO_GRAPH.supportRequests) {
      if (support.status === 'New') assert.deepEqual([support.handledByKey, support.response, support.respondedAt, support.closedAt], [null, '', null, null]);
      if (support.status === 'InProgress') assert.ok(support.handledByKey && support.response && support.respondedAt && !support.closedAt);
      if (support.status === 'Resolved') assert.ok(support.handledByKey && support.response && support.respondedAt && support.closedAt);
    }
    for (const request of DEMO_GRAPH.stockExports) {
      assert.equal(request.requestedByKey, 'user-staff');
      if (request.status === 'Pending') assert.deepEqual([request.processedByKey, request.exportedAt], [null, null]);
      if (request.status === 'Exported') assert.ok(request.processedByKey === 'user-warehouse' && request.exportedAt);
      if (request.exportedAt) assert.ok(Date.parse(request.createdAt) <= Date.parse(request.exportedAt));
    }
    const allDates = JSON.stringify(DEMO_GRAPH).match(/20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ/g) || [];
    assert.ok(allDates.every((value) => Date.parse(value) <= Date.parse('2026-07-22T00:00:00.000Z')));
  });
});
