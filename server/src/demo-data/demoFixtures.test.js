const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const EXPECTED_COUNTS = {
  roles: 4,
  users: 13,
  addresses: 20,
  categories: 5,
  products: 20,
  inventories: 20,
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

  it('contains four complete Vietnamese products per category', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    for (const category of DEMO_GRAPH.categories) {
      assert.equal(DEMO_GRAPH.products.filter((product) => product.categoryKey === category.key).length, 4);
    }
    assert.equal(new Set(DEMO_GRAPH.products.map((product) => product.sku)).size, 20);
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
});
