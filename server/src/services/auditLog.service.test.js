const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  createAuditLogService,
  createModelRepository,
  encodeCursor,
} = require('./auditLog.service');
const AuditLog = require('../models/auditLog.model');

function canonicalLog(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    auditId: 'c7028a06-7ee8-44e8-b09d-66245ca31fa1',
    actorType: 'User',
    actorId: '507f1f77bcf86cd799439011',
    actorRole: 'Admin',
    source: 'AdminAccountService',
    action: 'ACCOUNT_STATUS_CHANGED',
    targetType: 'User',
    targetId: '507f1f77bcf86cd799439012',
    outcome: 'Success',
    correlationId: 'account-status:1',
    businessEventId: 'account-status:1',
    reasonCode: 'ADMIN_DECISION',
    reason: 'Approved status update',
    previousState: 'Active',
    newState: 'Disabled',
    stateVersion: 2,
    safeFacts: { status: 'Disabled' },
    timestamp: new Date('2026-07-01T02:00:00.000Z'),
    ...overrides,
  };
}

describe('SL-009 audit log service', () => {
  it('AT-183/189 validates all filters and returns only safe canonical DTO fields', async () => {
    const received = [];
    const service = createAuditLogService({
      repository: {
        async list(filters) {
          received.push(filters);
          return { items: [canonicalLog({ before: { password: 'leak' } })], nextCursor: null };
        },
      },
    });

    const result = await service.listAuditLogs({
      actorType: 'User',
      actorId: '507f1f77bcf86cd799439011',
      role: 'Admin',
      action: 'ACCOUNT_STATUS_CHANGED',
      targetType: 'User',
      targetId: '507f1f77bcf86cd799439012',
      outcome: 'Success',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-02T00:00:00.000Z',
      limit: '25',
    });

    assert.equal(received[0].actorType, 'User');
    assert.equal(received[0].actorId, '507f1f77bcf86cd799439011');
    assert.equal(received[0].actorRole, 'Admin');
    assert.equal(received[0].targetType, 'User');
    assert.equal(received[0].targetId, '507f1f77bcf86cd799439012');
    assert.equal(received[0].outcome, 'Success');
    assert.equal(received[0].limit, 25);
    assert.ok(received[0].from instanceof Date);
    assert.ok(received[0].to instanceof Date);

    assert.deepEqual(Object.keys(result.items[0]), [
      'auditId', 'actorType', 'actorId', 'actorRole', 'source', 'action',
      'targetType', 'targetId', 'outcome', 'correlationId', 'businessEventId',
      'reasonCode', 'reason', 'previousState', 'newState', 'stateVersion',
      'safeFacts', 'timestamp', 'id', 'userId', 'targetEntity', 'description',
    ]);
    assert.equal(JSON.stringify(result).includes('password'), false);
    assert.equal(result.nextCursor, null);
  });

  it('adapts persisted legacy rows to canonical and safe compatibility fields', async () => {
    const service = createAuditLogService({
      repository: {
        async list() {
          return {
            items: [{
              _id: '507f1f77bcf86cd799439099',
              userId: '507f1f77bcf86cd799439011',
              action: 'ORDER_CREATE',
              eventId: 'order:create:1',
              targetEntity: 'Order',
              targetId: 'order-1',
              description: 'Order created',
              before: { password: 'must-not-leak' },
              timestamp: new Date('2026-07-01T02:00:00.000Z'),
            }],
            nextCursor: null,
          };
        },
      },
    });

    const [item] = (await service.listAuditLogs()).items;
    assert.equal(item.auditId, '507f1f77bcf86cd799439099');
    assert.equal(item.actorType, 'User');
    assert.equal(item.actorId, '507f1f77bcf86cd799439011');
    assert.equal(item.source, 'LegacyApplication');
    assert.equal(item.targetType, 'Order');
    assert.equal(item.outcome, 'Success');
    assert.equal(item.correlationId, 'order:create:1');
    assert.equal(item.reason, 'Order created');
    assert.equal(item.id, item.auditId);
    assert.equal(item.userId, item.actorId);
    assert.equal(item.targetEntity, item.targetType);
    assert.equal(item.description, item.reason);
    assert.equal(JSON.stringify(item).includes('must-not-leak'), false);
  });

  it('redacts and bounds legacy descriptions before returning compatibility DTO fields', async () => {
    const service = createAuditLogService({
      repository: {
        async list() {
          return {
            items: [{
              _id: '507f1f77bcf86cd799439099',
              action: 'LEGACY_FAILURE',
              targetEntity: 'SupportRequest',
              targetId: 'support-1',
              description: `token=secret ${'full support content '.repeat(100)}`,
              timestamp: new Date('2026-07-01T02:00:00.000Z'),
            }],
            nextCursor: null,
          };
        },
      },
    });

    const [item] = (await service.listAuditLogs()).items;
    assert.equal(item.reason, '[REDACTED]');
    assert.equal(item.description, '[REDACTED]');
    assert.equal(JSON.stringify(item).includes('secret'), false);
    assert.equal(JSON.stringify(item).includes('full support content'), false);
  });

  it('redacts whitespace and Bearer secrets from persisted legacy descriptions', async () => {
    const service = createAuditLogService({
      repository: {
        async list() {
          return {
            items: [
              canonicalLog({
                _id: '507f1f77bcf86cd799439091',
                auditId: undefined,
                reason: undefined,
                description: 'Nested { PaSsWoRd abc123 }',
              }),
              canonicalLog({
                _id: '507f1f77bcf86cd799439092',
                auditId: undefined,
                reason: undefined,
                description: 'Authorization: Bearer legacy-secret',
              }),
            ],
            nextCursor: null,
          };
        },
      },
    });

    const { items } = await service.listAuditLogs();
    assert.deepEqual(items.map((item) => item.reason), ['[REDACTED]', '[REDACTED]']);
    assert.equal(JSON.stringify(items).includes('abc123'), false);
    assert.equal(JSON.stringify(items).includes('legacy-secret'), false);
  });

  it('AT-189 reports distinct Vietnamese field errors without querying', async () => {
    let queried = false;
    const service = createAuditLogService({
      repository: {
        async list() {
          queried = true;
          return { items: [], nextCursor: null };
        },
      },
    });

    await assert.rejects(
      () => service.listAuditLogs({
        actorType: 'Robot',
        actorId: 'bad actor!',
        role: 'SuperAdmin',
        action: 'bad action!',
        targetType: 'bad target!',
        targetId: 'x'.repeat(201),
        outcome: 'Maybe',
        from: 'not-a-date',
        to: 'also-not-a-date',
        cursor: 'not-a-cursor',
        limit: '1000',
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, 'Bộ lọc nhật ký kiểm toán không hợp lệ.');
        assert.equal(error.errorCode, 'AUDIT_FILTER_INVALID');
        assert.deepEqual(
          new Set(error.errors.map((item) => item.field)),
          new Set([
            'actorType', 'actorId', 'role', 'action', 'targetType', 'targetId',
            'outcome', 'from', 'to', 'cursor', 'limit',
          ])
        );
        return true;
      }
    );
    assert.equal(queried, false);
  });

  it('rejects a numeric cursor id as a typed filter error before querying', async () => {
    let queried = false;
    const numericCursor = Buffer.from(JSON.stringify({
      timestamp: '2026-07-01T02:00:00.000Z',
      id: 6,
    })).toString('base64url');
    const service = createAuditLogService({
      repository: {
        async list() {
          queried = true;
          return { items: [], nextCursor: null };
        },
      },
    });

    await assert.rejects(
      () => service.listAuditLogs({ cursor: numericCursor }),
      (error) => {
        assert.equal(error.errorCode, 'AUDIT_FILTER_INVALID');
        assert.deepEqual(error.errors.map((item) => item.field), ['cursor']);
        return true;
      }
    );
    assert.equal(queried, false);
  });

  it('AT-184 supports a bounded external actor identity filter', async () => {
    let received;
    const service = createAuditLogService({
      repository: {
        async list(filters) {
          received = filters;
          return { items: [], nextCursor: null };
        },
      },
    });

    await service.listAuditLogs({ actorType: 'Carrier', actorId: 'carrier:ghn' });
    assert.equal(received.actorType, 'Carrier');
    assert.equal(received.actorId, 'carrier:ghn');
  });

  it('does not add an ObjectId userId fallback for a non-ObjectId external actor', async () => {
    let castQuery;
    const fakeModel = {
      find(query) {
        castQuery = AuditLog.find(query);
        castQuery.cast(AuditLog);
        return {
          sort() {
            return {
              limit() {
                return { lean: async () => [] };
              },
            };
          },
        };
      },
    };
    const repository = createModelRepository(fakeModel);

    await repository.list({
      actorType: 'Carrier',
      actorId: 'carrier:ghn',
      limit: 20,
    });

    assert.deepEqual(castQuery.getFilter(), {
      actorType: 'Carrier',
      actorId: 'carrier:ghn',
    });
  });

  it('loads audit list rows through an inclusive safe projection only', async () => {
    let projection;
    const fakeModel = {
      find(_query, receivedProjection) {
        projection = receivedProjection;
        return {
          sort() {
            return {
              limit() {
                return { lean: async () => [] };
              },
            };
          },
        };
      },
    };

    await createModelRepository(fakeModel).list({ limit: 20 });

    assert.deepEqual(projection, {
      _id: 1,
      auditId: 1,
      actorType: 1,
      actorId: 1,
      actorRole: 1,
      source: 1,
      action: 1,
      targetType: 1,
      targetId: 1,
      outcome: 1,
      correlationId: 1,
      businessEventId: 1,
      reasonCode: 1,
      reason: 1,
      previousState: 1,
      newState: 1,
      stateVersion: 1,
      safeFacts: 1,
      timestamp: 1,
      userId: 1,
      eventId: 1,
      targetEntity: 1,
      description: 1,
    });
    for (const forbidden of [
      'before',
      'after',
      'metadata',
      'ip',
      'userAgent',
      'payload',
      'replayBinding',
      'commandResult',
    ]) {
      assert.equal(projection[forbidden], undefined, forbidden);
    }
  });

  it('AT-189 rejects an inverted date range with a range-specific field error', async () => {
    const service = createAuditLogService({ repository: { async list() { return []; } } });
    await assert.rejects(
      () => service.listAuditLogs({
        from: '2026-07-03T00:00:00.000Z',
        to: '2026-07-02T00:00:00.000Z',
      }),
      (error) => {
        assert.deepEqual(error.errors, [{
          field: 'period',
          message: 'Thời điểm bắt đầu phải trước hoặc bằng thời điểm kết thúc.',
        }]);
        return true;
      }
    );
  });

  it('AT-189 uses a stable cursor query for records sharing a timestamp', async () => {
    const timestamp = new Date('2026-07-01T02:00:00.000Z');
    const cursorId = '507f1f77bcf86cd799439050';
    const cursor = encodeCursor({ _id: cursorId, timestamp });
    let query;
    let sort;
    let limit;
    const fakeModel = {
      find(receivedQuery) {
        query = receivedQuery;
        return {
          sort(receivedSort) {
            sort = receivedSort;
            return {
              limit(receivedLimit) {
                limit = receivedLimit;
                return { lean: async () => [] };
              },
            };
          },
        };
      },
    };

    const repository = createModelRepository(fakeModel);
    await repository.list({ cursor, limit: 20 });

    assert.deepEqual(query.$or, [
      { timestamp: { $lt: timestamp } },
      { timestamp, _id: { $lt: cursorId } },
    ]);
    assert.deepEqual(sort, { timestamp: -1, _id: -1 });
    assert.equal(limit, 21);
  });

  it('queries canonical and persisted legacy actor/target fields without losing cursor stability', async () => {
    let query;
    const fakeModel = {
      find(receivedQuery) {
        query = receivedQuery;
        return {
          sort() {
            return {
              limit() {
                return { lean: async () => [] };
              },
            };
          },
        };
      },
    };
    const repository = createModelRepository(fakeModel);
    await repository.list({
      actorType: 'User',
      actorId: '507f1f77bcf86cd799439011',
      targetType: 'Order',
      limit: 20,
    });

    assert.deepEqual(query.$and, [
      {
        $or: [
          { actorType: 'User' },
          { actorType: { $exists: false }, userId: { $ne: null } },
        ],
      },
      {
        $or: [
          { actorId: '507f1f77bcf86cd799439011' },
          { userId: '507f1f77bcf86cd799439011' },
        ],
      },
      {
        $or: [
          { targetType: 'Order' },
          { targetEntity: 'Order' },
        ],
      },
    ]);
  });

  it('AT-189 emits a next cursor without skipping equal-timestamp rows', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => canonicalLog({
      _id: `507f1f77bcf86cd79943905${index}`,
      auditId: `00000000-0000-4000-8000-00000000000${index}`,
      timestamp: new Date('2026-07-01T02:00:00.000Z'),
    }));
    const service = createAuditLogService({
      repository: {
        async list(filters) {
          assert.equal(filters.limit, 2);
          return { items: rows.slice(0, 2), nextCursor: encodeCursor(rows[1]) };
        },
      },
    });

    const result = await service.listAuditLogs({ limit: 2 });
    assert.equal(result.items.length, 2);
    assert.ok(result.nextCursor);
  });
});
