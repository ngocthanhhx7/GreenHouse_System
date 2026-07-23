const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const {
  ACTIVE_RETURN_STATUSES,
  createMigrationRepository,
  migrateSl002Exchange,
  planReturnLockBackfill,
  runCli,
} = require('./migrateSl002Exchange');
const AuditLog = require('../models/auditLog.model');

function activeReturn(overrides = {}) {
  return {
    _id: 'return-active-1',
    orderId: 'order-1',
    status: ACTIVE_RETURN_STATUSES[0],
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    completedAt: null,
    ...overrides,
  };
}

function completedReturn(overrides = {}) {
  return {
    _id: 'return-completed-1',
    orderId: 'order-1',
    status: 'Completed',
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    completedAt: new Date('2026-07-22T00:00:00.000Z'),
    ...overrides,
  };
}

function assertConflict(rows, context) {
  assert.throws(
    () => planReturnLockBackfill(rows),
    (error) => {
      assert.equal(error.code, 'SL002_LOCK_BACKFILL_CONFLICT');
      assert.match(error.message, new RegExp(context));
      return true;
    },
  );
}

function createFakeRepository({
  returnCases = [],
  deliveredOrders = [],
  auditEventIdConflicts = [],
} = {}) {
  const writes = [];
  const deadlines = new Set();
  const locks = new Set();
  return {
    writes,
    async loadAuditEventIdConflicts() {
      return auditEventIdConflicts.map((entry) => ({ ...entry }));
    },
    async loadReturnCasesForLockBackfill() {
      return returnCases.map((entry) => ({ ...entry }));
    },
    async loadDeliveredOrdersWithoutExchangeDeadline() {
      return deliveredOrders
        .filter((entry) => !deadlines.has(String(entry._id)))
        .map((entry) => ({ ...entry }));
    },
    async backfillExchangeDeadline(orderId, exchangeDeadlineAt) {
      writes.push({ kind: 'deadline', orderId, exchangeDeadlineAt });
      if (deadlines.has(String(orderId))) return 0;
      deadlines.add(String(orderId));
      return 1;
    },
    async backfillReturnLock(item) {
      writes.push({ kind: 'lock', caseId: item.caseId });
      if (locks.has(String(item.orderId))) return 0;
      locks.add(String(item.orderId));
      return 1;
    },
    async loadUnitsWithoutPhysicalClaim() { return []; },
    async loadExchangeCaseStatuses() { return []; },
    async backfillPhysicalClaim() { return 0; },
    async verifyIndexes() {
      writes.push({ kind: 'indexes' });
      return 11;
    },
  };
}

describe('SL-002 migration Return lock preflight', () => {
  it('plans exactly one active Return as an Active lock', () => {
    assert.deepEqual(planReturnLockBackfill([activeReturn()]), [{
      orderId: 'order-1',
      caseType: 'RETURN_REFUND',
      caseId: 'return-active-1',
      status: 'Active',
      acquiredAt: new Date('2026-07-20T00:00:00.000Z'),
      releasedAt: null,
      terminalStatus: '',
    }]);
  });

  it('plans exactly one completed Return as a permanently closed lock', () => {
    assert.deepEqual(planReturnLockBackfill([completedReturn()]), [{
      orderId: 'order-1',
      caseType: 'RETURN_REFUND',
      caseId: 'return-completed-1',
      status: 'ClosedPermanently',
      acquiredAt: new Date('2026-07-20T00:00:00.000Z'),
      releasedAt: new Date('2026-07-22T00:00:00.000Z'),
      terminalStatus: 'Completed',
    }]);
  });

  it('rejects an active plus completed Return for the same order', () => {
    assertConflict([activeReturn(), completedReturn()], 'order-1.*active=1.*completed=1');
  });

  it('rejects multiple active Returns for the same order', () => {
    assertConflict([
      activeReturn(),
      activeReturn({ _id: 'return-active-2', status: ACTIVE_RETURN_STATUSES[1] }),
    ], 'order-1.*active=2.*completed=0');
  });

  it('rejects multiple completed Returns for the same order', () => {
    assertConflict([
      completedReturn(),
      completedReturn({ _id: 'return-completed-2' }),
    ], 'order-1.*active=0.*completed=2');
  });

  it('performs zero writes when any order is ambiguous, including deadline writes', async () => {
    const repository = createFakeRepository({
      returnCases: [
        activeReturn(),
        completedReturn(),
        activeReturn({ _id: 'return-active-safe', orderId: 'order-safe' }),
      ],
      deliveredOrders: [{
        _id: 'order-delivered',
        deliveredAt: new Date('2026-07-20T00:00:00.000Z'),
      }],
    });

    await assert.rejects(
      () => migrateSl002Exchange({ repository }),
      (error) => error.code === 'SL002_LOCK_BACKFILL_CONFLICT',
    );
    assert.deepEqual(repository.writes, []);
  });

  it('performs zero writes when duplicate non-empty AuditLog event identities exist', async () => {
    const repository = createFakeRepository({
      auditEventIdConflicts: [{
        eventId: 'EXCHANGE_REJECTED:exchange-1',
        count: 2,
        ids: ['audit-1', 'audit-2'],
      }],
      returnCases: [activeReturn()],
      deliveredOrders: [{
        _id: 'order-delivered',
        deliveredAt: new Date('2026-07-20T00:00:00.000Z'),
      }],
    });

    await assert.rejects(
      () => migrateSl002Exchange({ repository }),
      (error) => (
        error.code === 'SL002_AUDIT_EVENT_ID_CONFLICT'
        && /EXCHANGE_REJECTED:exchange-1/.test(error.message)
        && /count=2/.test(error.message)
      )
    );
    assert.deepEqual(repository.writes, []);
  });

  it('is repeat-safe and reports no second-run writes', async () => {
    const repository = createFakeRepository({
      returnCases: [activeReturn()],
      deliveredOrders: [{
        _id: 'order-1',
        deliveredAt: new Date('2026-07-20T00:00:00.000Z'),
      }],
    });

    const first = await migrateSl002Exchange({ repository });
    const second = await migrateSl002Exchange({ repository });

    assert.deepEqual(first, {
      deadlinesBackfilled: 1,
      locksBackfilled: 1,
      physicalClaimsBackfilled: 0,
      indexesVerified: 11,
    });
    assert.deepEqual(second, {
      deadlinesBackfilled: 0,
      locksBackfilled: 0,
      physicalClaimsBackfilled: 0,
      indexesVerified: 11,
    });
  });

  it('exposes the production repository factory without connecting during import', () => {
    assert.equal(typeof createMigrationRepository, 'function');
  });

  it('disables Mongoose auto-index before connecting and running the explicit migration', async () => {
    const operations = [];
    await runCli({
      loadEnv: () => { operations.push('env'); },
      mongooseClient: {
        set(key, value) {
          operations.push(`set:${key}:${value}`);
        },
        async disconnect() {
          operations.push('disconnect');
        },
      },
      connect: async () => {
        operations.push('connect');
      },
      migrate: async () => {
        operations.push('preflight-and-explicit-indexes');
        return {
          deadlinesBackfilled: 0,
          locksBackfilled: 0,
          physicalClaimsBackfilled: 0,
          indexesVerified: 11,
        };
      },
      logger: {
        log() {},
        table() {},
      },
    });

    assert.deepEqual(operations, [
      'env',
      'set:autoIndex:false',
      'connect',
      'preflight-and-explicit-indexes',
      'disconnect',
    ]);
  });

  it('verifies the AuditLog business-event index with every SL-002 persistence index', async () => {
    const called = new Set();
    const originals = new Map();
    for (const model of Object.values(mongoose.models)) {
      originals.set(model, model.createIndexes);
      model.createIndexes = async () => {
        called.add(model.modelName);
      };
    }

    try {
      const count = await createMigrationRepository().verifyIndexes();
      assert.equal(count, 11);
      assert.ok(called.has(AuditLog.modelName));
    } finally {
      for (const [model, createIndexes] of originals) model.createIndexes = createIndexes;
    }
  });

  it('aggregates duplicate non-empty AuditLog event identities before index creation', async () => {
    const originalAggregate = AuditLog.aggregate;
    let pipeline;
    AuditLog.aggregate = async (receivedPipeline) => {
      pipeline = receivedPipeline;
      return [{
        eventId: 'EXCHANGE_REJECTED:exchange-1',
        count: 2,
        ids: ['audit-1', 'audit-2'],
      }];
    };

    try {
      const conflicts = await createMigrationRepository().loadAuditEventIdConflicts();
      assert.equal(conflicts[0].eventId, 'EXCHANGE_REJECTED:exchange-1');
    } finally {
      AuditLog.aggregate = originalAggregate;
    }

    assert.deepEqual(pipeline, [
      { $match: { eventId: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: '$eventId',
          count: { $sum: 1 },
          ids: { $push: '$_id' },
        },
      },
      { $match: { count: { $gt: 1 } } },
      {
        $project: {
          _id: 0,
          eventId: '$_id',
          count: 1,
          ids: 1,
        },
      },
      { $sort: { eventId: 1 } },
    ]);
  });
});
