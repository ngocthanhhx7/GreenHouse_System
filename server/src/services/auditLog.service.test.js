const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createAuditLogService } = require('./auditLog.service');

describe('audit log service', () => {
  it('lists audit logs with filters and newest first', async () => {
    const receivedFilters = [];
    const logs = [
      {
        _id: 'audit-2',
        userId: 'admin-1',
        action: 'AUTH_LOGIN_SUCCESS',
        targetEntity: 'User',
        targetId: 'admin-1',
        description: 'Admin login',
        timestamp: new Date('2026-07-01T02:00:00.000Z'),
      },
      {
        _id: 'audit-1',
        userId: 'customer-1',
        action: 'ORDER_CREATE',
        targetEntity: 'Order',
        targetId: 'order-1',
        description: 'Order created',
        timestamp: new Date('2026-07-01T01:00:00.000Z'),
      },
    ];
    const service = createAuditLogService({
      repository: {
        async list(filters) {
          receivedFilters.push(filters);
          return logs;
        },
      },
    });

    const result = await service.listAuditLogs({
      action: 'ORDER_CREATE',
      userId: 'customer-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-02T00:00:00.000Z',
    });

    assert.equal(result.total, 2);
    assert.equal(result.items[0].id, 'audit-2');
    assert.equal(receivedFilters[0].action, 'ORDER_CREATE');
    assert.equal(receivedFilters[0].userId, 'customer-1');
    assert.ok(receivedFilters[0].from instanceof Date);
    assert.ok(receivedFilters[0].to instanceof Date);
  });

  it('rejects invalid audit log date filters', async () => {
    const service = createAuditLogService({
      repository: {
        async list() {
          return [];
        },
      },
    });

    await assert.rejects(
      () => service.listAuditLogs({ from: 'not-a-date' }),
      /Invalid audit date filter/
    );
  });
});
