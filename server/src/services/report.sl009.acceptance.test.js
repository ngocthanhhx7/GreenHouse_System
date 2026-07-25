const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createReportService } = require('./report.service');

const NOW = new Date('2026-08-15T03:00:00.000Z');

function repositoryFixture(overrides = {}) {
  const orders = [
    {
      _id: 'order-june-returned', customerId: 'customer-active', paymentMethod: 'COD',
      totalAmount: 1000, codExpectedAmount: 1000, customerCollectedAmount: 1000,
      customerCollectedAt: new Date('2026-06-30T15:00:00.000Z'),
      deliveredAt: new Date('2026-06-30T15:00:00.000Z'),
      completedSaleAt: new Date('2026-06-30T15:00:00.000Z'),
      orderStatus: 'Returned', paymentStatus: 'Cancelled', createdAt: new Date('2026-06-25T00:00:00.000Z'),
      returnedAt: new Date('2026-07-03T00:00:00.000Z'),
    },
    {
      _id: 'order-late-collection', customerId: 'customer-disabled', paymentMethod: 'COD',
      totalAmount: 500, codExpectedAmount: 500, customerCollectedAmount: 500,
      customerCollectedAt: new Date('2026-07-02T02:00:00.000Z'),
      deliveredAt: new Date('2026-06-30T16:00:00.000Z'),
      completedSaleAt: new Date('2026-07-02T02:00:00.000Z'),
      orderStatus: 'Delivered', paymentStatus: 'Paid', createdAt: new Date('2026-06-26T00:00:00.000Z'),
    },
    {
      _id: 'order-online', customerId: 'customer-active', paymentMethod: 'ONLINE', totalAmount: 200,
      deliveredAt: new Date('2026-07-08T04:00:00.000Z'), completedSaleAt: new Date('2026-07-08T04:00:00.000Z'),
      orderStatus: 'Delivered', paymentStatus: 'Paid', createdAt: new Date('2026-07-05T00:00:00.000Z'),
      confirmedAt: new Date('2026-07-06T00:00:00.000Z'), shippedAt: new Date('2026-07-07T00:00:00.000Z'),
    },
    {
      _id: 'order-current-state-only', customerId: 'customer-active', paymentMethod: 'ONLINE', totalAmount: 700,
      deliveredAt: new Date('2026-07-03T00:00:00.000Z'), completedSaleAt: null,
      orderStatus: 'Delivered', paymentStatus: 'Paid', createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-31T00:00:00.000Z'),
    },
    {
      _id: 'order-under-collected', customerId: 'customer-active', paymentMethod: 'COD', totalAmount: 400,
      codExpectedAmount: 500, customerCollectedAmount: 400,
      deliveredAt: new Date('2026-07-03T00:00:00.000Z'), customerCollectedAt: new Date('2026-07-03T00:00:00.000Z'),
      completedSaleAt: new Date('2026-07-03T00:00:00.000Z'), orderStatus: 'Delivered', paymentStatus: 'Paid',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    },
    {
      _id: 'order-pending', customerId: 'customer-disabled', paymentMethod: 'COD', totalAmount: 300,
      orderStatus: 'Pending', paymentStatus: 'Pending', createdAt: new Date('2026-07-10T00:00:00.000Z'),
    },
  ];
  const orderDetails = [
    { orderId: 'order-june-returned', productId: 'product-inactive', productNameSnapshot: 'Old fern', productSkuSnapshot: 'FERN-OLD', quantity: 2, priceSnapshot: 500, subtotal: 1000 },
    { orderId: 'order-late-collection', productId: 'product-active', productNameSnapshot: 'Aloe snapshot', productSkuSnapshot: 'ALOE', quantity: 1, priceSnapshot: 500, subtotal: 500 },
    { orderId: 'order-online', productId: 'product-inactive', productNameSnapshot: 'Old fern', productSkuSnapshot: 'FERN-OLD', quantity: 1, priceSnapshot: 200, subtotal: 200 },
  ];
  const refunds = [
    { _id: 'refund-july', obligationKey: 'return:order-june-returned', amount: 1000, status: 'Refunded', refundedAt: new Date('2026-07-02T05:00:00.000Z') },
    { _id: 'refund-not-final', obligationKey: 'pending', amount: 999, status: 'RefundPending', refundedAt: null },
  ];
  const products = [
    { _id: 'product-active', name: 'Aloe current', sku: 'ALOE', price: 9999, status: 'Active' },
    { _id: 'product-inactive', name: 'Fern renamed', sku: 'FERN-NEW', price: 9999, status: 'Inactive' },
  ];
  const users = [
    { _id: 'customer-active', fullName: 'Customer A', role: 'Customer', status: 'Active', createdAt: new Date('2026-06-01T00:00:00.000Z') },
    { _id: 'customer-disabled', fullName: 'Customer B', role: 'Customer', status: 'Disabled', createdAt: new Date('2026-07-02T00:00:00.000Z') },
    { _id: 'staff-active', fullName: 'Staff A', role: 'Staff', status: 'Active', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    { _id: 'staff-disabled', fullName: 'Staff B', role: 'Staff', status: 'Disabled', createdAt: new Date('2026-01-01T00:00:00.000Z') },
  ];
  const inventory = [
    { _id: 'inventory-1', productId: 'product-active', sellableQuantity: 10, reservedQuantity: 2, quarantinedQuantity: 3, damagedQuantity: 1, lowStockThreshold: 5, lowStockThresholdOverride: null, inventoryHealth: 'Normal', updatedAt: new Date('2026-08-14T00:00:00.000Z') },
    { _id: 'inventory-2', productId: 'product-inactive', sellableQuantity: 4, reservedQuantity: 1, quarantinedQuantity: 0, damagedQuantity: 2, lowStockThreshold: 5, lowStockThresholdOverride: 4, inventoryHealth: 'ReconciliationRequired', updatedAt: new Date('2026-08-14T01:00:00.000Z') },
  ];
  const inventoryTransactions = [
    { productId: 'product-active', transactionType: 'ADJUSTMENT', quantity: 5, createdAt: new Date('2026-07-05T00:00:00.000Z') },
    { productId: 'product-active', transactionType: 'STOCK_EXPORT', quantity: -2, createdAt: new Date('2026-07-06T00:00:00.000Z') },
    { productId: 'product-inactive', transactionType: 'RETURN_IN', quantity: 2, createdAt: new Date('2026-07-07T00:00:00.000Z') },
    { productId: 'product-active', transactionType: 'EXCHANGE_RETURN_IN', quantity: 1, createdAt: new Date('2026-07-08T00:00:00.000Z') },
    { productId: 'product-active', transactionType: 'EXCHANGE_REPLACEMENT_OUT', quantity: -1, createdAt: new Date('2026-07-08T01:00:00.000Z') },
  ];
  const lowStockAlerts = [
    { _id: 'alert-open', status: 'Open', openedAt: new Date('2026-07-01T00:00:00.000Z'), resolvedAt: null },
    { _id: 'alert-resolved', status: 'Resolved', openedAt: new Date('2026-07-02T00:00:00.000Z'), resolvedAt: new Date('2026-07-09T00:00:00.000Z') },
  ];
  const supportRequests = [
    { _id: 'ticket-resolved', assigneeId: 'staff-disabled', status: 'Resolved', createdAt: new Date('2026-07-01T00:00:00.000Z'), resolvedAt: new Date('2026-07-01T04:00:00.000Z') },
    { _id: 'ticket-missing-duration', assigneeId: 'staff-active', status: 'InProgress', createdAt: new Date('2026-07-02T00:00:00.000Z'), resolvedAt: null },
  ];
  const supportMessages = [
    { ticketId: 'ticket-resolved', actorId: 'staff-disabled', actorRole: 'Staff', createdAt: new Date('2026-07-01T01:00:00.000Z') },
    { ticketId: 'ticket-resolved', actorId: 'staff-disabled', actorRole: 'Staff', createdAt: new Date('2026-07-01T02:00:00.000Z') },
  ];
  const auditLogs = [
    { actorId: 'staff-active', actorRole: 'Staff', outcome: 'Success', targetType: 'Order', action: 'ORDER_CONFIRMED', timestamp: new Date('2026-07-06T00:00:00.000Z') },
    { actorId: 'staff-disabled', actorRole: 'Staff', outcome: 'Success', targetType: 'ReturnRefundRequest', action: 'RETURN_APPROVED', timestamp: new Date('2026-07-02T00:00:00.000Z') },
    { actorId: 'staff-active', actorRole: 'Staff', outcome: 'Denied', targetType: 'Order', action: 'ORDER_CANCELLED', timestamp: new Date('2026-07-07T00:00:00.000Z') },
  ];
  const reviews = [];

  const data = {
    orders, orderDetails, refunds, products, users, inventory, inventoryTransactions,
    lowStockAlerts, supportRequests, supportMessages, auditLogs, reviews,
    ...overrides,
  };
  return {
    async listOrders() { return data.orders; },
    async listOrderDetails() { return data.orderDetails; },
    async listRefunds() { return data.refunds; },
    async listProducts() { return data.products; },
    async listUsers() { return data.users; },
    async listInventory() { return data.inventory; },
    async listInventoryTransactions() { return data.inventoryTransactions; },
    async listLowStockAlerts() { return data.lowStockAlerts; },
    async listSupportRequests() { return data.supportRequests; },
    async listSupportMessages() { return data.supportMessages; },
    async listAuditLogs() { return data.auditLogs; },
    async listReviews() { return data.reviews; },
  };
}

function serviceWith(overrides = {}) {
  return createReportService({ repository: repositoryFixture(overrides), clock: () => new Date(NOW) });
}

describe('SL-009 reporting acceptance', () => {
  it('AT-190 defaults to the current Vietnam month and uses exact half-open boundaries', async () => {
    const service = serviceWith({
      orders: [
        { _id: 'before', customerId: 'c1', paymentMethod: 'ONLINE', totalAmount: 1, deliveredAt: new Date('2026-07-31T16:59:59.999Z'), completedSaleAt: new Date('2026-07-31T16:59:59.999Z') },
        { _id: 'start', customerId: 'c1', paymentMethod: 'ONLINE', totalAmount: 2, deliveredAt: new Date('2026-07-31T17:00:00.000Z'), completedSaleAt: new Date('2026-07-31T17:00:00.000Z') },
        { _id: 'end', customerId: 'c1', paymentMethod: 'ONLINE', totalAmount: 4, deliveredAt: new Date('2026-08-31T17:00:00.000Z'), completedSaleAt: new Date('2026-08-31T17:00:00.000Z') },
      ],
      orderDetails: [], refunds: [],
    });

    const currentMonth = await service.getAdminOverview();
    assert.equal(currentMonth.meta.mode, 'currentMonth');
    assert.equal(currentMonth.meta.timezone, 'Asia/Ho_Chi_Minh');
    assert.equal(currentMonth.meta.period.from.toISOString(), '2026-07-31T17:00:00.000Z');
    assert.equal(currentMonth.meta.period.toExclusive.toISOString(), '2026-08-31T17:00:00.000Z');
    assert.equal(currentMonth.meta.generatedAt.toISOString(), NOW.toISOString());
    assert.equal(currentMonth.meta.dataAsOf.toISOString(), NOW.toISOString());
    assert.equal(currentMonth.revenue.grossSales, 2);

    const allTime = await service.getAdminOverview({ mode: 'allTime' });
    assert.equal(allTime.meta.mode, 'allTime');
    assert.equal(allTime.meta.period.from, null);
    assert.equal(allTime.meta.period.toExclusive, null);
    assert.equal(allTime.revenue.grossSales, 7);
  });

  it('AT-190/198 rejects malformed, partial, overlong, and stale-shaped queries', async () => {
    const service = serviceWith();
    await assert.rejects(() => service.getAdminOverview({ from: '2026-07-01' }), /from.*to/i);
    await assert.rejects(() => service.getAdminOverview({ mode: 'period', from: '2026-02-30', to: '2026-03-01' }), /date range/i);
    await assert.rejects(() => service.getAdminOverview({ mode: 'period', from: '2024-01-01', to: '2026-01-02' }), /366/i);
    await assert.rejects(() => service.getAdminOverview({ mode: 'allTime', from: '2026-01-01', to: '2026-01-02' }), /allTime/i);
    await assert.rejects(() => service.getAdminOverview({ mode: 'currentMonth', dataAsOf: 'stale-client-value' }), /unsupported/i);
  });

  it('AT-191..193 retains immutable gross sales, clocks late collection, and allows negative net sales', async () => {
    const service = serviceWith();
    const june = await service.getRevenueReport({ mode: 'period', from: '2026-06-01', to: '2026-06-30' });
    assert.equal(june.revenue.grossSales, 1000);
    assert.equal(june.revenue.refunds, 0);
    assert.equal(june.revenue.netSales, 1000);
    assert.equal(june.revenue.completedSaleCount, 1);

    const july = await service.getRevenueReport({ mode: 'period', from: '2026-07-01', to: '2026-07-31' });
    assert.equal(july.revenue.grossSales, 700);
    assert.equal(july.revenue.refunds, 1000);
    assert.equal(july.revenue.netSales, -300);
    assert.equal(july.revenue.completedSaleCount, 2);
    assert.equal(july.revenue.refundCount, 1);
    assert.equal(july.revenue.reconciliation.invalidCompletedSaleFacts, 1);
    assert.equal(july.revenue.reconciliation.currentStateWithoutCompletedSale, 1);
  });

  it('AT-194 counts each Order event by its own timestamp and keeps backlog as a current snapshot', async () => {
    const report = await serviceWith().getOrderReport({ mode: 'period', from: '2026-07-01', to: '2026-07-31' });
    assert.deepEqual(report.orders.periodEvents, {
      created: 4, confirmed: 1, shipped: 1, delivered: 3, cancelled: 0, returned: 1,
    });
    assert.equal(report.orders.currentSnapshot.total, 6);
    assert.equal(report.orders.currentSnapshot.backlog, 1);
    assert.equal(report.orders.currentSnapshot.byStatus.Returned, 1);
    assert.equal(report.orders.currentSnapshot.dataAsOf.toISOString(), NOW.toISOString());

    const withAuditedCancellation = await serviceWith({
      auditLogs: [
        {
          actorId: 'staff-active',
          actorRole: 'Staff',
          outcome: 'Success',
          targetType: 'Order',
          targetId: 'order-pending',
          action: 'ORDER_CANCEL',
          timestamp: new Date('2026-07-11T00:00:00.000Z'),
        },
      ],
    }).getOrderReport({ mode: 'period', from: '2026-07-01', to: '2026-07-31' });
    assert.equal(withAuditedCancellation.orders.periodEvents.cancelled, 1);
  });

  it('AT-195 uses immutable line snapshots, retains inactive products, separates later activity, and sorts ties deterministically', async () => {
    const report = await serviceWith().getProductReport({ mode: 'period', from: '2026-07-01', to: '2026-07-31' });
    assert.equal(report.products.gross.units, 2);
    assert.equal(report.products.gross.value, 700);
    assert.deepEqual(report.products.gross.items.map((item) => item.productId), ['product-active', 'product-inactive']);
    assert.equal(report.products.gross.items[1].productNameSnapshot, 'Old fern');
    assert.equal(report.products.gross.items[1].currentStatus, 'Inactive');
    assert.equal(report.products.afterSales.returnedUnits, 2);
    assert.equal(report.products.afterSales.exchangeReturnedUnits, 1);
    assert.equal(report.products.afterSales.exchangeReplacementUnits, 1);
    assert.equal('rank' in report.products.gross.items[0], false);
  });

  it('AT-196 uses exact Customer populations and immutable completed-sale clocks', async () => {
    const report = await serviceWith().getCustomerReport({ mode: 'period', from: '2026-07-01', to: '2026-07-31' });
    assert.deepEqual(report.customers.currentSnapshot.byStatus, { Active: 1, Disabled: 1 });
    assert.equal(report.customers.period.newCustomers, 1);
    assert.equal(report.customers.period.orderingCustomers, 2);
    assert.equal(report.customers.period.completedSaleCustomers, 2);
  });

  it('AT-197 retains Disabled Staff, exposes workload/duration denominators, and never emits a score or rank', async () => {
    const report = await serviceWith().getStaffReport({ mode: 'period', from: '2026-07-01', to: '2026-07-31' });
    const disabled = report.staff.items.find((item) => item.staffId === 'staff-disabled');
    const active = report.staff.items.find((item) => item.staffId === 'staff-active');
    assert.equal(disabled.currentStatus, 'Disabled');
    assert.equal(disabled.workload.successfulActions, 1);
    assert.equal(disabled.support.firstResponse.qualifyingCount, 1);
    assert.equal(disabled.support.firstResponse.averageMinutes, 60);
    assert.equal(disabled.support.resolution.qualifyingCount, 1);
    assert.equal(disabled.support.resolution.averageMinutes, 240);
    assert.equal(active.support.firstResponse.qualifyingCount, 0);
    assert.equal(active.support.firstResponse.averageMinutes, null);
    assert.equal(active.support.missingFirstResponseCount, 1);
    assert.equal('score' in disabled, false);
    assert.equal('rank' in disabled, false);
  });

  it('AT-198 separates current Inventory dimensions/alerts from signed period movements and returns real zeroes', async () => {
    const report = await serviceWith().getInventoryReport({ mode: 'period', from: '2026-07-01', to: '2026-07-31' });
    assert.deepEqual(report.inventory.currentSnapshot.totals, {
      sellable: 14, reserved: 3, quarantined: 3, damaged: 3, available: 8,
    });
    assert.equal(report.inventory.currentSnapshot.lowStockCount, 1);
    assert.equal(report.inventory.currentSnapshot.openAlertCount, 1);
    assert.deepEqual(report.inventory.periodMovements.byType.ADJUSTMENT, { count: 1, signedQuantity: 5 });
    assert.deepEqual(report.inventory.periodMovements.byType.STOCK_EXPORT, { count: 1, signedQuantity: -2 });
    assert.deepEqual(report.inventory.lowStockEvents, { opened: 2, resolved: 1 });
    assert.equal(report.inventory.definitions.currentSnapshot.includes('current'), true);
    assert.equal(report.inventory.definitions.periodMovements.includes('signed'), true);

    const empty = await serviceWith({ inventory: [], inventoryTransactions: [], lowStockAlerts: [] })
      .getInventoryReport({ mode: 'period', from: '2026-07-01', to: '2026-07-31' });
    assert.equal(empty.inventory.currentSnapshot.totalRecords, 0);
    assert.equal(empty.inventory.periodMovements.count, 0);
    assert.deepEqual(empty.inventory.periodMovements.byType, {});
  });

  it('keeps each detailed endpoint bounded to only its authoritative repositories', async () => {
    const cases = [
      ['getRevenueReport', ['listOrders', 'listRefunds']],
      ['getOrderReport', ['listOrders', 'listAuditLogs']],
      ['getProductReport', ['listOrders', 'listOrderDetails', 'listProducts', 'listInventoryTransactions']],
      ['getCustomerReport', ['listOrders', 'listUsers']],
      ['getStaffReport', ['listUsers', 'listSupportRequests', 'listSupportMessages', 'listAuditLogs']],
      ['getInventoryReport', ['listInventory', 'listInventoryTransactions', 'listLowStockAlerts']],
    ];
    for (const [method, allowed] of cases) {
      const calls = [];
      const repository = {};
      for (const repositoryMethod of [
        'listOrders', 'listOrderDetails', 'listRefunds', 'listProducts', 'listUsers',
        'listInventory', 'listInventoryTransactions', 'listLowStockAlerts',
        'listSupportRequests', 'listSupportMessages', 'listAuditLogs', 'listReviews',
      ]) {
        repository[repositoryMethod] = async () => {
          calls.push(repositoryMethod);
          return [];
        };
      }
      const service = createReportService({ repository, clock: () => new Date(NOW) });
      await service[method]({ mode: 'allTime' });
      assert.deepEqual(calls.sort(), [...allowed].sort(), method);
    }
  });
});
