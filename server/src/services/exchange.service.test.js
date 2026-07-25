const assert = require('node:assert/strict');
const { beforeEach, describe, it } = require('node:test');

const { createExchangeService } = require('./exchange.service');

const DAY = 24 * 60 * 60 * 1000;

function makeHarness() {
  const now = new Date('2026-07-23T10:00:00.000Z');
  const state = {
    orders: [{
      _id: 'order-1',
      orderCode: 'GH-EX-001',
      customerId: 'customer-1',
      paymentMethod: 'ONLINE',
      paymentStatus: 'Paid',
      orderStatus: 'Delivered',
      deliveredAt: new Date(now.getTime() - 5 * DAY),
      exchangeDeadlineAt: new Date(now),
      returnDeadlineAt: new Date(now),
    }],
    details: [
      {
        _id: 'line-1', orderId: 'order-1', productId: 'product-1',
        productNameSnapshot: 'Bình giữ nhiệt', productSkuSnapshot: 'SKU-001',
        productImageSnapshot: '', unitSnapshot: 'cái', quantity: 3,
      },
      {
        _id: 'line-2', orderId: 'order-1', productId: 'product-2',
        productNameSnapshot: 'Túi vải', productSkuSnapshot: 'SKU-002',
        productImageSnapshot: '', unitSnapshot: 'cái', quantity: 1,
      },
    ],
    inventories: [
      { productId: 'product-1', stockQuantity: 2, reservedQuantity: 0, damagedQuantity: 0 },
      { productId: 'product-2', stockQuantity: 1, reservedQuantity: 0, damagedQuantity: 0 },
    ],
    products: [
      { _id: 'product-1', sku: 'SKU-001', stockQuantity: 2 },
      { _id: 'product-2', sku: 'SKU-002', stockQuantity: 1 },
    ],
    locks: [],
    cases: [],
    lines: [],
    units: [],
    reservations: [],
    inspections: [],
    shipments: [],
    shipmentEvents: [],
    customerDeliveryReceipts: [{
      _id: 'customer-receipt-1',
      orderId: 'order-1',
      customerId: 'customer-1',
      outcome: 'RECEIVED',
      respondedAt: new Date(now.getTime() - DAY),
      exchangeDeadlineAt: new Date(now),
      returnDeadlineAt: new Date(now),
    }],
    conversions: [],
    inventoryTransactions: [],
    notifications: [],
    audits: [],
  };

  const repository = {
    state,
    snapshot: () => structuredClone(state),
    restore(snapshot) { Object.keys(snapshot).forEach((key) => { state[key] = snapshot[key]; }); },
    async findOrderById(id) { return state.orders.find((item) => item._id === id) || null; },
    async findLatestCustomerDeliveryReceiptByOrder(orderId) {
      return state.customerDeliveryReceipts
        .filter((item) => item.orderId === orderId)
        .sort((left, right) => new Date(right.respondedAt) - new Date(left.respondedAt))[0] || null;
    },
    async ensureExchangeDeadline(id, value) {
      const order = state.orders.find((item) => item._id === id);
      order.exchangeDeadlineAt ||= value;
      return order;
    },
    async listOrderDetails(orderId) { return state.details.filter((item) => item.orderId === orderId); },
    async findCaseById(id) { return state.cases.find((item) => item._id === id) || null; },
    async findCaseByIdempotency(customerId, key) {
      return state.cases.find((item) => item.customerId === customerId && item.idempotencyKey === key) || null;
    },
    async listCases(filter = {}) {
      return state.cases.filter((item) => !filter.customerId || item.customerId === filter.customerId);
    },
    async listLines(caseId) { return state.lines.filter((item) => item.exchangeCaseId === caseId); },
    async listUnits(caseId) { return state.units.filter((item) => item.exchangeCaseId === caseId); },
    async findUnitsByIds(ids) { return state.units.filter((item) => ids.includes(item._id)); },
    async listReservations(caseId) { return state.reservations.filter((item) => item.exchangeCaseId === caseId); },
    async listInspections(caseId) { return state.inspections.filter((item) => item.exchangeCaseId === caseId); },
    async listShipments(caseId) { return state.shipments.filter((item) => item.exchangeCaseId === caseId); },
    async listShipmentEvents(caseId) { return state.shipmentEvents.filter((item) => item.exchangeCaseId === caseId); },
    async claimOrderLock(data) {
      const existing = state.locks.find((item) => item.orderId === data.orderId && item.status === 'Active');
      if (existing) return null;
      const lock = { _id: `lock-${state.locks.length + 1}`, ...data, status: 'Active' };
      state.locks.push(lock);
      return lock;
    },
    async releaseOrderLock(orderId, caseId, terminalStatus, closePermanently = false) {
      const lock = state.locks.find((item) => item.orderId === orderId && item.caseId === caseId && item.status === 'Active');
      if (!lock) return null;
      Object.assign(lock, { status: closePermanently ? 'ClosedPermanently' : 'Released', terminalStatus });
      return lock;
    },
    async findOrderLock(orderId) {
      return state.locks.find((item) => (
        item.orderId === orderId && ['Active', 'ClosedPermanently'].includes(item.status)
      )) || null;
    },
    async createCase(data) {
      const item = { _id: `exchange-${state.cases.length + 1}`, ...data };
      state.cases.push(item);
      return item;
    },
    async createLines(items) {
      const offset = state.lines.length;
      const created = items.map((item, index) => ({ _id: `exchange-line-${offset + index + 1}`, ...item }));
      state.lines.push(...created);
      return created;
    },
    async createUnits(items) {
      const offset = state.units.length;
      const created = items.map((item, index) => ({ _id: `unit-${offset + index + 1}`, ...item }));
      state.units.push(...created);
      return created;
    },
    async updateCase(id, data) {
      const item = state.cases.find((entry) => entry._id === id);
      if (!item) return null;
      Object.assign(item, data);
      return item;
    },
    async claimCase(id, statuses, data) {
      const item = state.cases.find((entry) => entry._id === id && statuses.includes(entry.status));
      if (!item) return null;
      Object.assign(item, data);
      return item;
    },
    async touchShipmentOutcome(id, statuses) {
      const item = state.cases.find((entry) => entry._id === id && statuses.includes(entry.status));
      if (!item) return null;
      item.shipmentOutcomeVersion = Number(item.shipmentOutcomeVersion || 0) + 1;
      return item;
    },
    async updateLine(id, data) {
      const item = state.lines.find((entry) => entry._id === id);
      if (!item) return null;
      Object.assign(item, data);
      return item;
    },
    async findInventory(productId) {
      return state.inventories.find((item) => item.productId === productId) || null;
    },
    async reserveInventory(productId, quantity) {
      const item = state.inventories.find((entry) => entry.productId === productId);
      if (!item || item.stockQuantity - item.reservedQuantity < quantity) return null;
      item.reservedQuantity += quantity;
      return item;
    },
    async releaseInventory(productId, quantity) {
      const item = state.inventories.find((entry) => entry.productId === productId);
      if (!item || item.reservedQuantity < quantity) return null;
      item.reservedQuantity -= quantity;
      return item;
    },
    async consumeInventory(productId, quantity) {
      const item = state.inventories.find((entry) => entry.productId === productId);
      if (!item || item.reservedQuantity < quantity || item.stockQuantity < quantity) return null;
      item.reservedQuantity -= quantity;
      item.stockQuantity -= quantity;
      const product = state.products.find((entry) => entry._id === productId);
      product.stockQuantity = item.stockQuantity;
      return item;
    },
    async receiveInventory(productId, sellable, damaged) {
      const item = state.inventories.find((entry) => entry.productId === productId);
      item.stockQuantity += sellable;
      item.damagedQuantity += damaged;
      const product = state.products.find((entry) => entry._id === productId);
      product.stockQuantity = item.stockQuantity;
      return item;
    },
    async createReservations(items) {
      const created = items.map((item) => ({ _id: `reservation-${state.reservations.length + 1}`, status: 'Reserved', ...item }));
      state.reservations.push(...created);
      return created;
    },
    async updateReservation(id, data) {
      const item = state.reservations.find((entry) => entry._id === id);
      Object.assign(item, data);
      return item;
    },
    async createInspections(items) {
      const created = items.map((item) => ({ _id: `inspection-${state.inspections.length + 1}`, ...item }));
      state.inspections.push(...created);
      return created;
    },
    async createInventoryTransaction(data) {
      if (state.inventoryTransactions.some((item) => item.movementKey === data.movementKey)) {
        const error = new Error('duplicate');
        error.code = 11000;
        throw error;
      }
      const item = { _id: `movement-${state.inventoryTransactions.length + 1}`, ...data };
      state.inventoryTransactions.push(item);
      return item;
    },
    async createShipment(data) {
      const item = { _id: `shipment-${state.shipments.length + 1}`, status: 'InTransit', ...data };
      state.shipments.push(item);
      return item;
    },
    async findShipmentByKey(shipmentKey) { return state.shipments.find((item) => item.shipmentKey === shipmentKey) || null; },
    async findShipmentById(id) { return state.shipments.find((item) => item._id === id) || null; },
    async updateShipment(id, data) {
      const item = state.shipments.find((entry) => entry._id === id);
      Object.assign(item, data);
      return item;
    },
    async claimShipmentOutcome(id, allowedStatus, data) {
      const item = state.shipments.find((entry) => entry._id === id && entry.status === allowedStatus);
      if (!item) return null;
      Object.assign(item, data);
      return item;
    },
    async findShipmentEventByKey(key) { return state.shipmentEvents.find((item) => item.eventKey === key) || null; },
    async findShipmentEventById(id) { return state.shipmentEvents.find((item) => item._id === id) || null; },
    async createShipmentEvent(data) {
      const item = { _id: `shipment-event-${state.shipmentEvents.length + 1}`, ...data };
      state.shipmentEvents.push(item);
      return item;
    },
    async updateUnitsForInspection(caseId, lineId, {
      sellableQuantity,
      damagedQuantity,
      sellableMovementKey,
      damagedMovementKey,
    }) {
      const units = state.units
        .filter((item) => item.exchangeCaseId === caseId && item.exchangeLineId === lineId)
        .sort((left, right) => left.originalUnitOrdinal - right.originalUnitOrdinal);
      units.forEach((unit, index) => {
        const isSellable = index < sellableQuantity;
        const isDamaged = index >= sellableQuantity && index < sellableQuantity + damagedQuantity;
        Object.assign(unit, {
          outcome: isSellable || isDamaged ? 'Accepted' : 'Rejected',
          inventoryMovementKeys: isSellable ? [sellableMovementKey] : isDamaged ? [damagedMovementKey] : [],
        });
      });
    },
    async updateDeliveredUnits(caseId, lineId, quantity, deliveredAt, deadlineAt) {
      const units = state.units.filter((item) => (
        item.exchangeCaseId === caseId && item.exchangeLineId === lineId && item.outcome === 'Accepted'
      )).slice(0, quantity);
      units.forEach((unit) => Object.assign(unit, {
        outcome: 'ReplacementDelivered',
        replacementDeliveredAt: deliveredAt,
        exchangeDeadlineAt: deadlineAt,
      }));
      return units;
    },
    async listClaimedOriginalUnitOrdinals(orderId, orderDetailId) {
      return state.units
        .filter((item) => item.orderId === orderId
          && item.orderDetailId === orderDetailId
          && item.exclusivePhysicalClaimKey
          && !item.parentUnitId)
        .map((item) => Number(item.originalUnitOrdinal));
    },
    async listClaimedReplacementParentIds(orderId) {
      return state.units
        .filter((item) => item.orderId === orderId
          && item.parentUnitId
          && item.exclusivePhysicalClaimKey)
        .map((item) => String(item.parentUnitId));
    },
    async releaseUnitClaims(caseId) {
      const units = state.units.filter((item) => item.exchangeCaseId === caseId);
      units.forEach((unit) => { delete unit.exclusivePhysicalClaimKey; });
      return units.length;
    },
  };

  let transactionQueue = Promise.resolve();
  const transactionManager = {
    async withTransaction(work) {
      const previous = transactionQueue;
      let release;
      transactionQueue = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = repository.snapshot();
      try {
        return await work({});
      } catch (error) {
        repository.restore(snapshot);
        throw error;
      } finally {
        release();
      }
    },
  };

  const createService = (overrides = {}) => createExchangeService({
    repository,
    transactionManager: overrides.transactionManager || transactionManager,
    evidenceVerifier: (_customerId, items) => items,
    auditLogger: overrides.auditLogger || { log: async () => {} },
    notifier: overrides.notifier || { notify: async (data) => { state.notifications.push(data); } },
    assignmentCoordinator: overrides.assignmentCoordinator || { async coordinate() {} },
    clock: () => new Date(now),
  });
  const service = createService();
  return {
    service, createService, repository, transactionManager, state, now,
  };
}

function validRequest(overrides = {}) {
  return {
    orderId: 'order-1',
    idempotencyKey: 'exchange-submit-0001',
    reason: 'Sản phẩm bị lỗi',
    evidenceImages: ['/api/exchanges/evidence/evidence-1.jpg'],
    lines: [{ orderDetailId: 'line-1', quantity: 2 }],
    ...overrides,
  };
}

async function captureError(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  assert.fail('Expected operation to reject');
}

async function prepareInspectedExchange(harness, suffix = 'prepared') {
  const request = await harness.service.createCustomerRequest('customer-1', validRequest({
    idempotencyKey: `exchange-${suffix}-0001`,
  }));
  await harness.service.decideRequest('staff-1', request.id, {
    idempotencyKey: `decision-${suffix}-0001`,
    decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
  });
  await harness.service.recordHandoffProof('customer-1', request.id, {
    idempotencyKey: `handoff-${suffix}-0001`,
    proofReference: `TRACK-IN-${suffix}`,
    handoffAt: harness.now,
  });
  await harness.service.recordWarehouseReceipt('warehouse-1', request.id, {
    idempotencyKey: `receipt-${suffix}-0001`,
    receivedAt: harness.now,
    evidenceReference: `RECEIPT-${suffix}`,
  });
  await harness.service.finalizeInspection('warehouse-1', request.id, {
    idempotencyKey: `inspection-${suffix}-0001`,
    lines: [{
      exchangeLineId: harness.state.lines.find((line) => line.exchangeCaseId === request.id)._id,
      receivedQuantity: 2,
      acceptedSellableQuantity: 0,
      acceptedDamagedQuantity: 2,
      rejectedQuantity: 0,
      inspectionReason: 'Đã kiểm đủ, hàng lỗi kỹ thuật',
      evidenceImages: ['/api/exchanges/evidence/warehouse-prepared.jpg'],
    }],
  });
  return request;
}

async function assertIncidentStockChoiceActionsDenied(harness, requestId, suffix) {
  const before = structuredClone(harness.state);
  await assert.rejects(
    harness.service.chooseStockOption('customer-1', requestId, {
      idempotencyKey: `${suffix}-wait-0001`,
      choice: 'WAIT',
    }),
    /exact.stock|stock failure|not waiting/i
  );
  await assert.rejects(
    harness.service.chooseStockOption('customer-1', requestId, {
      idempotencyKey: `${suffix}-convert-0001`,
      choice: 'CONVERT_TO_RETURN',
    }),
    /exact.stock|stock failure|not waiting/i
  );
  await assert.rejects(
    harness.service.convertToReturn('customer-1', requestId, {
      idempotencyKey: `${suffix}-direct-convert-0001`,
    }),
    /exact.stock|stock failure|cannot convert/i
  );
  assert.deepEqual(harness.state, before);
}

describe('SL-002 Exchange service', () => {
  let harness;

  beforeEach(() => { harness = makeHarness(); });

  it('does not assign Exchange after a passed Staff request loses its role', async () => {
    const request = await harness.service.createCustomerRequest(
      'customer-1',
      validRequest({ idempotencyKey: 'exchange-role-race-0001' }),
    );
    const guarded = harness.createService({
      assignmentCoordinator: {
        async coordinate({ userId, expectedRole, session }) {
          assert.equal(userId, 'staff-1');
          assert.equal(expectedRole, 'Staff');
          assert.ok(session);
          const error = new Error('role changed after middleware');
          error.errorCode = 'ASSIGNMENT_ACTOR_STALE';
          throw error;
        },
      },
    });

    await assert.rejects(
      () => guarded.decideRequest('staff-1', request.id, {
        idempotencyKey: 'exchange-decision-role-race-0001',
        decision: 'APPROVE',
        responsibility: 'SHOP_FAULT',
        reason: 'Shop fault',
      }),
      (error) => error.errorCode === 'ASSIGNMENT_ACTOR_STALE',
    );
    assert.equal(harness.state.cases[0].status, 'Submitted');
    assert.equal(harness.state.cases[0].decidedBy, undefined);
  });

  it('accepts an owned Delivered order exactly at the inclusive deadline and replays once', async () => {
    const first = await harness.service.createCustomerRequest('customer-1', validRequest());
    const second = await harness.service.createCustomerRequest('customer-1', validRequest());
    assert.equal(first.status, 'Submitted');
    assert.equal(second.id, first.id);
    assert.equal(second.idempotentReplay, true);
    assert.equal(harness.state.cases.length, 1);
    assert.equal(harness.state.lines[0].requestedQuantity, 2);
  });

  it('requires Customer receipt and blocks an active non-receipt dispute at the direct Exchange boundary', async () => {
    harness.state.customerDeliveryReceipts = [];
    const awaiting = await captureError(
      () => harness.service.createCustomerRequest('customer-1', validRequest()),
    );
    assert.equal(awaiting.errorCode, 'AFTER_SALES_DELIVERY_CONFIRMATION_REQUIRED');
    assert.equal(harness.state.cases.length, 0);

    harness.state.customerDeliveryReceipts.push({
      _id: 'customer-receipt-dispute',
      orderId: 'order-1',
      customerId: 'customer-1',
      outcome: 'NOT_RECEIVED',
      respondedAt: new Date(harness.now.getTime() - DAY),
    });
    const disputed = await captureError(
      () => harness.service.createCustomerRequest('customer-1', validRequest()),
    );
    assert.equal(disputed.errorCode, 'AFTER_SALES_DELIVERY_DISPUTED');
    assert.equal(harness.state.cases.length, 0);
  });

  it('uses only the immutable Customer receipt Exchange deadline', async () => {
    harness.state.orders[0].deliveredAt = new Date(harness.now);
    harness.state.orders[0].exchangeDeadlineAt = new Date(harness.now.getTime() + 30 * DAY);
    harness.state.customerDeliveryReceipts[0].exchangeDeadlineAt = new Date(
      harness.now.getTime() - 1,
    );

    await assert.rejects(
      () => harness.service.createCustomerRequest('customer-1', validRequest()),
      /five-day Exchange window has expired/i,
    );
    assert.equal(harness.state.cases.length, 0);
  });

  it('rejects reuse of a submit idempotency key for a different Exchange command', async () => {
    await harness.service.createCustomerRequest('customer-1', validRequest());
    await assert.rejects(
      harness.service.createCustomerRequest('customer-1', validRequest({
        reason: 'Một lý do khác không thuộc lần gửi đầu',
      })),
      /idempotency key.*different|different.*command/i
    );
    assert.equal(harness.state.cases.length, 1);
  });

  it('rejects foreign, fractional, excessive, and free-form/money input', async () => {
    await assert.rejects(
      harness.service.createCustomerRequest('customer-2', validRequest()),
      /not found/i
    );
    await assert.rejects(
      harness.service.createCustomerRequest('customer-1', validRequest({ lines: [{ orderDetailId: 'line-1', quantity: 1.5 }] })),
      /integer/i
    );
    await assert.rejects(
      harness.service.createCustomerRequest('customer-1', validRequest({ lines: [{ orderDetailId: 'line-1', quantity: 4 }] })),
      /purchased quantity/i
    );
    await assert.rejects(
      harness.service.createCustomerRequest('customer-1', validRequest({ refundAmount: 10 })),
      /not allowed/i
    );
  });

  it('creates a COD reconciliation hold without approval, reservation, or deadline', async () => {
    Object.assign(harness.state.orders[0], {
      paymentMethod: 'COD', paymentStatus: 'Unpaid', codDiscrepancyStatus: 'Open',
    });
    const result = await harness.service.createCustomerRequest('customer-1', validRequest());
    assert.equal(result.status, 'AwaitingCODReconciliation');
    assert.equal(result.approvedAt, null);
    assert.equal(result.shipByAt, null);
    assert.equal(harness.state.reservations.length, 0);
  });

  it('allows a delivered replacement unit to start a new traced cycle without reopening the original deadline', async () => {
    harness.state.orders[0].exchangeDeadlineAt = new Date(harness.now.getTime() - 1);
    harness.state.customerDeliveryReceipts[0].exchangeDeadlineAt = new Date(
      harness.now.getTime() - 1,
    );
    harness.state.units.push({
      _id: 'replacement-unit-1',
      unitKey: 'prior-case:line-1:1',
      exchangeCaseId: 'prior-case',
      exchangeLineId: 'prior-line',
      orderId: 'order-1',
      orderDetailId: 'line-1',
      productId: 'product-1',
      originalUnitOrdinal: 2,
      cycle: 1,
      outcome: 'ReplacementDelivered',
      replacementDeliveredAt: new Date(harness.now.getTime() - DAY),
      exchangeDeadlineAt: new Date(harness.now.getTime() + DAY),
    });

    const result = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-replacement-cycle-0001',
      lines: undefined,
      replacementUnitIds: ['replacement-unit-1'],
    }));

    assert.equal(result.status, 'Submitted');
    const createdUnit = harness.state.units.find((unit) => unit.exchangeCaseId === result.id);
    assert.equal(createdUnit.parentUnitId, 'replacement-unit-1');
    assert.equal(createdUnit.cycle, 2);
    assert.equal(createdUnit.originalUnitOrdinal, 2);
  });

  it('blocks a replacement cycle when any selected replacement unit deadline expired', async () => {
    harness.state.customerDeliveryReceipts[0].exchangeDeadlineAt = new Date(
      harness.now.getTime() - DAY,
    );
    harness.state.units.push(
      {
        _id: 'replacement-unit-current',
        orderId: 'order-1',
        orderDetailId: 'line-1',
        productId: 'product-1',
        originalUnitOrdinal: 1,
        cycle: 1,
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: new Date(harness.now.getTime() + DAY),
      },
      {
        _id: 'replacement-unit-expired',
        orderId: 'order-1',
        orderDetailId: 'line-1',
        productId: 'product-1',
        originalUnitOrdinal: 2,
        cycle: 1,
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: new Date(harness.now.getTime() - 1),
      },
    );

    await assert.rejects(
      () => harness.service.createCustomerRequest('customer-1', validRequest({
        idempotencyKey: 'exchange-replacement-expired-unit-0001',
        lines: undefined,
        replacementUnitIds: ['replacement-unit-current', 'replacement-unit-expired'],
      })),
      /replacement unit Exchange window has expired/i,
    );
    assert.equal(harness.state.cases.length, 0);
  });

  it('blocks a second after-sales case through the shared order lock', async () => {
    harness.state.returnRequests = [{
      _id: 'return-1',
      orderId: 'order-1',
      customerId: 'customer-1',
      status: 'Approved',
      reason: 'must stay private',
      evidenceImages: ['private.jpg'],
      refundAmount: 999999,
      bankAccount: 'private',
    }];
    harness.repository.findReturnRequestById = async (id) => (
      harness.state.returnRequests.find((item) => item._id === id) || null
    );
    await harness.repository.claimOrderLock({
      orderId: 'order-1', caseType: 'RETURN_REFUND', caseId: 'return-1',
    });

    const error = await captureError(() => (
      harness.service.createCustomerRequest('customer-1', validRequest())
    ));
    assert.equal(error.statusCode, 409);
    assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.equal(error.message, 'This Order already has an active after-sales case');
    assert.deepEqual(error.data, {
      currentCase: { type: 'RETURN_REFUND', id: 'return-1', status: 'Approved' },
      action: { label: 'Xem yêu cầu đang xử lý', href: '/return-refunds' },
    });
    assert.doesNotMatch(JSON.stringify(error.data), /reason|evidence|note|lock|cod|bank|payout|money|amount/i);
    assert.equal(harness.state.cases.length, 0);
  });

  it('returns data null for a corrupt or foreign active lock', async () => {
    harness.state.cases.push({
      _id: 'exchange-foreign',
      orderId: 'order-1',
      customerId: 'customer-foreign',
      status: 'Submitted',
      reason: 'private',
    });
    harness.state.locks.push({
      _id: 'lock-foreign',
      orderId: 'order-1',
      caseType: 'EXCHANGE',
      caseId: 'exchange-foreign',
      status: 'Active',
      secretNote: 'private',
    });

    const error = await captureError(() => (
      harness.service.createCustomerRequest('customer-1', validRequest())
    ));
    assert.equal(error.statusCode, 409);
    assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.equal(error.message, 'This Order already has an active after-sales case');
    assert.equal(error.data, null);
  });

  it('maps an E11000 winner race to the same owner-safe typed conflict', async () => {
    const originalCreateCase = harness.repository.createCase;
    harness.repository.createCase = async () => {
      harness.state.cases.push({
        _id: 'exchange-winner',
        orderId: 'order-1',
        customerId: 'customer-1',
        status: 'Submitted',
        reason: 'private winner reason',
        evidenceImages: ['private-winner.jpg'],
      });
      harness.state.locks.push({
        _id: 'lock-winner',
        orderId: 'order-1',
        caseType: 'EXCHANGE',
        caseId: 'exchange-winner',
        status: 'Active',
      });
      const error = new Error('duplicate key winner');
      error.code = 11000;
      throw error;
    };

    const racingService = harness.createService({
      transactionManager: { async withTransaction(work) { return work({}); } },
    });
    const error = await captureError(() => (
      racingService.createCustomerRequest('customer-1', validRequest({
        idempotencyKey: 'exchange-loser-race-0001',
      }))
    ));
    harness.repository.createCase = originalCreateCase;

    assert.equal(error.statusCode, 409);
    assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.equal(error.message, 'This Order already has an active after-sales case');
    assert.deepEqual(error.data, {
      currentCase: { type: 'EXCHANGE', id: 'exchange-winner', status: 'Submitted' },
      action: { label: 'Xem yêu cầu đang xử lý', href: '/exchanges/exchange-winner' },
    });
    assert.doesNotMatch(JSON.stringify(error.data), /reason|evidence|note|lock|cod|bank|payout|money|amount/i);
  });

  it('does not misclassify a non-lock E11000 collision as an active after-sales case', async () => {
    const before = structuredClone(harness.state);
    harness.repository.createCase = async () => {
      const error = new Error('duplicate request code');
      error.code = 11000;
      error.keyPattern = { requestCode: 1 };
      error.keyValue = { requestCode: 'EX-DUPLICATE' };
      throw error;
    };

    const error = await captureError(() => (
      harness.service.createCustomerRequest('customer-1', validRequest({
        idempotencyKey: 'exchange-request-code-race-0001',
      }))
    ));

    assert.equal(error.statusCode, 409);
    assert.notEqual(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.match(error.message, /request code/i);
    assert.doesNotMatch(error.message, /physical unit/i);
    assert.doesNotMatch(error.message, /EX-DUPLICATE/i);
    assert.deepEqual(harness.state, before);
  });

  it('classifies physical-claim and unknown duplicate collisions without leaking key values', async () => {
    for (const scenario of [
      {
        keyPattern: { exclusivePhysicalClaimKey: 1 },
        keyValue: { exclusivePhysicalClaimKey: 'REPLACEMENT:secret-unit' },
        expected: /physical unit/i,
      },
      {
        keyPattern: { unknownInternalKey: 1 },
        keyValue: { unknownInternalKey: 'private-value' },
        expected: /duplicate command/i,
      },
      {
        keyPattern: { unitKey: 1 },
        keyValue: { unitKey: 'private-lineage-key' },
        expected: /unit lineage/i,
      },
    ]) {
      harness.repository.createCase = async () => {
        const error = new Error('duplicate key');
        error.code = 11000;
        error.keyPattern = scenario.keyPattern;
        error.keyValue = scenario.keyValue;
        throw error;
      };
      const error = await captureError(() => (
        harness.service.createCustomerRequest('customer-1', validRequest({
          idempotencyKey: `exchange-duplicate-${Object.keys(scenario.keyPattern)[0]}`,
        }))
      ));
      assert.equal(error.statusCode, 409);
      assert.notEqual(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
      assert.match(error.message, scenario.expected);
      assert.doesNotMatch(error.message, /secret-unit|private-value|private-lineage-key/i);
    }
  });

  it('marks only unclaimed delivered replacement units as eligible across multiple cycles', async () => {
    harness.state.units.push(
      {
        _id: 'replacement-cycle-1',
        orderId: 'order-1',
        orderDetailId: 'line-1',
        productId: 'product-1',
        exchangeCaseId: 'historic-case-1',
        parentUnitId: null,
        cycle: 1,
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: new Date(harness.now.getTime() + DAY),
      },
      {
        _id: 'replacement-cycle-2-active',
        orderId: 'order-1',
        orderDetailId: 'line-1',
        productId: 'product-1',
        exchangeCaseId: 'historic-case-2',
        parentUnitId: 'replacement-cycle-1',
        exclusivePhysicalClaimKey: 'REPLACEMENT:replacement-cycle-1',
        cycle: 2,
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: new Date(harness.now.getTime() + DAY),
      }
    );
    harness.state.cases.push(
      {
        _id: 'historic-case-1', orderId: 'order-1', customerId: 'customer-1',
        status: 'Completed', reason: 'historic', evidenceImages: [],
      },
      {
        _id: 'historic-case-2', orderId: 'order-1', customerId: 'customer-1',
        status: 'Completed', reason: 'historic', evidenceImages: [],
      }
    );

    const first = await harness.service.getCustomerRequest('customer-1', 'historic-case-1');
    const second = await harness.service.getCustomerRequest('customer-1', 'historic-case-2');

    assert.equal(first.units[0].eligibleForReplacementExchange, false);
    assert.equal(second.units[0].eligibleForReplacementExchange, true);
  });

  it('restores replacement eligibility after a later child claim is released', async () => {
    harness.state.units.push(
      {
        _id: 'replacement-parent-released',
        orderId: 'order-1',
        orderDetailId: 'line-1',
        productId: 'product-1',
        exchangeCaseId: 'historic-parent',
        parentUnitId: null,
        cycle: 1,
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: new Date(harness.now.getTime() + DAY),
      },
      {
        _id: 'replacement-child-released',
        orderId: 'order-1',
        orderDetailId: 'line-1',
        productId: 'product-1',
        exchangeCaseId: 'historic-child',
        parentUnitId: 'replacement-parent-released',
        cycle: 2,
        outcome: 'Pending',
      }
    );
    harness.state.cases.push({
      _id: 'historic-parent', orderId: 'order-1', customerId: 'customer-1',
      status: 'Completed', reason: 'historic', evidenceImages: [],
    });

    const result = await harness.service.getCustomerRequest('customer-1', 'historic-parent');

    assert.equal(result.units[0].eligibleForReplacementExchange, true);
  });

  it('keeps an expired released parent and a permanently closed Return barrier ineligible', async () => {
    harness.state.units.push(
      {
        _id: 'replacement-parent-expired',
        orderId: 'order-1',
        orderDetailId: 'line-1',
        productId: 'product-1',
        exchangeCaseId: 'historic-expired',
        parentUnitId: null,
        cycle: 1,
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: new Date(harness.now.getTime() - 1),
      },
      {
        _id: 'replacement-parent-return-barrier',
        orderId: 'order-1',
        orderDetailId: 'line-1',
        productId: 'product-1',
        exchangeCaseId: 'historic-barrier',
        parentUnitId: null,
        cycle: 1,
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: new Date(harness.now.getTime() + DAY),
      }
    );
    harness.state.cases.push(
      {
        _id: 'historic-expired', orderId: 'order-1', customerId: 'customer-1',
        status: 'Completed', reason: 'historic', evidenceImages: [],
      },
      {
        _id: 'historic-barrier', orderId: 'order-1', customerId: 'customer-1',
        status: 'Completed', reason: 'historic', evidenceImages: [],
      }
    );
    harness.state.locks.push({
      _id: 'return-closed-lock',
      orderId: 'order-1',
      caseType: 'RETURN_REFUND',
      caseId: 'return-completed',
      status: 'ClosedPermanently',
    });

    const expired = await harness.service.getCustomerRequest('customer-1', 'historic-expired');
    const blocked = await harness.service.getCustomerRequest('customer-1', 'historic-barrier');

    assert.equal(expired.units[0].eligibleForReplacementExchange, false);
    assert.equal(blocked.units[0].eligibleForReplacementExchange, false);
  });

  it('derives Shop payer and reserves every exact SKU atomically on approval', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest());
    const approved = await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-approve-0001',
      decision: 'APPROVE',
      responsibility: 'SHOP_FAULT',
      reason: 'Xác nhận lỗi từ Shop',
    });
    assert.equal(approved.status, 'ApprovedAwaitingShipment');
    assert.equal(approved.shippingPayer, 'SHOP');
    assert.equal(harness.state.inventories[0].reservedQuantity, 2);
    assert.equal(harness.state.reservations.length, 1);
    assert.equal(new Date(approved.shipByAt).getTime() - new Date(approved.approvedAt).getTime(), 3 * DAY);
    const replay = await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-approve-0001',
      decision: 'APPROVE',
      responsibility: 'SHOP_FAULT',
      reason: 'Xác nhận lỗi từ Shop',
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(harness.state.reservations.length, 1);
    await assert.rejects(
      harness.service.decideRequest('staff-1', request.id, {
        idempotencyKey: 'decision-approve-0001',
        decision: 'REJECT',
        reason: 'Tái dùng khóa cho quyết định khác',
      }),
      /idempotency key.*different|different.*decision/i
    );
  });

  it('rolls back rejection state and evidence when transactional audit fails, then retries exactly once', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-reject-atomic-0001',
    }));
    let failAudit = true;
    const atomicService = harness.createService({
      auditLogger: {
        async log(entry, session) {
          assert.ok(session);
          if (failAudit) throw new Error('audit unavailable');
          harness.state.audits.push(entry);
        },
      },
      notifier: {
        async notify(data, session) {
          assert.ok(session);
          harness.state.notifications.push(data);
        },
      },
    });
    const command = {
      idempotencyKey: 'decision-reject-atomic-0001',
      decision: 'REJECT',
      reason: 'Evidence is insufficient',
    };

    await assert.rejects(
      atomicService.decideRequest('staff-1', request.id, command),
      /audit unavailable/
    );
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'Submitted');
    assert.equal(harness.state.locks.find((item) => item.caseId === request.id).status, 'Active');
    assert.equal(harness.state.units.filter((item) => item.exchangeCaseId === request.id)
      .every((item) => item.exclusivePhysicalClaimKey), true);
    assert.equal(harness.state.audits.length, 0);
    assert.equal(harness.state.notifications.length, 0);

    failAudit = false;
    const rejected = await atomicService.decideRequest('staff-1', request.id, command);
    assert.equal(rejected.status, 'Rejected');
    assert.equal(harness.state.locks.find((item) => item.caseId === request.id).status, 'Released');
    assert.equal(harness.state.audits.filter((item) => item.action === 'EXCHANGE_REJECTED').length, 1);
    assert.equal(harness.state.notifications.filter((item) => item.type === 'EXCHANGE_REJECTED').length, 1);
    assert.equal(
      harness.state.audits.find((item) => item.action === 'EXCHANGE_REJECTED').eventId,
      `EXCHANGE_REJECTED:${request.id}`
    );

    const replay = await atomicService.decideRequest('staff-1', request.id, command);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(harness.state.audits.filter((item) => item.action === 'EXCHANGE_REJECTED').length, 1);
    assert.equal(harness.state.notifications.filter((item) => item.type === 'EXCHANGE_REJECTED').length, 1);
  });

  it('enters explicit no-stock choice without partial reservation or approval dates', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      lines: [
        { orderDetailId: 'line-1', quantity: 2 },
        { orderDetailId: 'line-2', quantity: 1 },
      ],
    }));
    harness.state.inventories[1].stockQuantity = 0;
    const result = await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-no-stock-0001',
      decision: 'APPROVE',
      responsibility: 'CUSTOMER_PREFERENCE',
      reason: 'Đủ điều kiện nhưng thiếu tồn kho',
    });
    assert.equal(result.status, 'AwaitingExactStockChoice');
    assert.equal(result.approvedAt, null);
    assert.equal(result.shipByAt, null);
    assert.equal(harness.state.inventories[0].reservedQuantity, 0);
    assert.equal(harness.state.reservations.length, 0);
  });

  it('releases reservations once when Customer cancels before handoff', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest());
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-cancel-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    const cancelled = await harness.service.cancelRequest('customer-1', request.id, {
      idempotencyKey: 'cancel-exchange-0001',
    });
    const replay = await harness.service.cancelRequest('customer-1', request.id, {
      idempotencyKey: 'cancel-exchange-0001',
    });
    assert.equal(cancelled.status, 'Cancelled');
    assert.equal(replay.idempotentReplay, true);
    assert.equal(harness.state.inventories[0].reservedQuantity, 0);
    assert.equal(harness.state.reservations[0].status, 'Released');
  });

  it('finalizes partial Warehouse acceptance atomically and keeps rejected units out of Inventory', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest());
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-partial-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    await harness.service.recordHandoffProof('customer-1', request.id, {
      idempotencyKey: 'handoff-exchange-0001',
      proofReference: 'GHN-TRACK-001',
      handoffAt: harness.now,
    });
    await harness.service.recordWarehouseReceipt('warehouse-1', request.id, {
      idempotencyKey: 'receipt-exchange-0001',
      receivedAt: harness.now,
      evidenceReference: 'warehouse-receipt-001',
    });
    const result = await harness.service.finalizeInspection('warehouse-1', request.id, {
      idempotencyKey: 'inspection-exchange-0001',
      lines: [{
        exchangeLineId: harness.state.lines[0]._id,
        receivedQuantity: 2,
        acceptedSellableQuantity: 1,
        acceptedDamagedQuantity: 0,
        rejectedQuantity: 1,
        inspectionReason: 'Một sản phẩm đúng lỗi, một sản phẩm không khớp',
        rejectionReason: 'Không đúng sản phẩm đã gửi',
        evidenceImages: ['/api/exchanges/evidence/warehouse-1.jpg'],
      }],
    });
    assert.equal(result.status, 'OutboundFulfillment');
    assert.equal(harness.state.inventories[0].stockQuantity, 3);
    assert.equal(harness.state.inventories[0].reservedQuantity, 1);
    assert.equal(harness.state.reservations[0].quantity, 1);
    assert.equal(harness.state.inventoryTransactions.length, 1);

    const line = harness.state.lines[0];
    const replacement = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-partial-replacement-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 1,
      carrierName: 'GHN',
      trackingCode: 'GHN-PARTIAL-REPLACEMENT',
      shippedAt: harness.now,
    });
    const rejectedOriginal = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-partial-rejected-0001',
      exchangeLineId: line._id,
      direction: 'REJECTED_ORIGINAL_TO_CUSTOMER',
      quantity: 1,
      carrierName: 'GHN',
      trackingCode: 'GHN-PARTIAL-REJECTED',
      shippedAt: harness.now,
    });
    const replacementDelivered = await harness.service.recordCarrierShipmentEvent(replacement.shipment._id, {
      eventId: 'carrier-partial-replacement-delivered',
      eventType: 'DELIVERED',
      occurredAt: harness.now,
      evidenceReference: 'proof-partial-replacement',
    });
    assert.notEqual(harness.state.cases.find((item) => item._id === request.id).status, 'Completed');
    const allDelivered = await harness.service.recordCarrierShipmentEvent(rejectedOriginal.shipment._id, {
      eventId: 'carrier-partial-rejected-delivered',
      eventType: 'DELIVERED',
      occurredAt: harness.now,
      evidenceReference: 'proof-partial-rejected',
    });
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'Completed');
    assert.equal(harness.state.notifications.filter((item) => item.type === 'EXCHANGE_COMPLETED').length, 1);
  });

  it('uses the exact outbound status and waitingFor matrix at the backend boundary', async () => {
    const allowed = [
      { status: 'OutboundFulfillment', waitingFor: '' },
      { status: 'ReplacementShipped', waitingFor: '' },
      { status: 'DeliveryIncident', waitingFor: '' },
      { status: 'DeliveryIncident', waitingFor: 'INCIDENT_RESEND' },
    ];
    for (const [index, scenario] of allowed.entries()) {
      const local = makeHarness();
      const request = await prepareInspectedExchange(local, `outbound-allowed-${index}`);
      const exchangeCase = local.state.cases.find((item) => item._id === request.id);
      Object.assign(exchangeCase, scenario);
      const line = local.state.lines.find((item) => item.exchangeCaseId === request.id);
      const result = await local.service.createOutboundShipment('warehouse-1', request.id, {
        idempotencyKey: `outbound-allowed-command-${index}`,
        exchangeLineId: line._id,
        direction: 'REPLACEMENT_TO_CUSTOMER',
        quantity: 2,
        carrierName: 'GHN',
        trackingCode: `OUTBOUND-ALLOWED-${index}`,
        shippedAt: local.now,
      });
      assert.equal(result.shipment.status, 'InTransit');
    }

    const blocked = [
      { status: 'OutboundFulfillment', waitingFor: 'REJECTED_ORIGINAL_RECONCILIATION' },
      { status: 'DeliveryIncident', waitingFor: 'INCIDENT_RESEND_IN_TRANSIT' },
      { status: 'AwaitingExactStockChoice', waitingFor: 'INCIDENT_RESEND' },
      { status: 'WaitingForExactStock', waitingFor: 'INCIDENT_RESEND' },
      { status: 'Submitted', waitingFor: '' },
    ];
    for (const [index, scenario] of blocked.entries()) {
      const local = makeHarness();
      const request = await prepareInspectedExchange(local, `outbound-blocked-${index}`);
      const exchangeCase = local.state.cases.find((item) => item._id === request.id);
      Object.assign(exchangeCase, scenario);
      const line = local.state.lines.find((item) => item.exchangeCaseId === request.id);
      const before = structuredClone(local.state);
      await assert.rejects(
        () => local.service.createOutboundShipment('warehouse-1', request.id, {
          idempotencyKey: `outbound-blocked-command-${index}`,
          exchangeLineId: line._id,
          direction: 'REPLACEMENT_TO_CUSTOMER',
          quantity: 2,
          carrierName: 'GHN',
          trackingCode: `OUTBOUND-BLOCKED-${index}`,
          shippedAt: local.now,
        }),
        /outbound|inspection|incident|reconciliation|in transit/i,
      );
      assert.deepEqual(local.state, before);
    }
  });

  it('records mutually exclusive sellable, damaged, and rejected Inventory lineage per physical unit', async () => {
    harness.state.inventories[0].stockQuantity = 3;
    harness.state.products[0].stockQuantity = 3;
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-unit-lineage-0001',
      lines: [{ orderDetailId: 'line-1', quantity: 3 }],
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-unit-lineage-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    await harness.service.recordHandoffProof('customer-1', request.id, {
      idempotencyKey: 'handoff-unit-lineage-0001',
      proofReference: 'TRACK-UNIT-LINEAGE',
      handoffAt: harness.now,
    });
    await harness.service.recordWarehouseReceipt('warehouse-1', request.id, {
      idempotencyKey: 'receipt-unit-lineage-0001',
      receivedAt: harness.now,
      evidenceReference: 'RECEIPT-UNIT-LINEAGE',
    });
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    await harness.service.finalizeInspection('warehouse-1', request.id, {
      idempotencyKey: 'inspection-unit-lineage-0001',
      lines: [{
        exchangeLineId: line._id,
        receivedQuantity: 3,
        acceptedSellableQuantity: 1,
        acceptedDamagedQuantity: 1,
        rejectedQuantity: 1,
        inspectionReason: 'Một món bán lại được, một món hỏng, một món từ chối',
        rejectionReason: 'Món còn lại không đủ điều kiện đổi',
        evidenceImages: ['/api/exchanges/evidence/unit-lineage.jpg'],
      }],
    });

    const units = harness.state.units
      .filter((item) => item.exchangeCaseId === request.id)
      .sort((left, right) => left.originalUnitOrdinal - right.originalUnitOrdinal);
    const sellableMovement = harness.state.inventoryTransactions.find((item) => item.transactionType === 'EXCHANGE_RETURN_IN');
    const damagedMovement = harness.state.inventoryTransactions.find((item) => item.transactionType === 'EXCHANGE_RETURN_DAMAGED_IN');
    assert.deepEqual(units.map((unit) => ({
      ordinal: unit.originalUnitOrdinal,
      outcome: unit.outcome,
      inventoryMovementKeys: unit.inventoryMovementKeys,
    })), [
      { ordinal: 1, outcome: 'Accepted', inventoryMovementKeys: [sellableMovement.movementKey] },
      { ordinal: 2, outcome: 'Accepted', inventoryMovementKeys: [damagedMovement.movementKey] },
      { ordinal: 3, outcome: 'Rejected', inventoryMovementKeys: [] },
    ]);
    assert.equal(units.filter((unit) => unit.inventoryMovementKeys.includes(sellableMovement.movementKey)).length, sellableMovement.quantity);
    assert.equal(units.filter((unit) => unit.inventoryMovementKeys.includes(damagedMovement.movementKey)).length, damagedMovement.quantity);
  });

  it('keeps repeated replacement incidents in one case and completes the delivered resend chain', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest());
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-resend-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    await harness.service.recordHandoffProof('customer-1', request.id, {
      idempotencyKey: 'handoff-resend-0001',
      proofReference: 'GHN-TRACK-RESEND-IN',
      handoffAt: harness.now,
    });
    await harness.service.recordWarehouseReceipt('warehouse-1', request.id, {
      idempotencyKey: 'receipt-resend-0001',
      receivedAt: harness.now,
      evidenceReference: 'warehouse-resend-receipt',
    });
    await harness.service.finalizeInspection('warehouse-1', request.id, {
      idempotencyKey: 'inspection-resend-0001',
      lines: [{
        exchangeLineId: harness.state.lines[0]._id,
        receivedQuantity: 2,
        acceptedSellableQuantity: 0,
        acceptedDamagedQuantity: 2,
        rejectedQuantity: 0,
        inspectionReason: 'Đã kiểm đủ, cả hai sản phẩm hư hỏng',
        evidenceImages: ['/api/exchanges/evidence/warehouse-resend.jpg'],
      }],
    });
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-resend-original-0001',
      exchangeLineId: harness.state.lines[0]._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-OUT-001',
      shippedAt: harness.now,
    });
    const incident = await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: 'carrier-lost-event-0001',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'carrier-proof-lost-001',
    });
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'DeliveryIncident');
    assert.equal(harness.state.cases.find((item) => item._id === request.id).shippingPayer, 'SHOP');
    await assertIncidentStockChoiceActionsDenied(harness, request.id, 'fresh-incident-choice');

    harness.state.inventories[0].stockQuantity = 2;
    harness.state.products[0].stockQuantity = 2;
    const resent = await harness.service.resendReplacement('staff-1', request.id, {
      idempotencyKey: 'resend-command-0001',
      incidentShipmentId: outbound.shipment._id,
      carrierName: 'Viettel Post',
      trackingCode: 'VTP-RESEND-001',
      shippedAt: harness.now,
    });
    assert.equal(resent.request.status, 'DeliveryIncident');
    assert.equal(resent.request.waitingFor, 'INCIDENT_RESEND_IN_TRANSIT');
    assert.equal(resent.request.incidentShipmentId, resent.shipment._id);
    assert.equal(harness.state.shipments.length, 2);
    assert.equal(harness.state.inventories[0].stockQuantity, 0);
    await assertIncidentStockChoiceActionsDenied(harness, request.id, 'in-transit-incident-choice');
    const beforeDuplicate = structuredClone(harness.state);
    await assert.rejects(
      harness.service.resendReplacement('staff-1', request.id, {
        idempotencyKey: 'resend-command-duplicate-fresh-key',
        incidentShipmentId: outbound.shipment._id,
        carrierName: 'GHN',
        trackingCode: 'GHN-DUPLICATE-RESEND',
        shippedAt: harness.now,
      }),
      /in transit|delivery incident|resend/i
    );
    assert.deepEqual(harness.state, beforeDuplicate);

    await harness.service.recordCarrierShipmentEvent(resent.shipment._id, {
      eventId: 'carrier-resend-lost-0001',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'carrier-proof-resend-lost-001',
    });
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'DeliveryIncident');
    assert.equal(harness.state.cases.find((item) => item._id === request.id).waitingFor, 'INCIDENT_RESEND');
    assert.equal(harness.state.cases.find((item) => item._id === request.id).incidentShipmentId, resent.shipment._id);
    harness.state.inventories[0].stockQuantity = 2;
    harness.state.products[0].stockQuantity = 2;
    const resentAgain = await harness.service.resendReplacement('staff-1', request.id, {
      idempotencyKey: 'resend-command-0002',
      incidentShipmentId: resent.shipment._id,
      carrierName: 'GHN',
      trackingCode: 'GHN-RESEND-002',
      shippedAt: harness.now,
    });
    await harness.service.recordCarrierShipmentEvent(resentAgain.shipment._id, {
      eventId: 'carrier-resend-delivered-0002',
      eventType: 'DELIVERED',
      occurredAt: harness.now,
      evidenceReference: 'carrier-proof-delivered-002',
    });
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'Completed');
    assert.equal(harness.state.locks.find((item) => item.orderId === 'order-1').status, 'Released');
  });

  it('rolls back terminal delivery and evidence when transactional notification fails, then retries exactly once', async () => {
    const request = await prepareInspectedExchange(harness, 'completion-atomic');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-completion-atomic-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-COMPLETION-ATOMIC',
      shippedAt: harness.now,
    });
    let failNotification = true;
    const atomicService = harness.createService({
      auditLogger: {
        async log(entry, session) {
          assert.ok(session);
          harness.state.audits.push(entry);
        },
      },
      notifier: {
        async notify(data, session) {
          assert.ok(session);
          harness.state.notifications.push(data);
          if (failNotification) throw new Error('notification unavailable');
        },
      },
    });
    const event = {
      eventId: 'carrier-completion-atomic-0001',
      eventType: 'DELIVERED',
      occurredAt: harness.now,
      evidenceReference: 'carrier-completion-atomic-proof',
    };

    await assert.rejects(
      atomicService.recordCarrierShipmentEvent(outbound.shipment._id, event),
      /notification unavailable/
    );
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'ReplacementShipped');
    assert.equal(harness.state.shipments.find((item) => item._id === outbound.shipment._id).status, 'InTransit');
    assert.equal(harness.state.locks.find((item) => item.caseId === request.id).status, 'Active');
    assert.equal(harness.state.shipmentEvents.length, 0);
    assert.equal(harness.state.audits.length, 0);
    assert.equal(harness.state.notifications.length, 0);

    failNotification = false;
    const completed = await atomicService.recordCarrierShipmentEvent(outbound.shipment._id, event);
    assert.equal(completed.idempotentReplay, false);
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'Completed');
    assert.equal(harness.state.shipments.find((item) => item._id === outbound.shipment._id).status, 'Delivered');
    assert.equal(harness.state.locks.find((item) => item.caseId === request.id).status, 'Released');
    assert.equal(harness.state.shipmentEvents.length, 1);
    assert.equal(harness.state.audits.filter((item) => item.action === 'EXCHANGE_SHIPMENT_DELIVERED').length, 1);
    assert.equal(harness.state.notifications.filter((item) => item.type === 'EXCHANGE_COMPLETED').length, 1);
    assert.equal(
      harness.state.audits.find((item) => item.action === 'EXCHANGE_SHIPMENT_DELIVERED').eventId,
      `EXCHANGE_SHIPMENT_DELIVERED:${request.id}:${event.eventId}`
    );

    const replay = await atomicService.recordCarrierShipmentEvent(outbound.shipment._id, event);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(harness.state.audits.filter((item) => item.action === 'EXCHANGE_SHIPMENT_DELIVERED').length, 1);
    assert.equal(harness.state.notifications.filter((item) => item.type === 'EXCHANGE_COMPLETED').length, 1);
  });

  it('rolls back non-terminal incident and correction evidence when audit fails, then repairs once', async () => {
    const request = await prepareInspectedExchange(harness, 'nonterminal-audit-atomic');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-nonterminal-audit-atomic-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-NONTERMINAL-AUDIT',
      shippedAt: harness.now,
    });
    let failAudit = true;
    const atomicService = harness.createService({
      auditLogger: {
        async log(entry, session) {
          assert.ok(session);
          harness.state.audits.push(entry);
          if (failAudit) throw new Error('audit unavailable');
        },
      },
    });
    const incidentInput = {
      eventId: 'carrier-nonterminal-audit-lost',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'carrier-nonterminal-audit-lost-proof',
    };

    await assert.rejects(
      atomicService.recordCarrierShipmentEvent(outbound.shipment._id, incidentInput),
      /audit unavailable/
    );
    assert.equal(
      harness.state.shipments.find((item) => item._id === outbound.shipment._id).status,
      'InTransit'
    );
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'ReplacementShipped');
    assert.equal(harness.state.shipmentEvents.length, 0);
    assert.equal(harness.state.audits.length, 0);

    failAudit = false;
    const incident = await atomicService.recordCarrierShipmentEvent(
      outbound.shipment._id,
      incidentInput
    );
    const incidentReplay = await atomicService.recordCarrierShipmentEvent(
      outbound.shipment._id,
      incidentInput
    );
    assert.equal(incident.idempotentReplay, false);
    assert.equal(incidentReplay.idempotentReplay, true);
    assert.equal(harness.state.shipmentEvents.length, 1);
    assert.equal(harness.state.audits.length, 1);
    assert.equal(
      harness.state.audits[0].eventId,
      `EXCHANGE_SHIPMENT_LOST:${request.id}:${incidentInput.eventId}`
    );

    const correctionInput = {
      eventId: 'staff-nonterminal-audit-correction',
      eventType: 'CORRECTION',
      occurredAt: harness.now,
      evidenceReference: 'staff-nonterminal-audit-correction-proof',
      replacesEventId: incident.eventId,
      note: 'Carrier evidence clarification',
    };
    failAudit = true;
    await assert.rejects(
      atomicService.recordStaffShipmentEvent(
        'staff-1',
        request.id,
        outbound.shipment._id,
        correctionInput
      ),
      /audit unavailable/
    );
    assert.equal(harness.state.shipmentEvents.length, 1);
    assert.equal(harness.state.audits.length, 1);

    failAudit = false;
    const correction = await atomicService.recordStaffShipmentEvent(
      'staff-1',
      request.id,
      outbound.shipment._id,
      correctionInput
    );
    const correctionReplay = await atomicService.recordStaffShipmentEvent(
      'staff-1',
      request.id,
      outbound.shipment._id,
      correctionInput
    );
    assert.equal(correction.idempotentReplay, false);
    assert.equal(correctionReplay.idempotentReplay, true);
    assert.equal(harness.state.shipmentEvents.length, 2);
    assert.equal(harness.state.audits.length, 2);
    assert.equal(
      harness.state.audits[1].eventId,
      `EXCHANGE_SHIPMENT_CORRECTION:${request.id}:${correctionInput.eventId}`
    );
  });

  it('requires an attributable Warehouse conclusion and evidence for every inspected line', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-inspection-evidence-0001',
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-inspection-evidence-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    await harness.service.recordHandoffProof('customer-1', request.id, {
      idempotencyKey: 'handoff-inspection-evidence-0001',
      proofReference: 'TRACK-IN-EVIDENCE',
      handoffAt: harness.now,
    });
    await harness.service.recordWarehouseReceipt('warehouse-1', request.id, {
      idempotencyKey: 'receipt-inspection-evidence-0001',
      receivedAt: harness.now,
      evidenceReference: 'RECEIPT-EVIDENCE',
    });
    await assert.rejects(
      harness.service.finalizeInspection('warehouse-1', request.id, {
        idempotencyKey: 'inspection-evidence-missing-0001',
        lines: [{
          exchangeLineId: harness.state.lines.find((line) => line.exchangeCaseId === request.id)._id,
          receivedQuantity: 2,
          acceptedSellableQuantity: 2,
          acceptedDamagedQuantity: 0,
          rejectedQuantity: 0,
          inspectionReason: '',
          evidenceImages: [],
        }],
      }),
      /conclusion|reason|evidence/i
    );
    assert.equal(harness.state.inspections.length, 0);
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'WarehouseInspecting');
  });

  it('does not create more outbound quantity than the remaining line obligation', async () => {
    const request = await prepareInspectedExchange(harness, 'outbound-limit');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-first-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-FIRST-001',
      shippedAt: harness.now,
    });
    await assert.rejects(
      harness.service.createOutboundShipment('warehouse-1', request.id, {
        idempotencyKey: 'shipment-second-0001',
        exchangeLineId: line._id,
        direction: 'REPLACEMENT_TO_CUSTOMER',
        quantity: 2,
        carrierName: 'GHN',
        trackingCode: 'GHN-SECOND-001',
        shippedAt: harness.now,
      }),
      /remaining.*obligation|already.*fulfilled/i
    );
    assert.equal(harness.state.shipments.length, 1);
  });

  it('rejects reuse of a Carrier event id for a different Shipment fact', async () => {
    const request = await prepareInspectedExchange(harness, 'event-key');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-event-key-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-EVENT-001',
      shippedAt: harness.now,
    });
    await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: 'carrier-event-reused-0001',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'carrier-proof-lost',
    });
    await assert.rejects(
      harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
        eventId: 'carrier-event-reused-0001',
        eventType: 'DELIVERED',
        occurredAt: harness.now,
        evidenceReference: 'carrier-proof-delivered',
      }),
      /event.*different|different.*fact/i
    );
    assert.equal(harness.state.shipmentEvents.length, 1);
  });

  it('compares the attributable actor and Exchange case on Shipment event replay', async () => {
    const request = await prepareInspectedExchange(harness, 'event-full-fact');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-event-full-fact-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-EVENT-FULL-FACT',
      shippedAt: harness.now,
    });
    const baseEvent = {
      shipmentId: outbound.shipment._id,
      eventType: 'LOST',
      source: 'CARRIER',
      occurredAt: harness.now,
      evidenceReference: 'carrier-full-fact-proof',
      replacesEventId: null,
      note: '',
    };
    harness.state.shipmentEvents.push({
      _id: 'shipment-event-actor-mismatch',
      eventKey: 'carrier-event-actor-mismatch',
      exchangeCaseId: request.id,
      actorId: 'foreign-actor',
      ...baseEvent,
    });
    harness.state.shipmentEvents.push({
      _id: 'shipment-event-case-mismatch',
      eventKey: 'carrier-event-case-mismatch',
      exchangeCaseId: 'foreign-case',
      actorId: null,
      ...baseEvent,
    });

    for (const eventId of ['carrier-event-actor-mismatch', 'carrier-event-case-mismatch']) {
      await assert.rejects(
        harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
          eventId,
          eventType: 'LOST',
          occurredAt: harness.now,
          evidenceReference: 'carrier-full-fact-proof',
        }),
        /event.*different|different.*fact/i
      );
    }
    assert.equal(harness.state.shipmentEvents.length, 2);
    assert.equal(
      harness.state.shipments.find((item) => item._id === outbound.shipment._id).status,
      'InTransit'
    );
  });

  it('allows exactly one concurrent raw outcome for the same InTransit Shipment', async () => {
    const request = await prepareInspectedExchange(harness, 'outcome-race');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-outcome-race-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-OUTCOME-RACE',
      shippedAt: harness.now,
    });

    const results = await Promise.allSettled([
      harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
        eventId: 'carrier-outcome-race-lost',
        eventType: 'LOST',
        occurredAt: harness.now,
        evidenceReference: 'carrier-outcome-race-lost-proof',
      }),
      harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
        eventId: 'carrier-outcome-race-delivered',
        eventType: 'DELIVERED',
        occurredAt: harness.now,
        evidenceReference: 'carrier-outcome-race-delivered-proof',
      }),
    ]);

    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
    assert.equal(harness.state.shipmentEvents.length, 1);
    assert.ok(['Incident', 'Delivered'].includes(
      harness.state.shipments.find((item) => item._id === outbound.shipment._id).status
    ));
  });

  it('returns the exact Carrier winner when a transaction retry observes the competing commit before CAS', async () => {
    const request = await prepareInspectedExchange(harness, 'outcome-txn-retry');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-outcome-txn-retry-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-OUTCOME-TXN-RETRY',
      shippedAt: harness.now,
    });
    const eventInput = {
      eventId: 'carrier-outcome-txn-retry-lost',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'carrier-outcome-txn-retry-proof',
    };
    let injected = false;
    let outcomeClaims = 0;
    const originalClaimShipmentOutcome = harness.repository.claimShipmentOutcome;
    harness.repository.claimShipmentOutcome = async (...args) => {
      outcomeClaims += 1;
      return originalClaimShipmentOutcome(...args);
    };
    const retryService = harness.createService({
      transactionManager: {
        async withTransaction(work) {
          if (!injected) {
            injected = true;
            Object.assign(
              harness.state.shipments.find((item) => item._id === outbound.shipment._id),
              {
                status: 'Incident',
                incidentAt: harness.now,
                incidentReason: 'LOST',
              }
            );
            Object.assign(
              harness.state.cases.find((item) => item._id === request.id),
              {
                status: 'DeliveryIncident',
                waitingFor: 'INCIDENT_RESEND',
                incidentShipmentId: outbound.shipment._id,
                shipmentOutcomeVersion: 1,
              }
            );
            harness.state.shipmentEvents.push({
              _id: 'shipment-event-competing-winner',
              eventKey: eventInput.eventId,
              exchangeCaseId: request.id,
              shipmentId: outbound.shipment._id,
              eventType: eventInput.eventType,
              source: 'CARRIER',
              occurredAt: eventInput.occurredAt,
              evidenceReference: eventInput.evidenceReference,
              actorId: null,
              replacesEventId: null,
              note: '',
            });
          }
          return work({ retryAttempt: 2 });
        },
      },
    });

    const result = await retryService.recordCarrierShipmentEvent(
      outbound.shipment._id,
      eventInput
    );

    assert.deepEqual(result, {
      eventId: 'shipment-event-competing-winner',
      eventType: 'LOST',
      idempotentReplay: true,
    });
    assert.equal(outcomeClaims, 0);
    assert.equal(harness.state.shipmentEvents.length, 1);
  });

  it('rejects another raw outcome after a Shipment is already Incident without any side effect', async () => {
    const request = await prepareInspectedExchange(harness, 'incident-raw-outcome');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-incident-raw-outcome-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-INCIDENT-RAW',
      shippedAt: harness.now,
    });
    await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: 'carrier-incident-raw-lost',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'carrier-incident-raw-lost-proof',
    });
    const before = structuredClone(harness.state);

    await assert.rejects(
      harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
        eventId: 'carrier-incident-raw-delivered',
        eventType: 'DELIVERED',
        occurredAt: harness.now,
        evidenceReference: 'carrier-incident-raw-delivered-proof',
      }),
      /InTransit|raw outcome|correction/i
    );
    await assert.rejects(
      harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
        eventId: 'carrier-incident-raw-damaged',
        eventType: 'DAMAGED',
        occurredAt: harness.now,
        evidenceReference: 'carrier-incident-raw-damaged-proof',
      }),
      /InTransit|raw outcome|correction/i
    );
    assert.deepEqual(harness.state, before);
  });

  it('returns an idempotent Carrier acknowledgement when a concurrent exact event wins the unique-key race', async () => {
    const request = await prepareInspectedExchange(harness, 'event-race-exact');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-event-race-exact-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-EVENT-RACE-EXACT',
      shippedAt: harness.now,
    });
    const beforeRace = structuredClone(harness.state);
    const originalFind = harness.repository.findShipmentEventByKey;
    const originalCreate = harness.repository.createShipmentEvent;
    let lookups = 0;
    let winner = null;
    harness.repository.findShipmentEventByKey = async () => {
      lookups += 1;
      return lookups === 1 ? null : winner;
    };
    harness.repository.createShipmentEvent = async (data) => {
      winner = { _id: 'shipment-event-concurrent-winner', ...data };
      const error = new Error('duplicate event key');
      error.code = 11000;
      throw error;
    };

    try {
      const result = await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
        eventId: 'carrier-event-race-exact-0001',
        eventType: 'LOST',
        occurredAt: harness.now,
        evidenceReference: 'carrier-race-proof',
        note: 'Immutable carrier fact',
      });
      assert.deepEqual(result, {
        eventId: 'shipment-event-concurrent-winner',
        eventType: 'LOST',
        idempotentReplay: true,
      });
    } finally {
      harness.repository.findShipmentEventByKey = originalFind;
      harness.repository.createShipmentEvent = originalCreate;
    }

    assert.deepEqual(harness.state, beforeRace);
  });

  it('rejects a mismatched concurrent Carrier winner and rolls back every losing side effect', async () => {
    const request = await prepareInspectedExchange(harness, 'event-race-mismatch');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-event-race-mismatch-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-EVENT-RACE-MISMATCH',
      shippedAt: harness.now,
    });
    const beforeRace = structuredClone(harness.state);
    const originalFind = harness.repository.findShipmentEventByKey;
    const originalCreate = harness.repository.createShipmentEvent;
    let lookups = 0;
    let winner = null;
    harness.repository.findShipmentEventByKey = async () => {
      lookups += 1;
      return lookups === 1 ? null : winner;
    };
    harness.repository.createShipmentEvent = async (data) => {
      winner = {
        _id: 'shipment-event-concurrent-mismatch',
        ...data,
        note: 'Different immutable carrier fact',
      };
      const error = new Error('duplicate event key');
      error.code = 11000;
      throw error;
    };

    try {
      await assert.rejects(
        harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
          eventId: 'carrier-event-race-mismatch-0001',
          eventType: 'LOST',
          occurredAt: harness.now,
          evidenceReference: 'carrier-race-proof',
          note: 'Original immutable carrier fact',
        }),
        (error) => error.statusCode === 409 && /different fact/i.test(error.message)
      );
    } finally {
      harness.repository.findShipmentEventByKey = originalFind;
      harness.repository.createShipmentEvent = originalCreate;
    }

    assert.deepEqual(harness.state, beforeRace);
  });

  it('keeps incident resend waiting separate from initial approval reservation', async () => {
    const request = await prepareInspectedExchange(harness, 'incident-wait');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-incident-wait-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-INCIDENT-WAIT-001',
      shippedAt: harness.now,
    });
    await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: 'carrier-incident-wait-0001',
      eventType: 'DAMAGED',
      occurredAt: harness.now,
      evidenceReference: 'carrier-proof-damaged',
    });

    const noStock = await harness.service.resendReplacement('staff-1', request.id, {
      idempotencyKey: 'resend-no-stock-0001',
      incidentShipmentId: outbound.shipment._id,
      carrierName: 'Viettel Post',
      trackingCode: 'VTP-NO-STOCK-001',
      shippedAt: harness.now,
    });
    assert.equal(noStock.request.status, 'AwaitingExactStockChoice');
    assert.equal(noStock.request.waitingFor, 'INCIDENT_RESEND');

    const waiting = await harness.service.chooseStockOption('customer-1', request.id, {
      idempotencyKey: 'wait-for-resend-stock-0001',
      choice: 'WAIT',
    });
    assert.equal(waiting.status, 'WaitingForExactStock');
    await assert.rejects(
      harness.service.chooseStockOption('customer-1', request.id, {
        idempotencyKey: 'wait-for-resend-stock-0001',
        choice: 'CONVERT_TO_RETURN',
      }),
      /idempotency key.*different|different.*choice/i
    );
    await assert.rejects(
      harness.service.retryReservation('staff-1', request.id, {
        idempotencyKey: 'retry-incident-resend-0001',
      }),
      /incident.*resend|resend.*flow/i
    );

    harness.state.inventories[0].stockQuantity = 2;
    harness.state.products[0].stockQuantity = 2;
    const resent = await harness.service.resendReplacement('staff-1', request.id, {
      idempotencyKey: 'resend-after-wait-0001',
      incidentShipmentId: outbound.shipment._id,
      carrierName: 'Viettel Post',
      trackingCode: 'VTP-AFTER-WAIT-001',
      shippedAt: harness.now,
    });
    assert.equal(resent.request.status, 'DeliveryIncident');
    assert.equal(resent.request.waitingFor, 'INCIDENT_RESEND_IN_TRANSIT');
    assert.equal(resent.request.incidentShipmentId, resent.shipment._id);
  });

  it('keeps Customer delivery disputes and Staff corrections append-only with an explicit event lineage', async () => {
    const request = await prepareInspectedExchange(harness, 'dispute-lineage');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-dispute-lineage-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-DISPUTE-001',
      shippedAt: harness.now,
    });
    const delivered = await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: 'carrier-delivered-dispute-0001',
      eventType: 'DELIVERED',
      occurredAt: harness.now,
      evidenceReference: 'carrier-delivery-proof',
    });

    const disputed = await harness.service.reportShipmentDispute(
      'customer-1',
      request.id,
      outbound.shipment._id,
      {
        idempotencyKey: 'customer-dispute-0001',
        replacesEventId: delivered.eventId,
        evidenceReference: 'customer-dispute-proof',
        note: 'Thời điểm giao hàng không đúng',
      }
    );
    assert.equal(disputed.event.source, 'CUSTOMER_DISPUTE');
    assert.equal(disputed.event.replacesEventId, delivered.eventId);

    const corrected = await harness.service.recordStaffShipmentEvent(
      'staff-1',
      request.id,
      outbound.shipment._id,
      {
        idempotencyKey: 'staff-correction-0001',
        eventType: 'CORRECTION',
        replacesEventId: disputed.event._id,
        occurredAt: harness.now,
        evidenceReference: 'staff-correction-proof',
      }
    );
    assert.equal(corrected.event.replacesEventId, disputed.event._id);
    assert.equal(harness.state.shipmentEvents.length, 3);
  });

  it('does not replay a foreign Customer Shipment event through an owned case projection', async () => {
    const request = await prepareInspectedExchange(harness, 'foreign-replay');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-foreign-replay-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'GHN-FOREIGN-REPLAY',
      shippedAt: harness.now,
    });
    const delivered = await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: 'carrier-foreign-replay-delivered',
      eventType: 'DELIVERED',
      occurredAt: harness.now,
      evidenceReference: 'carrier-foreign-replay-proof',
    });
    const disputeInput = {
      idempotencyKey: 'customer-foreign-replay-dispute',
      replacesEventId: delivered.eventId,
      evidenceReference: 'customer-foreign-replay-proof',
      note: 'Original owner dispute',
    };
    await harness.service.reportShipmentDispute(
      'customer-1',
      request.id,
      outbound.shipment._id,
      disputeInput
    );
    harness.state.cases.find((item) => item._id === request.id).customerId = 'customer-2';
    harness.state.cases.push({
      _id: 'owned-decoy-case',
      customerId: 'customer-1',
      orderId: 'owned-decoy-order',
      requestCode: 'EXC-DECOY',
      status: 'Submitted',
      reason: 'Owned decoy',
      evidenceImages: [],
      requestedAt: harness.now,
      deadlineAt: harness.now,
    });
    const beforeReplay = structuredClone(harness.state);

    await assert.rejects(
      harness.service.reportShipmentDispute(
        'customer-1',
        'owned-decoy-case',
        outbound.shipment._id,
        disputeInput
      ),
      (error) => error.statusCode === 404
    );
    assert.deepEqual(harness.state, beforeReplay);
  });

  it('does not cancel or release stock when the atomic status claim loses a handoff race', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-cancel-race-0001',
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-cancel-race-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    harness.repository.claimCase = async () => null;

    await assert.rejects(
      harness.service.cancelRequest('customer-1', request.id, {
        idempotencyKey: 'cancel-race-0001',
      }),
      /changed|handoff|another/i
    );
    assert.equal(harness.state.cases[0].status, 'ApprovedAwaitingShipment');
    assert.equal(harness.state.inventories[0].reservedQuantity, 2);
    assert.equal(harness.state.reservations[0].status, 'Reserved');
    assert.equal(harness.state.locks[0].status, 'Active');
  });

  it('rolls back exact-stock reservation when the approval status claim loses a race', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-approval-race-0001',
    }));
    harness.repository.claimCase = async () => null;

    await assert.rejects(
      harness.service.decideRequest('staff-1', request.id, {
        idempotencyKey: 'decision-approval-race-0001',
        decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
      }),
      /changed|approv|another/i
    );
    assert.equal(harness.state.inventories[0].reservedQuantity, 0);
    assert.equal(harness.state.reservations.length, 0);
    assert.equal(harness.state.cases[0].status, 'Submitted');
  });

  it('does not record handoff when an atomic cancellation already owns the case', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-handoff-race-0001',
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-handoff-race-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    harness.repository.claimCase = async () => null;

    await assert.rejects(
      harness.service.recordHandoffProof('customer-1', request.id, {
        idempotencyKey: 'handoff-race-0001',
        proofReference: 'TRACK-RACE',
        handoffAt: harness.now,
      }),
      /changed|cancel|another/i
    );
    assert.equal(harness.state.cases[0].status, 'ApprovedAwaitingShipment');
    assert.equal(Boolean(harness.state.cases[0].handoffAt), false);
  });

  it('does not record Warehouse receipt when the case transition claim loses a race', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-receipt-race-0001',
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-receipt-race-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    await harness.service.recordHandoffProof('customer-1', request.id, {
      idempotencyKey: 'handoff-receipt-race-0001',
      proofReference: 'TRACK-RECEIPT-RACE',
      handoffAt: harness.now,
    });
    harness.repository.claimCase = async () => null;

    await assert.rejects(
      harness.service.recordWarehouseReceipt('warehouse-1', request.id, {
        idempotencyKey: 'receipt-race-0001',
        receivedAt: harness.now,
        evidenceReference: 'RECEIPT-RACE',
      }),
      /changed|another|race/i
    );
    assert.equal(harness.state.cases[0].status, 'CustomerShipped');
    assert.equal(Boolean(harness.state.cases[0].warehouseReceivedAt), false);
  });

  it('rolls back Warehouse inspection effects when the terminal inspection claim loses a race', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-inspection-race-0001',
      lines: [{ orderDetailId: 'line-1', quantity: 1 }],
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-inspection-race-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    await harness.service.recordHandoffProof('customer-1', request.id, {
      idempotencyKey: 'handoff-inspection-race-0001',
      proofReference: 'TRACK-INSPECTION-RACE',
      handoffAt: harness.now,
    });
    await harness.service.recordWarehouseReceipt('warehouse-1', request.id, {
      idempotencyKey: 'receipt-inspection-race-0001',
      receivedAt: harness.now,
      evidenceReference: 'RECEIPT-INSPECTION-RACE',
    });
    const before = structuredClone(harness.state.inventories);
    harness.repository.claimCase = async () => null;

    await assert.rejects(
      harness.service.finalizeInspection('warehouse-1', request.id, {
        idempotencyKey: 'inspection-race-0001',
        lines: [{
          exchangeLineId: harness.state.lines.find((line) => line.exchangeCaseId === request.id)._id,
          receivedQuantity: 1,
          acceptedSellableQuantity: 1,
          acceptedDamagedQuantity: 0,
          rejectedQuantity: 0,
          inspectionReason: 'Đủ điều kiện đổi',
          evidenceImages: ['/api/exchanges/evidence/inspection-race.jpg'],
        }],
      }),
      /changed|another|race/i
    );
    assert.deepEqual(harness.state.inventories, before);
    assert.equal(harness.state.inspections.length, 0);
    assert.equal(harness.state.cases[0].status, 'WarehouseInspecting');
  });

  it('uses a new idempotent Staff command for reservation retry and replays its result', async () => {
    harness.state.inventories[1].stockQuantity = 0;
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-retry-idempotent-0001',
      lines: [{ orderDetailId: 'line-2', quantity: 1 }],
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-retry-idempotent-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Đủ điều kiện',
    });
    await harness.service.chooseStockOption('customer-1', request.id, {
      idempotencyKey: 'choice-retry-idempotent-0001',
      choice: 'WAIT',
    });
    harness.state.inventories[1].stockQuantity = 1;

    const first = await harness.service.retryReservation('staff-1', request.id, {
      idempotencyKey: 'retry-reservation-0001',
    });
    const replay = await harness.service.retryReservation('staff-1', request.id, {
      idempotencyKey: 'retry-reservation-0001',
    });
    assert.equal(first.status, 'ApprovedAwaitingShipment');
    assert.equal(replay.idempotentReplay, true);
    assert.equal(harness.state.reservations.length, 1);
  });

  it('requires the Customer to choose WAIT before Staff retries an initial reservation', async () => {
    harness.state.inventories[1].stockQuantity = 0;
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-retry-before-wait-0001',
      lines: [{ orderDetailId: 'line-2', quantity: 1 }],
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-retry-before-wait-0001',
      decision: 'APPROVE',
      responsibility: 'SHOP_FAULT',
      reason: 'Kiểm tra retry trước lựa chọn của Customer',
    });
    const exchangeCase = harness.state.cases.find((item) => item._id === request.id);
    assert.equal(exchangeCase.status, 'AwaitingExactStockChoice');
    assert.equal(exchangeCase.waitingFor, 'INITIAL_APPROVAL');
    const before = structuredClone(harness.state);

    await assert.rejects(
      harness.service.retryReservation('staff-1', request.id, {
        idempotencyKey: 'retry-before-customer-wait-0001',
      }),
      /Customer.*choose WAIT|choose WAIT.*Customer/i
    );
    assert.deepEqual(harness.state, before);
  });

  it('denies reservation retry for non-initial WaitingForExactStock causes without mutation', async () => {
    for (const waitingFor of [
      'REJECTED_ORIGINAL_RECONCILIATION',
      'INCIDENT_RESEND_IN_TRANSIT',
      '',
    ]) {
      const scenario = makeHarness();
      scenario.state.inventories[1].stockQuantity = 0;
      const request = await scenario.service.createCustomerRequest('customer-1', validRequest({
        idempotencyKey: `exchange-retry-guard-${waitingFor || 'empty'}-0001`,
        lines: [{ orderDetailId: 'line-2', quantity: 1 }],
      }));
      await scenario.service.decideRequest('staff-1', request.id, {
        idempotencyKey: `decision-retry-guard-${waitingFor || 'empty'}-0001`,
        decision: 'APPROVE',
        responsibility: 'SHOP_FAULT',
        reason: 'Kiểm tra guard retry reservation',
      });
      const exchangeCase = scenario.state.cases.find((item) => item._id === request.id);
      exchangeCase.status = 'WaitingForExactStock';
      exchangeCase.waitingFor = waitingFor;
      const before = structuredClone(scenario.state);

      await assert.rejects(
        scenario.service.retryReservation('staff-1', request.id, {
          idempotencyKey: `retry-guard-${waitingFor || 'empty'}-0001`,
        }),
        /initial.*exact.stock|initial.*reservation|initial approval/i
      );
      assert.deepEqual(scenario.state, before);
    }
  });

  it('allocates the next unclaimed original physical unit after an earlier unit completes Exchange', async () => {
    const first = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-original-unit-one-0001',
      lines: [{ orderDetailId: 'line-1', quantity: 1 }],
    }));
    await harness.service.decideRequest('staff-1', first.id, {
      idempotencyKey: 'decision-original-unit-one-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    await harness.service.recordHandoffProof('customer-1', first.id, {
      idempotencyKey: 'handoff-original-unit-one-0001',
      proofReference: 'TRACK-ORIGINAL-ONE',
      handoffAt: harness.now,
    });
    await harness.service.recordWarehouseReceipt('warehouse-1', first.id, {
      idempotencyKey: 'receipt-original-unit-one-0001',
      receivedAt: harness.now,
      evidenceReference: 'RECEIPT-ORIGINAL-ONE',
    });
    await harness.service.finalizeInspection('warehouse-1', first.id, {
      idempotencyKey: 'inspection-original-unit-one-0001',
      lines: [{
        exchangeLineId: harness.state.lines.find((line) => line.exchangeCaseId === first.id)._id,
        receivedQuantity: 1,
        acceptedSellableQuantity: 0,
        acceptedDamagedQuantity: 1,
        rejectedQuantity: 0,
        inspectionReason: 'Đã xác nhận một sản phẩm lỗi',
        evidenceImages: ['/api/exchanges/evidence/original-one.jpg'],
      }],
    });
    const outbound = await harness.service.createOutboundShipment('warehouse-1', first.id, {
      idempotencyKey: 'shipment-original-unit-one-0001',
      exchangeLineId: harness.state.lines.find((line) => line.exchangeCaseId === first.id)._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 1,
      carrierName: 'GHN',
      trackingCode: 'TRACK-OUT-ORIGINAL-ONE',
      shippedAt: harness.now,
    });
    await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: 'carrier-original-unit-one-delivered',
      eventType: 'DELIVERED',
      occurredAt: harness.now,
      evidenceReference: 'proof-original-one-delivered',
    });
    assert.equal(harness.state.cases.find((item) => item._id === first.id).status, 'Completed');

    const second = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-original-unit-two-0001',
      lines: [{ orderDetailId: 'line-1', quantity: 1 }],
    }));
    const secondUnit = harness.state.units.find((unit) => unit.exchangeCaseId === second.id);
    assert.equal(secondUnit.originalUnitOrdinal, 2);
    assert.match(secondUnit.exclusivePhysicalClaimKey, /ORIGINAL:order-1:line-1:2$/);
  });

  it('recovers multiple incident leaves in reverse order and completes once', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-multiline-incident-0001',
      lines: [
        { orderDetailId: 'line-1', quantity: 1 },
        { orderDetailId: 'line-2', quantity: 1 },
      ],
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-multiline-incident-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lỗi Shop',
    });
    await harness.service.recordHandoffProof('customer-1', request.id, {
      idempotencyKey: 'handoff-multiline-incident-0001',
      proofReference: 'TRACK-MULTILINE-IN',
      handoffAt: harness.now,
    });
    await harness.service.recordWarehouseReceipt('warehouse-1', request.id, {
      idempotencyKey: 'receipt-multiline-incident-0001',
      receivedAt: harness.now,
      evidenceReference: 'RECEIPT-MULTILINE',
    });
    const caseLines = harness.state.lines.filter((line) => line.exchangeCaseId === request.id);
    await harness.service.finalizeInspection('warehouse-1', request.id, {
      idempotencyKey: 'inspection-multiline-incident-0001',
      lines: caseLines.map((line, index) => ({
        exchangeLineId: line._id,
        receivedQuantity: 1,
        acceptedSellableQuantity: 0,
        acceptedDamagedQuantity: 1,
        rejectedQuantity: 0,
        inspectionReason: `Đã xác nhận sản phẩm lỗi ${index + 1}`,
        evidenceImages: [`/api/exchanges/evidence/multiline-${index + 1}.jpg`],
      })),
    });
    const firstShipment = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-multiline-one-0001',
      exchangeLineId: caseLines[0]._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 1,
      carrierName: 'GHN',
      trackingCode: 'TRACK-MULTILINE-ONE',
      shippedAt: harness.now,
    });
    await harness.service.recordCarrierShipmentEvent(firstShipment.shipment._id, {
      eventId: 'carrier-multiline-one-lost',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'proof-multiline-one-lost',
    });
    const secondShipment = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-multiline-two-0001',
      exchangeLineId: caseLines[1]._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 1,
      carrierName: 'GHN',
      trackingCode: 'TRACK-MULTILINE-TWO',
      shippedAt: harness.now,
    });
    await harness.service.recordCarrierShipmentEvent(secondShipment.shipment._id, {
      eventId: 'carrier-multiline-two-lost',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'proof-multiline-two-lost',
    });

    const bothIncident = await harness.service.getStaffRequest(request.id);
    assert.deepEqual(
      bothIncident.activeIncidents.map((item) => item.shipmentId).sort(),
      [firstShipment.shipment._id, secondShipment.shipment._id].sort()
    );

    harness.state.inventories[1].stockQuantity = 1;
    harness.state.products[1].stockQuantity = 1;
    const secondResend = await harness.service.resendReplacement('staff-1', request.id, {
      idempotencyKey: 'resend-multiline-two-0001',
      incidentShipmentId: secondShipment.shipment._id,
      carrierName: 'GHN',
      trackingCode: 'TRACK-MULTILINE-TWO-RESEND',
      shippedAt: harness.now,
    });
    const oneIncidentOneTransit = await harness.service.getStaffRequest(request.id);
    assert.deepEqual(
      oneIncidentOneTransit.activeIncidents
        .map((item) => [item.shipmentId, item.status])
        .sort((left, right) => left[0].localeCompare(right[0])),
      [
        [firstShipment.shipment._id, 'Incident'],
        [secondResend.shipment._id, 'InTransit'],
      ].sort((left, right) => left[0].localeCompare(right[0]))
    );

    harness.state.inventories[0].stockQuantity = Math.max(
      1,
      Number(harness.state.inventories[0].stockQuantity)
    );
    harness.state.products[0].stockQuantity = harness.state.inventories[0].stockQuantity;
    const firstResend = await harness.service.resendReplacement('staff-1', request.id, {
      idempotencyKey: 'resend-multiline-one-0001',
      incidentShipmentId: firstShipment.shipment._id,
      carrierName: 'GHN',
      trackingCode: 'TRACK-MULTILINE-ONE-RESEND',
      shippedAt: harness.now,
    });
    const bothInTransit = await harness.service.getStaffRequest(request.id);
    assert.deepEqual(
      bothInTransit.activeIncidents
        .map((item) => [item.shipmentId, item.status])
        .sort((left, right) => left[0].localeCompare(right[0])),
      [
        [firstResend.shipment._id, 'InTransit'],
        [secondResend.shipment._id, 'InTransit'],
      ].sort((left, right) => left[0].localeCompare(right[0]))
    );

    harness.state.audits.length = 0;
    harness.state.notifications.length = 0;
    const atomicService = harness.createService({
      auditLogger: {
        async log(entry, session) {
          harness.state.audits.push({ ...entry, inTransaction: Boolean(session) });
        },
      },
      notifier: {
        async notify(data, session) {
          assert.ok(session);
          harness.state.notifications.push(data);
        },
      },
    });
    const delivered = await Promise.allSettled([
      atomicService.recordCarrierShipmentEvent(firstResend.shipment._id, {
        eventId: 'carrier-multiline-one-resend-delivered',
        eventType: 'DELIVERED',
        occurredAt: harness.now,
        evidenceReference: 'proof-multiline-one-resend-delivered',
      }),
      atomicService.recordCarrierShipmentEvent(secondResend.shipment._id, {
        eventId: 'carrier-multiline-two-resend-delivered',
        eventType: 'DELIVERED',
        occurredAt: harness.now,
        evidenceReference: 'proof-multiline-two-resend-delivered',
      }),
    ]);

    assert.equal(
      delivered.filter((item) => item.status === 'fulfilled').length,
      2,
      delivered.map((item) => item.reason?.message || item.status).join(' | ')
    );
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'Completed');
    assert.equal(harness.state.locks.find((item) => item.caseId === request.id).status, 'Released');
    assert.equal(
      harness.state.audits.filter((item) => (
        item.action === 'EXCHANGE_SHIPMENT_DELIVERED' && item.inTransaction
      )).length,
      2
    );
    assert.equal(
      harness.state.notifications.filter((item) => item.type === 'EXCHANGE_COMPLETED').length,
      1
    );
  });

  it('classifies a rejected-original incident for reconciliation without offering replacement resend', async () => {
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-rejected-incident-0001',
      lines: [{ orderDetailId: 'line-1', quantity: 1 }],
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-rejected-incident-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Cần kiểm tra thực tế',
    });
    await harness.service.recordHandoffProof('customer-1', request.id, {
      idempotencyKey: 'handoff-rejected-incident-0001',
      proofReference: 'TRACK-REJECTED-IN',
      handoffAt: harness.now,
    });
    await harness.service.recordWarehouseReceipt('warehouse-1', request.id, {
      idempotencyKey: 'receipt-rejected-incident-0001',
      receivedAt: harness.now,
      evidenceReference: 'RECEIPT-REJECTED',
    });
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    await harness.service.finalizeInspection('warehouse-1', request.id, {
      idempotencyKey: 'inspection-rejected-incident-0001',
      lines: [{
        exchangeLineId: line._id,
        receivedQuantity: 1,
        acceptedSellableQuantity: 0,
        acceptedDamagedQuantity: 0,
        rejectedQuantity: 1,
        inspectionReason: 'Không đủ điều kiện đổi',
        rejectionReason: 'Sản phẩm gửi về không khớp bằng chứng',
        evidenceImages: ['/api/exchanges/evidence/rejected-incident.jpg'],
      }],
    });
    const shipment = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-rejected-incident-0001',
      exchangeLineId: line._id,
      direction: 'REJECTED_ORIGINAL_TO_CUSTOMER',
      quantity: 1,
      carrierName: 'GHN',
      trackingCode: 'TRACK-REJECTED-OUT',
      shippedAt: harness.now,
    });
    const incident = await harness.service.recordCarrierShipmentEvent(shipment.shipment._id, {
      eventId: 'carrier-rejected-original-lost-0001',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'proof-rejected-original-lost',
    });
    assert.equal(
      harness.state.cases.find((item) => item._id === request.id).waitingFor,
      'REJECTED_ORIGINAL_RECONCILIATION'
    );
    assert.deepEqual(Object.keys(incident).sort(), ['eventId', 'eventType', 'idempotentReplay']);

    const beforeForbiddenActions = structuredClone(harness.state);
    await assert.rejects(
      harness.service.chooseStockOption('customer-1', request.id, {
        idempotencyKey: 'rejected-original-wait-0001',
        choice: 'WAIT',
      }),
      /rejected original|reconciliation/i
    );
    await assert.rejects(
      harness.service.chooseStockOption('customer-1', request.id, {
        idempotencyKey: 'rejected-original-convert-0001',
        choice: 'CONVERT_TO_RETURN',
      }),
      /rejected original|reconciliation/i
    );
    await assert.rejects(
      harness.service.convertToReturn('customer-1', request.id, {
        idempotencyKey: 'rejected-original-direct-convert-0001',
      }),
      /rejected[- ]original|reconciliation/i
    );
    await assert.rejects(
      harness.service.retryReservation('staff-1', request.id, {
        idempotencyKey: 'rejected-original-retry-0001',
      }),
      /initial.*exact.stock|initial.*reservation|initial approval|waiting Exchange/i
    );
    await assert.rejects(
      harness.service.resendReplacement('staff-1', request.id, {
        idempotencyKey: 'rejected-original-resend-0001',
        incidentShipmentId: shipment.shipment._id,
        carrierName: 'GHN',
        trackingCode: 'TRACK-REJECTED-RESEND',
        shippedAt: harness.now,
      }),
      /rejected original|replacement incident|resend/i
    );
    assert.deepEqual(harness.state, beforeForbiddenActions);
  });

  it('rejects a late loss event after the Exchange case has completed', async () => {
    const request = await prepareInspectedExchange(harness, 'late-terminal-event');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-late-terminal-event-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'TRACK-LATE-TERMINAL',
      shippedAt: harness.now,
    });
    await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: 'carrier-terminal-delivered-0001',
      eventType: 'DELIVERED',
      occurredAt: harness.now,
      evidenceReference: 'proof-terminal-delivered',
    });
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'Completed');

    await assert.rejects(
      harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
        eventId: 'carrier-terminal-lost-late-0001',
        eventType: 'LOST',
        occurredAt: harness.now,
        evidenceReference: 'proof-terminal-lost-late',
      }),
      /terminal|completed|closed/i
    );
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'Completed');
  });

  it('returns only a minimal acknowledgement to the Carrier integration', async () => {
    const request = await prepareInspectedExchange(harness, 'carrier-ack');
    const line = harness.state.lines.find((item) => item.exchangeCaseId === request.id);
    const outbound = await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-carrier-ack-0001',
      exchangeLineId: line._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 2,
      carrierName: 'GHN',
      trackingCode: 'TRACK-CARRIER-ACK',
      shippedAt: harness.now,
    });
    const result = await harness.service.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: 'carrier-minimal-ack-0001',
      eventType: 'DELIVERED',
      occurredAt: harness.now,
      evidenceReference: 'proof-carrier-minimal-ack',
    });
    assert.deepEqual(Object.keys(result).sort(), ['eventId', 'eventType', 'idempotentReplay']);
    assert.equal(result.eventId, 'shipment-event-1');
    assert.equal(result.eventType, 'DELIVERED');
  });
});
