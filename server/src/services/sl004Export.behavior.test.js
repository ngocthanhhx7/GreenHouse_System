const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createInventoryService } = require('./inventory.service');

function createHarness({
  reconciliationRequired = false,
  failMovementFor = '',
  requestKind = 'Initial',
  orderStatus = 'Confirmed',
  cycleType = 'Initial',
  requestStatus = 'Pending',
  processingStartedAt = null,
} = {}) {
  const state = {
    request: {
      _id: 'export-1',
      orderId: 'order-1',
      cycleId: 'cycle-1',
      requestKind,
      status: requestStatus,
      processingCommandKey: '',
      processingStartedAt,
      completedCommandKey: '',
      note: '',
    },
    cycle: {
      _id: 'cycle-1',
      orderId: 'order-1',
      cycleType,
      status: 'AwaitingExport',
    },
    order: {
      _id: 'order-1',
      orderCode: 'GH-004-1',
      orderStatus,
      paymentStatus: 'Paid',
      customerId: 'customer-1',
    },
    details: [
      { _id: 'detail-1', orderId: 'order-1', productId: 'product-1', quantity: 2 },
      { _id: 'detail-2', orderId: 'order-1', productId: 'product-2', quantity: 1 },
    ],
    reservations: [
      { orderId: 'order-1', orderDetailId: 'detail-1', quantity: 2, status: 'Reserved' },
      { orderId: 'order-1', orderDetailId: 'detail-2', quantity: 1, status: 'Reserved' },
    ],
    inventories: [
      {
        _id: 'inventory-1',
        productId: 'product-1',
        stockQuantity: 10,
        sellableQuantity: 10,
        reservedQuantity: 2,
        damagedQuantity: 0,
        quarantinedQuantity: 0,
        inventoryHealth: reconciliationRequired ? 'ReconciliationRequired' : 'Normal',
      },
      {
        _id: 'inventory-2',
        productId: 'product-2',
        stockQuantity: 5,
        sellableQuantity: 5,
        reservedQuantity: 1,
        damagedQuantity: 0,
        quarantinedQuantity: 0,
        inventoryHealth: 'Normal',
      },
    ],
    transactions: [],
    audits: [],
  };
  const auditControl = { failNext: false };

  function restore(snapshot) {
    for (const key of Object.keys(state)) {
      if (Array.isArray(state[key])) state[key].splice(0, state[key].length, ...snapshot[key]);
      else state[key] = snapshot[key];
    }
  }

  const repository = {
    async findStockExportById(id) {
      return id === state.request._id ? state.request : null;
    },
    async claimExportProcessing(id, commandKey, userId, note, staleBefore, startedAt) {
      const staleProcessing = state.request.status === 'Processing'
        && (
          !state.request.processingStartedAt
          || new Date(state.request.processingStartedAt) <= new Date(staleBefore)
        );
      if (
        id !== state.request._id
        || (!['Pending', 'Failed'].includes(state.request.status) && !staleProcessing)
      ) return null;
      Object.assign(state.request, {
        status: 'Processing',
        processingCommandKey: commandKey,
        processingStartedAt: startedAt,
        processedBy: userId,
        note,
        failureCode: '',
        failureReason: '',
      });
      return state.request;
    },
    async completeExport(id, commandKey, completedAt) {
      if (
        id !== state.request._id
        || state.request.status !== 'Processing'
        || state.request.processingCommandKey !== commandKey
      ) return null;
      Object.assign(state.request, {
        status: 'Completed',
        completedCommandKey: commandKey,
        completedAt,
      });
      return state.request;
    },
    async updateCycle(id, patch) {
      if (id !== state.cycle._id) return null;
      Object.assign(state.cycle, patch);
      return state.cycle;
    },
    async findCycleById(id) {
      return id === state.cycle._id ? state.cycle : null;
    },
    async failExport(id, commandKey, failureCode, failureReason) {
      if (
        id !== state.request._id
        || state.request.status !== 'Processing'
        || state.request.processingCommandKey !== commandKey
      ) return null;
      Object.assign(state.request, { status: 'Failed', failureCode, failureReason });
      return state.request;
    },
    async findOrderById() {
      return state.order;
    },
    async listOrderDetails() {
      return state.details;
    },
    async claimOrderReservationConsumption(orderId, orderDetailId) {
      const reservation = state.reservations.find(
        (entry) => entry.orderId === orderId
          && entry.orderDetailId === orderDetailId
          && entry.status === 'Reserved',
      );
      if (!reservation) return null;
      reservation.status = 'Consumed';
      return reservation;
    },
    async findInventoryByProductId(productId) {
      return state.inventories.find((entry) => entry.productId === productId) || null;
    },
    async captureReservation(productId, quantity, userId) {
      const inventory = state.inventories.find(
        (entry) => entry.productId === productId
          && entry.inventoryHealth !== 'ReconciliationRequired'
          && entry.sellableQuantity >= quantity
          && entry.reservedQuantity >= quantity,
      );
      if (!inventory) return null;
      inventory.sellableQuantity -= quantity;
      inventory.stockQuantity -= quantity;
      inventory.reservedQuantity -= quantity;
      inventory.lastUpdatedBy = userId;
      return inventory;
    },
    async createTransaction(data) {
      if (failMovementFor && String(data.movementKey).includes(failMovementFor)) {
        throw new Error('injected movement write failure');
      }
      const transaction = { _id: `tx-${state.transactions.length + 1}`, ...data };
      state.transactions.push(transaction);
      return transaction;
    },
  };

  const transactionManager = {
    async withTransaction(work) {
      const snapshot = structuredClone(state);
      try {
        return await work({ id: 'session' });
      } catch (error) {
        restore(snapshot);
        throw error;
      }
    },
  };

  const service = createInventoryService({
    repository,
    transactionManager,
    auditLogger: {
      async log(entry) {
        if (auditControl.failNext) {
          auditControl.failNext = false;
          throw new Error('injected export audit write failure');
        }
        state.audits.push(structuredClone(entry));
      },
    },
    eventPublisher: null,
    lowStockLifecycle: { async evaluate() {} },
    assignmentCoordinator: { async coordinate() {} },
  });
  return { service, state, auditControl };
}

describe('SL-004 exact stock export behavior', () => {
  it('AT-059 consumes every exact reservation and emits one movement per line while Order stays Confirmed', async () => {
    const { service, state } = createHarness();
    assert.equal(typeof service.processStockExport, 'function');

    const result = await service.processStockExport('warehouse-1', 'export-1', {
      idempotencyKey: 'export-command-0001',
      note: 'Exact physical export',
    });

    assert.equal(result.stockExport.status, 'Completed');
    assert.equal(result.order.orderStatus, 'Confirmed');
    assert.equal(state.cycle.status, 'Exported');
    assert.deepEqual(state.inventories.map((entry) => [entry.sellableQuantity, entry.reservedQuantity]), [[8, 0], [4, 0]]);
    assert.deepEqual(state.reservations.map((entry) => entry.status), ['Consumed', 'Consumed']);
    assert.deepEqual(
      state.transactions.map((entry) => entry.movementKey),
      ['stock-export:export-1:detail-1', 'stock-export:export-1:detail-2'],
    );
  });

  it('AT-060 returns the Completed result on replay without another stock or movement effect', async () => {
    const { service, state } = createHarness();
    assert.equal(typeof service.processStockExport, 'function');
    const input = { idempotencyKey: 'export-command-0002' };

    await service.processStockExport('warehouse-1', 'export-1', input);
    const snapshot = structuredClone(state);
    const replay = await service.processStockExport('warehouse-2', 'export-1', input);

    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.stockExport.status, 'Completed');
    assert.deepEqual(state.inventories, snapshot.inventories);
    assert.deepEqual(state.transactions, snapshot.transactions);
  });

  it('AT-230 replays a completed Warehouse export without another movement for a different key', async () => {
    const { service, state } = createHarness();
    await service.processStockExport('warehouse-1', 'export-1', {
      idempotencyKey: 'export-001',
    });
    const before = structuredClone({
      inventories: state.inventories,
      reservations: state.reservations,
      transactions: state.transactions,
    });

    const replay = await service.processStockExport('warehouse-2', 'export-1', {
      idempotencyKey: 'export-002',
    });

    assert.equal(replay.idempotentReplay, true);
    assert.deepEqual(state.inventories, before.inventories);
    assert.deepEqual(state.reservations, before.reservations);
    assert.deepEqual(state.transactions, before.transactions);
  });

  it('AT-061 rolls back an injected later-line failure and persists only a retryable Failed outcome', async () => {
    const { service, state } = createHarness({ failMovementFor: 'detail-2' });
    assert.equal(typeof service.processStockExport, 'function');

    await assert.rejects(
      service.processStockExport('warehouse-1', 'export-1', {
        idempotencyKey: 'export-command-0003',
      }),
      /injected movement write failure/,
    );

    assert.equal(state.request.status, 'Failed');
    assert.equal(state.order.orderStatus, 'Confirmed');
    assert.deepEqual(state.inventories.map((entry) => [entry.sellableQuantity, entry.reservedQuantity]), [[10, 2], [5, 1]]);
    assert.deepEqual(state.reservations.map((entry) => entry.status), ['Reserved', 'Reserved']);
    assert.equal(state.transactions.length, 0);
  });

  it('AT-061 blocks ReconciliationRequired Inventory before consuming any reservation', async () => {
    const { service, state } = createHarness({ reconciliationRequired: true });
    assert.equal(typeof service.processStockExport, 'function');

    await assert.rejects(
      service.processStockExport('warehouse-1', 'export-1', {
        idempotencyKey: 'export-command-0004',
      }),
      /reconciliation/i,
    );

    assert.equal(state.request.status, 'Failed');
    assert.deepEqual(state.reservations.map((entry) => entry.status), ['Reserved', 'Reserved']);
    assert.equal(state.transactions.length, 0);
  });

  it('P1 processes a separately identified resend export while the same Order remains Shipped', async () => {
    const { service, state } = createHarness({
      requestKind: 'Resend',
      orderStatus: 'Shipped',
      cycleType: 'Resend',
    });

    const result = await service.processStockExport('warehouse-1', 'export-1', {
      idempotencyKey: 'resend-export-command-0001',
    });

    assert.equal(result.stockExport.status, 'Completed');
    assert.equal(state.cycle.status, 'Exported');
    assert.equal(state.order.orderStatus, 'Shipped');
    assert.deepEqual(state.reservations.map((entry) => entry.status), ['Consumed', 'Consumed']);
    assert.equal(state.transactions.length, 2);
  });

  it('P1 safely reclaims a stale Processing export lease without duplicating stock movements', async () => {
    const { service, state } = createHarness({
      requestStatus: 'Processing',
      processingStartedAt: new Date('2026-07-23T06:00:00.000Z'),
    });
    state.request.processingCommandKey = 'crashed-export-command';

    const result = await service.processStockExport('warehouse-1', 'export-1', {
      idempotencyKey: 'recovered-export-command',
    });

    assert.equal(result.stockExport.status, 'Completed');
    assert.deepEqual(state.reservations.map((entry) => entry.status), ['Consumed', 'Consumed']);
    assert.equal(state.transactions.length, 2);

    const replay = await service.processStockExport('warehouse-1', 'export-1', {
      idempotencyKey: 'recovered-export-command',
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(state.transactions.length, 2);
  });

  it('P1 rolls back Completed export stock and movements when its in-transaction Audit write fails, and does not audit a replay twice', async () => {
    const failed = createHarness();
    failed.auditControl.failNext = true;
    await assert.rejects(
      failed.service.processStockExport('warehouse-1', 'export-1', {
        idempotencyKey: 'export-audit-rollback',
      }),
      /injected export audit write failure/,
    );
    assert.equal(failed.state.request.status, 'Failed');
    assert.equal(failed.state.cycle.status, 'AwaitingExport');
    assert.deepEqual(
      failed.state.inventories.map((entry) => [entry.sellableQuantity, entry.reservedQuantity]),
      [[10, 2], [5, 1]],
    );
    assert.deepEqual(failed.state.reservations.map((entry) => entry.status), ['Reserved', 'Reserved']);
    assert.equal(failed.state.transactions.length, 0);
    assert.equal(failed.state.audits.length, 0);

    const replay = createHarness();
    const input = { idempotencyKey: 'export-audit-replay' };
    await replay.service.processStockExport('warehouse-1', 'export-1', input);
    const replayed = await replay.service.processStockExport('warehouse-1', 'export-1', input);
    assert.equal(replayed.idempotentReplay, true);
    assert.equal(replay.state.audits.length, 1);
  });
});
