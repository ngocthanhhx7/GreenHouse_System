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
    conversions: [],
    inventoryTransactions: [],
    notifications: [],
  };

  const repository = {
    state,
    snapshot: () => structuredClone(state),
    restore(snapshot) { Object.keys(snapshot).forEach((key) => { state[key] = snapshot[key]; }); },
    async findOrderById(id) { return state.orders.find((item) => item._id === id) || null; },
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
      return state.locks.find((item) => item.orderId === orderId && item.status === 'Active') || null;
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
    async releaseUnitClaims(caseId) {
      const units = state.units.filter((item) => item.exchangeCaseId === caseId);
      units.forEach((unit) => { delete unit.exclusivePhysicalClaimKey; });
      return units.length;
    },
  };

  const transactionManager = {
    async withTransaction(work) {
      const snapshot = repository.snapshot();
      try {
        return await work({});
      } catch (error) {
        repository.restore(snapshot);
        throw error;
      }
    },
  };

  const service = createExchangeService({
    repository,
    transactionManager,
    evidenceVerifier: (_customerId, items) => items,
    auditLogger: { log: async () => {} },
    notifier: { notify: async (data) => { state.notifications.push(data); } },
    clock: () => new Date(now),
  });
  return { service, repository, state, now };
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

describe('SL-002 Exchange service', () => {
  let harness;

  beforeEach(() => { harness = makeHarness(); });

  it('accepts an owned Delivered order exactly at the inclusive deadline and replays once', async () => {
    const first = await harness.service.createCustomerRequest('customer-1', validRequest());
    const second = await harness.service.createCustomerRequest('customer-1', validRequest());
    assert.equal(first.status, 'Submitted');
    assert.equal(second.id, first.id);
    assert.equal(second.idempotentReplay, true);
    assert.equal(harness.state.cases.length, 1);
    assert.equal(harness.state.lines[0].requestedQuantity, 2);
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

  it('blocks a second after-sales case through the shared order lock', async () => {
    await harness.repository.claimOrderLock({
      orderId: 'order-1', caseType: 'RETURN_REFUND', caseId: 'return-1',
    });
    await assert.rejects(
      harness.service.createCustomerRequest('customer-1', validRequest()),
      /active after-sales case/i
    );
    assert.equal(harness.state.cases.length, 0);
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

  it('records mutually exclusive sellable, damaged, and rejected Inventory lineage per physical unit', async () => {
    harness.state.inventories[0].stockQuantity = 3;
    harness.state.products[0].stockQuantity = 3;
    const request = await harness.service.createCustomerRequest('customer-1', validRequest({
      idempotencyKey: 'exchange-unit-lineage-0001',
      lines: [{ orderDetailId: 'line-1', quantity: 3 }],
    }));
    await harness.service.decideRequest('staff-1', request.id, {
      idempotencyKey: 'decision-unit-lineage-0001',
      decision: 'APPROVE', responsibility: 'SHOP_FAULT', reason: 'Lá»—i Shop',
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
        inspectionReason: 'Má»™t sáº£n pháº©m Ä‘á»§ Ä‘iá»u kiá»‡n, má»™t sáº£n pháº©m hÆ° há»ng',
        rejectionReason: 'Sáº£n pháº©m cÃ²n láº¡i khÃ´ng Ä‘á»§ Ä‘iá»u kiá»‡n Ä‘á»•i',
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

    harness.state.inventories[0].stockQuantity = 2;
    harness.state.products[0].stockQuantity = 2;
    const resent = await harness.service.resendReplacement('staff-1', request.id, {
      idempotencyKey: 'resend-command-0001',
      incidentShipmentId: outbound.shipment._id,
      carrierName: 'Viettel Post',
      trackingCode: 'VTP-RESEND-001',
      shippedAt: harness.now,
    });
    assert.equal(resent.request.status, 'ReplacementShipped');
    assert.equal(harness.state.shipments.length, 2);
    assert.equal(harness.state.inventories[0].stockQuantity, 0);

    await harness.service.recordCarrierShipmentEvent(resent.shipment._id, {
      eventId: 'carrier-resend-lost-0001',
      eventType: 'LOST',
      occurredAt: harness.now,
      evidenceReference: 'carrier-proof-resend-lost-001',
    });
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
    assert.equal(resent.request.status, 'ReplacementShipped');
    assert.equal(resent.request.waitingFor, '');
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

  it('keeps a multi-line delivery incident visible when another outbound shipment is created', async () => {
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
    await harness.service.createOutboundShipment('warehouse-1', request.id, {
      idempotencyKey: 'shipment-multiline-two-0001',
      exchangeLineId: caseLines[1]._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 1,
      carrierName: 'GHN',
      trackingCode: 'TRACK-MULTILINE-TWO',
      shippedAt: harness.now,
    });
    assert.equal(harness.state.cases.find((item) => item._id === request.id).status, 'DeliveryIncident');
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
