const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  ACTIVE_RETURN_STATUSES,
  createMigrationRepository,
  migrateSl002Exchange,
  planReturnLockBackfill,
} = require('./migrateSl002Exchange');

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

function createFakeRepository({ returnCases = [], deliveredOrders = [] } = {}) {
  const writes = [];
  const deadlines = new Set();
  const locks = new Set();
  return {
    writes,
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
    async verifyIndexes() { return 10; },
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
      indexesVerified: 10,
    });
    assert.deepEqual(second, {
      deadlinesBackfilled: 0,
      locksBackfilled: 0,
      physicalClaimsBackfilled: 0,
      indexesVerified: 10,
    });
  });

  it('exposes the production repository factory without connecting during import', () => {
    assert.equal(typeof createMigrationRepository, 'function');
  });
});
