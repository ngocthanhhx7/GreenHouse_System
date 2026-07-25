const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  authorizeCurrentTargetRecord,
  createNotificationTargetResolver,
} = require('./notificationTargetResolver.service');

function resolverWith(targets = {}) {
  return createNotificationTargetResolver({
    targetAuthorizer: {
      async authorizeCurrent(currentActor, target) {
        const record = targets[`${target.collection}:${target.id}`] || null;
        return authorizeCurrentTargetRecord(currentActor, target, record);
      },
    },
  });
}

const actor = (id, role) => ({ id, role, status: 'Active' });

describe('SL-009 Notification target authorization', () => {
  it('AT-180 resolves only routes currently authorized by role and ownership', async () => {
    const resolver = resolverWith({
      'Order:order-1': { _id: 'order-1', customerId: 'customer-1', orderStatus: 'Shipped' },
      'ReturnRefundRequest:return-1': { _id: 'return-1', customerId: 'customer-1', status: 'Approved' },
      'ExchangeCase:exchange-1': { _id: 'exchange-1', customerId: 'customer-1', status: 'Approved' },
      'ProductReview:review-1': { _id: 'review-1', customerId: 'customer-1', publicationStatus: 'Published' },
      'SupportRequest:support-1': { _id: 'support-1', customerId: 'customer-1', assigneeId: 'staff-1', ticketCode: 'SUP-001', status: 'InProgress' },
      'Inventory:inventory-1': { _id: 'inventory-1', inventoryHealth: 'Normal' },
      'LowStockAlert:low-stock-1': { _id: 'low-stock-1', status: 'Resolved', inventoryId: 'inventory-1', productId: 'product-1' },
      'ReplenishmentRequest:replenishment-1': { _id: 'replenishment-1', requestedBy: 'warehouse-1', status: 'PendingApproval' },
      'DamageReport:damage-1': { _id: 'damage-1', reportedBy: 'staff-1', status: 'PendingReview' },
      'StockExportRequest:export-1': { _id: 'export-1', requestedBy: 'staff-1', orderId: 'order-1', status: 'Approved' },
    });

    assert.deepEqual(await resolver.resolve(actor('customer-1', 'Customer'), { collection: 'Order', id: 'order-1' }), { href: '/orders/order-1' });
    assert.deepEqual(await resolver.resolve(actor('staff-1', 'Staff'), { collection: 'SupportRequest', id: 'support-1' }), { href: '/staff/support-requests/support-1' });
    assert.deepEqual(await resolver.resolve(actor('warehouse-1', 'WarehouseManager'), { collection: 'Inventory', id: 'inventory-1' }), { href: '/warehouse/inventory' });
    assert.deepEqual(await resolver.resolve(actor('warehouse-1', 'WarehouseManager'), { collection: 'LowStockAlert', id: 'low-stock-1' }), { href: '/warehouse/low-stock' });
    assert.deepEqual(await resolver.resolve(actor('admin-1', 'Admin'), { collection: 'ReplenishmentRequest', id: 'replenishment-1' }), { href: '/admin/replenishments' });
    assert.deepEqual(await resolver.resolve(actor('staff-1', 'Staff'), { collection: 'DamageReport', id: 'damage-1' }), { href: '/staff/damage-reports' });
    assert.deepEqual(await resolver.resolve(actor('warehouse-1', 'WarehouseManager'), { collection: 'DamageReport', id: 'damage-1' }), { href: '/warehouse/damage-reports' });
    assert.deepEqual(await resolver.resolve(actor('staff-1', 'Staff'), { collection: 'StockExportRequest', id: 'export-1' }), { href: '/staff/orders/order-1' });
  });

  it('AT-180 follows the Support owning read boundary for every Active Staff member', async () => {
    const resolver = resolverWith({
      'SupportRequest:support-1': {
        _id: 'support-1', customerId: 'customer-1', assigneeId: 'staff-2', status: 'InProgress',
      },
    });

    assert.deepEqual(
      await resolver.resolve(actor('staff-1', 'Staff'), { collection: 'SupportRequest', id: 'support-1' }),
      { href: '/staff/support-requests/support-1' },
    );
  });

  it('AT-180 delegates every click to the owning slice current-read boundary', async () => {
    const calls = [];
    const resolver = createNotificationTargetResolver({
      targetAuthorizer: {
        async authorizeCurrent(currentActor, target) {
          calls.push({ currentActor, target });
          return { href: '/orders/order-1', privateRecord: { shippingAddress: 'must not leak' } };
        },
      },
    });
    const currentActor = actor('customer-1', 'Customer');

    assert.deepEqual(
      await resolver.resolve(currentActor, { collection: 'Order', id: 'order-1' }),
      { href: '/orders/order-1' },
    );
    assert.deepEqual(calls, [{
      currentActor,
      target: { collection: 'Order', id: 'order-1' },
    }]);
  });

  it('AT-180 returns one generic unavailable error for malformed, missing, changed, or foreign targets', async () => {
    const resolver = resolverWith({
      'Order:order-foreign': { _id: 'order-foreign', customerId: 'customer-2', orderStatus: 'Shipped', shippingAddress: 'must not leak' },
      'SupportRequest:support-1': { _id: 'support-1', customerId: 'customer-1', assigneeId: 'staff-2', status: 'InProgress', subject: 'must not leak' },
    });
    const attempts = [
      () => resolver.resolve(actor('customer-1', 'Customer'), { collection: 'Order', id: 'bad-id' }),
      () => resolver.resolve(actor('customer-1', 'Customer'), { collection: 'Order', id: 'missing' }),
      () => resolver.resolve(actor('customer-1', 'Customer'), { collection: 'Order', id: 'order-foreign' }),
      () => resolver.resolve({ id: 'customer-1', role: 'Customer', status: 'Disabled' }, { collection: 'Order', id: 'order-foreign' }),
      () => resolver.resolve({ id: 'customer-1', role: 'Customer' }, { collection: 'Order', id: 'order-foreign' }),
    ];

    for (const attempt of attempts) {
      await assert.rejects(attempt, (error) => {
        assert.equal(error.statusCode, 404);
        assert.equal(error.message, 'Notification target unavailable');
        assert.equal(error.data, null);
        assert.doesNotMatch(JSON.stringify(error), /shippingAddress|subject|must not leak/);
        return true;
      });
    }
  });

  it('AT-180 fails closed when the current-read boundary declines or errors', async () => {
    const declined = createNotificationTargetResolver({
      targetAuthorizer: { async authorizeCurrent() { return null; } },
    });
    const failed = createNotificationTargetResolver({
      targetAuthorizer: { async authorizeCurrent() { throw new Error('database detail'); } },
    });
    const unsafeHref = createNotificationTargetResolver({
      targetAuthorizer: { async authorizeCurrent() { return { href: '//attacker.invalid' }; } },
    });

    for (const resolver of [declined, failed, unsafeHref]) {
      await assert.rejects(
        () => resolver.resolve(actor('customer-1', 'Customer'), { collection: 'Order', id: 'order-1' }),
        (error) => error.statusCode === 404 && error.message === 'Notification target unavailable',
      );
    }
  });
});
