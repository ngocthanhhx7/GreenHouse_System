const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { describe, it } = require('node:test');

function loadFactory() {
  const servicePath = join(__dirname, 'fulfillment.service.js');
  assert.ok(existsSync(servicePath), 'fulfillment.service.js is required');
  return require(servicePath).createFulfillmentService;
}

function createHarness({ paymentMethod = 'ONLINE', paymentStatus = 'Paid' } = {}) {
  const state = {
    order: {
      _id: 'order-1',
      orderCode: 'GH-004-1',
      customerId: 'customer-1',
      orderStatus: 'Confirmed',
      paymentMethod,
      paymentStatus,
      totalAmount: 100,
      codExpectedAmount: paymentMethod === 'COD' ? 100 : null,
      shippingFee: 0,
      shippingAddress: '1 Green Street',
      receiverName: 'Green Customer',
      receiverPhone: '0901234567',
      moneyObligationsSettled: true,
    },
    details: [
      { _id: 'detail-1', orderId: 'order-1', productId: 'product-1', quantity: 2 },
      { _id: 'detail-2', orderId: 'order-1', productId: 'product-2', quantity: 1 },
    ],
    cycles: [{
      _id: 'cycle-1',
      cycleKey: 'fulfillment:order-1:1',
      orderId: 'order-1',
      cycleNumber: 1,
      cycleType: 'Initial',
      status: 'Exported',
    }],
    exports: [{
      _id: 'export-1',
      orderId: 'order-1',
      cycleId: 'cycle-1',
      requestKind: 'Initial',
      status: 'Completed',
    }],
    packingRecords: [],
    shipments: [],
    events: [],
    destinations: [],
    discrepancies: [],
    incidents: [],
    receipts: [],
    inventories: [
      {
        _id: 'inventory-1',
        productId: 'product-1',
        stockQuantity: 5,
        sellableQuantity: 5,
        reservedQuantity: 0,
        damagedQuantity: 0,
        inventoryHealth: 'Normal',
      },
      {
        _id: 'inventory-2',
        productId: 'product-2',
        stockQuantity: 4,
        sellableQuantity: 4,
        reservedQuantity: 0,
        damagedQuantity: 0,
        inventoryHealth: 'Normal',
      },
    ],
    inventoryTransactions: [],
    reservations: [],
    refunds: [],
    refundRequests: [],
    codEvidence: [],
    payment: {
      _id: 'payment-1',
      orderId: 'order-1',
      paymentMethod,
      paymentStatus,
      paidAt: paymentStatus === 'Paid' ? new Date('2026-07-01T00:00:00.000Z') : null,
    },
    attempts: [{
      _id: 'attempt-1',
      orderId: 'order-1',
      paymentMethod,
      paymentStatus,
      amount: 100,
      paidAt: paymentStatus === 'Paid' ? new Date('2026-07-01T00:00:00.000Z') : null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    }],
    outbox: [],
    audits: [],
  };
  const auditControl = { failNext: false };
  const raceControl = {
    packing: false,
    shipment: false,
    event: false,
    receipt: false,
    destination: false,
  };
  const raceWinners = {
    packing: null,
    shipment: null,
    event: null,
    receipt: null,
    destination: null,
  };

  function duplicateKeyError() {
    const error = new Error('E11000 duplicate key');
    error.code = 11000;
    return error;
  }

  function makeId(prefix, entries) {
    return `${prefix}-${entries.length + 1}`;
  }

  function restore(snapshot) {
    for (const key of Object.keys(state)) {
      if (Array.isArray(state[key])) state[key].splice(0, state[key].length, ...snapshot[key]);
      else state[key] = snapshot[key];
    }
  }

  const repository = {
    state,
    async findOrderById(id) { return id === state.order._id ? state.order : null; },
    async listOrderDetails() { return state.details; },
    async findActiveCycleByOrder() { return state.cycles.at(-1) || null; },
    async findCycleById(id) { return state.cycles.find((entry) => entry._id === id) || null; },
    async listCyclesByOrder() { return state.cycles; },
    async updateCycle(id, patch) {
      const cycle = state.cycles.find((entry) => entry._id === id);
      if (!cycle) return null;
      Object.assign(cycle, patch);
      return cycle;
    },
    async findCompletedExportByCycle(cycleId) {
      return state.exports.find((entry) => entry.cycleId === cycleId && entry.status === 'Completed') || null;
    },
    async findPackingByCommandKey(commandKey) {
      return state.packingRecords.find((entry) => entry.commandKey === commandKey)
        || (raceWinners.packing?.commandKey === commandKey ? raceWinners.packing : null);
    },
    async findCompletedPackingByCycle(cycleId) {
      return state.packingRecords.find((entry) => entry.cycleId === cycleId && entry.status === 'Completed') || null;
    },
    async createPackingRecord(data) {
      if (raceControl.packing) {
        raceControl.packing = false;
        raceWinners.packing = { _id: 'race-packing', ...data };
        throw duplicateKeyError();
      }
      const record = { _id: makeId('packing', state.packingRecords), ...data };
      state.packingRecords.push(record);
      return record;
    },
    async claimOrderState(id, expectedStatus, patch) {
      if (id !== state.order._id || state.order.orderStatus !== expectedStatus) return null;
      Object.assign(state.order, patch);
      return state.order;
    },
    async findDestinationByKey(versionKey) {
      return state.destinations.find((entry) => entry.versionKey === versionKey)
        || (raceWinners.destination?.versionKey === versionKey ? raceWinners.destination : null);
    },
    async listDestinationVersions(cycleId) {
      return state.destinations.filter((entry) => entry.cycleId === cycleId);
    },
    async createDestinationVersion(data) {
      if (raceControl.destination) {
        raceControl.destination = false;
        raceWinners.destination = { _id: 'race-destination', ...data };
        throw duplicateKeyError();
      }
      const version = { _id: makeId('destination', state.destinations), ...data };
      state.destinations.push(version);
      return version;
    },
    async findShipmentByCommandKey(commandKey) {
      return state.shipments.find((entry) => entry.commandKey === commandKey)
        || (raceWinners.shipment?.commandKey === commandKey ? raceWinners.shipment : null);
    },
    async findShipmentById(id) {
      return state.shipments.find((entry) => entry._id === id) || null;
    },
    async findShipmentByCycle(cycleId) {
      return state.shipments.find((entry) => entry.cycleId === cycleId) || null;
    },
    async listShipmentsAwaitingReturnedReceipt() {
      return state.shipments.filter(
        (entry) => entry.status === 'ReturnedToShop'
          && !state.receipts.some((receipt) => receipt.shipmentId === entry._id),
      );
    },
    async createShipment(data) {
      if (raceControl.shipment) {
        raceControl.shipment = false;
        raceWinners.shipment = { _id: 'race-shipment', status: 'HandedOff', ...data };
        throw duplicateKeyError();
      }
      const shipment = { _id: makeId('shipment', state.shipments), status: 'HandedOff', ...data };
      state.shipments.push(shipment);
      return shipment;
    },
    async updateShipment(id, patch) {
      const shipment = state.shipments.find((entry) => entry._id === id);
      if (!shipment) return null;
      Object.assign(shipment, patch);
      return shipment;
    },
    async findEventByKey(eventKey) {
      return state.events.find((entry) => entry.eventKey === eventKey)
        || (raceWinners.event?.eventKey === eventKey ? raceWinners.event : null);
    },
    async findEventById(id) {
      return state.events.find((entry) => entry._id === id) || null;
    },
    async listShipmentEvents(shipmentId) {
      return state.events.filter((entry) => entry.shipmentId === shipmentId);
    },
    async createShipmentEvent(data) {
      if (raceControl.event) {
        raceControl.event = false;
        raceWinners.event = { _id: 'race-event', ...data };
        throw duplicateKeyError();
      }
      const event = { _id: makeId('event', state.events), ...data };
      state.events.push(event);
      return event;
    },
    async createOutbox(data) {
      const existing = state.outbox.find((entry) => entry.identityKey === data.identityKey);
      if (existing) return existing;
      const outbox = { _id: makeId('outbox', state.outbox), ...data };
      state.outbox.push(outbox);
      return outbox;
    },
    async findCodDiscrepancyByOrder() { return state.discrepancies[0] || null; },
    async upsertCodDiscrepancy(data) {
      if (state.discrepancies[0]) return state.discrepancies[0];
      const discrepancy = { _id: 'discrepancy-1', ...data };
      state.discrepancies.push(discrepancy);
      return discrepancy;
    },
    async createCodEvidence(data) {
      const evidence = { _id: makeId('cod-evidence', state.codEvidence), ...data };
      state.codEvidence.push(evidence);
      return evidence;
    },
    async findPaymentByOrderId() { return state.payment; },
    async updatePayment(id, patch) {
      if (id !== state.payment._id) return null;
      Object.assign(state.payment, patch);
      return state.payment;
    },
    async findPrimaryPaymentAttemptByOrder() { return state.attempts.at(-1) || null; },
    async findPrimaryPaidPaymentAttemptByOrder() {
      return state.attempts
        .filter((entry) => entry.paymentStatus === 'Paid')
        .sort((a, b) => new Date(a.paidAt || a.createdAt) - new Date(b.paidAt || b.createdAt))[0] || null;
    },
    async updatePaymentAttempt(id, patch) {
      const attempt = state.attempts.find((entry) => entry._id === id);
      if (!attempt) return null;
      Object.assign(attempt, patch);
      return attempt;
    },
    async findIncidentBySourceEvent(sourceEventId) {
      return state.incidents.find((entry) => entry.sourceEventId === sourceEventId) || null;
    },
    async findIncidentById(id) {
      return state.incidents.find((entry) => entry._id === id) || null;
    },
    async findIncidentByShipment(shipmentId) {
      return state.incidents.find((entry) => (
        entry.shipmentId === shipmentId && entry.incidentType === 'ReturnedToShop'
      )) || null;
    },
    async listIncidentsByOrder(orderId) {
      return state.incidents.filter((entry) => entry.orderId === orderId);
    },
    async createIncident(data) {
      const incident = { _id: makeId('incident', state.incidents), ...data };
      state.incidents.push(incident);
      return incident;
    },
    async updateIncident(id, patch) {
      const incident = state.incidents.find((entry) => entry._id === id);
      if (!incident) return null;
      Object.assign(incident, patch);
      return incident;
    },
    async findReceiptByKey(receiptKey) {
      return state.receipts.find((entry) => entry.receiptKey === receiptKey)
        || (raceWinners.receipt?.receiptKey === receiptKey ? raceWinners.receipt : null);
    },
    async findReceiptByShipment(shipmentId) {
      return state.receipts.find((entry) => entry.shipmentId === shipmentId) || null;
    },
    async createReturnedReceipt(data) {
      if (raceControl.receipt) {
        raceControl.receipt = false;
        raceWinners.receipt = { _id: 'race-receipt', ...data };
        throw duplicateKeyError();
      }
      const receipt = { _id: makeId('receipt', state.receipts), ...data };
      state.receipts.push(receipt);
      return receipt;
    },
    async findInventoryByProductId(productId) {
      return state.inventories.find((entry) => entry.productId === productId) || null;
    },
    async addReturnedInventory(id, sellable, damaged) {
      const inventory = state.inventories.find((entry) => entry._id === id);
      if (!inventory) return null;
      inventory.sellableQuantity += sellable;
      inventory.stockQuantity += sellable;
      inventory.damagedQuantity += damaged;
      return inventory;
    },
    async reserveInventory(productId, quantity) {
      const inventory = state.inventories.find(
        (entry) => entry.productId === productId
          && entry.inventoryHealth === 'Normal'
          && entry.sellableQuantity - entry.reservedQuantity >= quantity,
      );
      if (!inventory) return null;
      inventory.reservedQuantity += quantity;
      return inventory;
    },
    async createInventoryTransaction(data) {
      const transaction = { _id: makeId('movement', state.inventoryTransactions), ...data };
      state.inventoryTransactions.push(transaction);
      return transaction;
    },
    async createOrderReservation(data) {
      const reservation = { _id: makeId('reservation', state.reservations), ...data };
      state.reservations.push(reservation);
      return reservation;
    },
    async createFulfillmentCycle(data) {
      const cycle = { _id: makeId('cycle', state.cycles), ...data };
      state.cycles.push(cycle);
      return cycle;
    },
    async createStockExportRequest(data) {
      const request = { _id: makeId('export', state.exports), ...data };
      state.exports.push(request);
      return request;
    },
    async upsertRefundPending(data) {
      let refund = state.refunds.find((entry) => entry.obligationKey === data.obligationKey);
      if (!refund) {
        refund = { _id: makeId('refund', state.refunds), ...data };
        state.refunds.push(refund);
      }
      return refund;
    },
    async findRefundPendingByObligationKey(obligationKey) {
      return state.refunds.find((entry) => entry.obligationKey === obligationKey) || null;
    },
    async upsertRefundRequest(data) {
      let request = state.refundRequests.find((entry) => entry.obligationKey === data.obligationKey);
      if (!request) {
        request = { _id: makeId('refund-request', state.refundRequests), ...data };
        state.refundRequests.push(request);
      }
      return request;
    },
    async findRefundRequestByObligationKey(obligationKey) {
      return state.refundRequests.find((entry) => entry.obligationKey === obligationKey) || null;
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

  const createFulfillmentService = loadFactory();
  const service = createFulfillmentService({
    repository,
    transactionManager,
    auditLogger: {
      async log(entry) {
        if (auditControl.failNext) {
          auditControl.failNext = false;
          throw new Error('injected audit write failure');
        }
        state.audits.push(structuredClone(entry));
      },
    },
    assignmentCoordinator: { async coordinate() {} },
    clock: () => new Date('2026-07-24T08:00:00.000Z'),
  });

  async function packExact(commandKey = 'packing-command-0001') {
    return service.confirmPacking('staff-1', 'order-1', {
      idempotencyKey: commandKey,
      items: [
        { orderDetailId: 'detail-1', checkedQuantity: 2, checked: true },
        { orderDetailId: 'detail-2', checkedQuantity: 1, checked: true },
      ],
      note: 'Exact physical checklist',
    });
  }

  async function handoff(commandKey = 'handoff-command-0001') {
    if (state.order.orderStatus === 'Confirmed') await packExact();
    return service.recordHandoff('staff-1', 'order-1', {
      idempotencyKey: commandKey,
      carrierName: 'External Green Carrier',
      trackingReference: 'TRACK-004-1',
      handedOffAt: '2026-07-24T09:00:00.000Z',
      evidenceReference: 'handoff-photo-1',
    });
  }

  return { service, state, packExact, handoff, auditControl, raceControl, raceWinners };
}

describe('SL-004 packing, shipment and delivery behavior', () => {
  it('AT-062 packs only an exact completed export checklist and records mismatch without changing Order', async () => {
    const exact = createHarness();
    const packed = await exact.packExact();
    assert.equal(packed.packingRecord.status, 'Completed');
    assert.equal(exact.state.order.orderStatus, 'Packed');
    assert.equal(exact.state.outbox.length, 0);

    const mismatch = createHarness();
    const result = await mismatch.service.confirmPacking('staff-1', 'order-1', {
      idempotencyKey: 'packing-command-mismatch',
      items: [
        { orderDetailId: 'detail-1', checkedQuantity: 1, checked: true },
        { orderDetailId: 'detail-2', checkedQuantity: 1, checked: true },
      ],
    });
    assert.equal(result.packingRecord.status, 'Discrepancy');
    assert.equal(mismatch.state.order.orderStatus, 'Confirmed');
  });

  it('AT-063 validates every handoff field and creates one Shipment + Shipped event atomically', async () => {
    const { service, state, packExact } = createHarness();
    await packExact();
    await assert.rejects(
      service.recordHandoff('staff-1', 'order-1', {
        idempotencyKey: 'handoff-command-invalid',
        carrierName: '',
      }),
      (error) => error.errorCode === 'HANDOFF_VALIDATION_FAILED'
        && error.errors.some((entry) => entry.field === 'trackingReference'),
    );
    assert.equal(state.order.orderStatus, 'Packed');
    assert.equal(state.shipments.length, 0);

    const result = await service.recordHandoff('staff-1', 'order-1', {
      idempotencyKey: 'handoff-command-valid',
      carrierName: 'External Green Carrier',
      trackingReference: 'TRACK-004-1',
      handedOffAt: '2026-07-24T09:00:00.000Z',
      evidenceReference: 'handoff-photo-1',
    });
    assert.equal(result.shipment.status, 'HandedOff');
    assert.equal(state.order.orderStatus, 'Shipped');
    const shippedEvent = state.outbox.find((entry) => entry.eventType === 'ORDER_SHIPPED');
    assert.ok(shippedEvent);
    assert.equal(shippedEvent.payloadSchemaVersion, 1);
    assert.equal(shippedEvent.payload.recipientId, 'customer-1');
    assert.equal(shippedEvent.payload.displayValues.orderCode, 'GH-004-1');
    assert.equal(shippedEvent.aggregateType, 'Shipment');
    assert.match(shippedEvent.eventHash, /^[a-f0-9]{64}$/);
  });

  it('AT-064 appends delivery, dispute and correction while never shortening published deadlines', async () => {
    const { service, state, handoff } = createHarness();
    const { shipment } = await handoff();
    const delivered = await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      shipment._id,
      {
        eventKey: 'delivery-event-0001',
        eventType: 'DELIVERED',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-24T10:00:00.000Z',
        evidenceReference: 'carrier-proof-1',
      },
    );
    assert.equal(state.order.orderStatus, 'Delivered');
    assert.equal(state.order.returnDeadlineAt.toISOString(), '2026-07-29T10:00:00.000Z');
    const deliveredEvent = state.outbox.find((entry) => entry.eventType === 'ORDER_DELIVERED');
    assert.ok(deliveredEvent);
    assert.equal(deliveredEvent.payloadSchemaVersion, 1);
    assert.equal(deliveredEvent.payload.recipientId, 'customer-1');
    const publishedDeadline = state.order.returnDeadlineAt;

    const dispute = await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      shipment._id,
      {
        eventKey: 'delivery-dispute-0001',
        eventType: 'DISPUTED',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-24T11:00:00.000Z',
        evidenceReference: 'support-case-1',
        replacesEventId: delivered.event._id,
      },
    );
    await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      shipment._id,
      {
        eventKey: 'delivery-correction-0001',
        eventType: 'CORRECTION',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-24T09:30:00.000Z',
        evidenceReference: 'carrier-correction-1',
        replacesEventId: delivered.event._id,
      },
    );
    assert.equal(dispute.event.eventType, 'DISPUTED');
    assert.equal(state.events.length, 4);
    assert.equal(state.order.returnDeadlineAt, publishedDeadline);
  });

  it('P1 establishes CompletedSaleAt from physical delivery for ONLINE Paid and actual collection for COD', async () => {
    const online = createHarness({ paymentMethod: 'ONLINE', paymentStatus: 'Paid' });
    const onlineHandoff = await online.handoff();
    await online.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      onlineHandoff.shipment._id,
      {
        eventKey: 'online-delivery-completed-sale',
        eventType: 'DELIVERED',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-24T10:00:00.000Z',
        evidenceReference: 'online-delivery-proof',
      },
    );
    assert.equal(
      online.state.order.completedSaleAt.toISOString(),
      '2026-07-24T10:00:00.000Z',
    );

    const cod = createHarness({ paymentMethod: 'COD', paymentStatus: 'Unpaid' });
    const codHandoff = await cod.handoff();
    await cod.service.recordShipmentEvent(
      { actorType: 'Carrier', actorId: null },
      codHandoff.shipment._id,
      {
        eventKey: 'cod-later-collection-completed-sale',
        eventType: 'DELIVERED',
        source: 'CARRIER',
        occurredAt: '2026-07-24T10:00:00.000Z',
        evidenceReference: 'cod-later-delivery-proof',
        customerCollectionEvidence: {
          eventId: 'cod-later-collection',
          customerCollectedAmount: 100,
          collectionTiming: 'AFTER_DELIVERY',
          occurredAt: '2026-07-24T13:00:00.000Z',
          evidenceReference: 'cod-later-cash-proof',
        },
      },
    );
    assert.equal(
      cod.state.order.completedSaleAt.toISOString(),
      '2026-07-24T13:00:00.000Z',
    );
  });

  it('AT-065/066 commits full COD collection with delivery or opens one explicit discrepancy', async () => {
    const full = createHarness({ paymentMethod: 'COD', paymentStatus: 'Unpaid' });
    const { shipment } = await full.handoff();
    await full.service.recordShipmentEvent(
      { actorType: 'Carrier', actorId: null },
      shipment._id,
      {
        eventKey: 'cod-delivery-full',
        eventType: 'DELIVERED',
        source: 'CARRIER',
        occurredAt: '2026-07-24T10:00:00.000Z',
        evidenceReference: 'carrier-delivery-full',
        customerCollectionEvidence: {
          eventId: 'cod-collection-full',
          customerCollectedAmount: 100,
          collectionTiming: 'AT_DELIVERY',
          evidenceReference: 'carrier-cash-proof',
        },
      },
    );
    assert.equal(full.state.order.paymentStatus, 'Paid');
    assert.equal(full.state.order.completedSaleAt.toISOString(), '2026-07-24T10:00:00.000Z');
    assert.equal(full.state.discrepancies.length, 0);

    const unknown = createHarness({ paymentMethod: 'COD', paymentStatus: 'Unpaid' });
    const unknownHandoff = await unknown.handoff();
    await unknown.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      unknownHandoff.shipment._id,
      {
        eventKey: 'cod-delivery-unknown',
        eventType: 'DELIVERED',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-24T10:00:00.000Z',
        evidenceReference: 'tracking-delivered-only',
      },
    );
    assert.equal(unknown.state.order.orderStatus, 'Delivered');
    assert.equal(unknown.state.order.paymentStatus, 'Unpaid');
    assert.equal(unknown.state.discrepancies.length, 1);
    assert.equal(unknown.state.discrepancies[0].status, 'Open');
  });

  it('AT-067 appends every failed attempt, keeps Order Shipped and deduplicates its durable event', async () => {
    const { service, state, handoff } = createHarness();
    const { shipment } = await handoff();
    const input = {
      eventKey: 'attempt-failed-0001',
      eventType: 'ATTEMPT_FAILED',
      source: 'STAFF_EVIDENCE',
      occurredAt: '2026-07-24T10:00:00.000Z',
      evidenceReference: 'carrier-attempt-proof',
      reason: 'Receiver unavailable',
    };
    await service.recordShipmentEvent({ actorType: 'Staff', actorId: 'staff-1' }, shipment._id, input);
    const replay = await service.recordShipmentEvent({ actorType: 'Staff', actorId: 'staff-1' }, shipment._id, input);
    assert.equal(state.order.orderStatus, 'Shipped');
    assert.equal(state.events.filter((entry) => entry.eventType === 'ATTEMPT_FAILED').length, 1);
    assert.equal(state.outbox.filter((entry) => entry.eventType === 'DELIVERY_ATTEMPT_FAILED').length, 1);
    assert.equal(replay.idempotentReplay, true);
  });

  it('P1 binds Staff shipment evidence to Staff source and rejects caller-selected trust domains', async () => {
    const { service, state, handoff } = createHarness({ paymentMethod: 'COD', paymentStatus: 'Unpaid' });
    const { shipment } = await handoff();
    await assert.rejects(
      service.recordShipmentEvent(
        { actorType: 'Staff', actorId: 'staff-1' },
        shipment._id,
        {
          eventKey: 'staff-spoofed-carrier-source',
          eventType: 'DELIVERED',
          source: 'CARRIER',
          occurredAt: '2026-07-24T10:00:00.000Z',
          evidenceReference: 'staff-cannot-sign-for-carrier',
          customerCollectionEvidence: {
            eventId: 'staff-spoofed-cash',
            customerCollectedAmount: 100,
            collectionTiming: 'AT_DELIVERY',
            evidenceReference: 'staff-spoofed-cash-proof',
          },
        },
      ),
      /Staff.*STAFF_EVIDENCE|source.*Staff/i,
    );
    assert.equal(state.order.orderStatus, 'Shipped');
    assert.equal(state.order.paymentStatus, 'Unpaid');
    assert.equal(state.codEvidence.length, 0);
    await assert.rejects(
      service.recordShipmentEvent(
        { actorType: 'Staff', actorId: 'staff-1' },
        shipment._id,
        {
          eventKey: 'staff-spoofed-cod-evidence',
          eventType: 'DELIVERED',
          source: 'STAFF_EVIDENCE',
          occurredAt: '2026-07-24T10:00:00.000Z',
          evidenceReference: 'staff-delivery-observation',
          customerCollectionEvidence: {
            eventId: 'staff-spoofed-cod-collection',
            customerCollectedAmount: 100,
            collectionTiming: 'AT_DELIVERY',
            evidenceReference: 'staff-cannot-attest-cash',
          },
        },
      ),
      /signed Carrier.*collection|collection.*Carrier/i,
    );
    assert.equal(state.order.orderStatus, 'Shipped');
    assert.equal(state.codEvidence.length, 0);
  });

  it('AT-068 records return custody without stock, then requires complete atomic Warehouse classification', async () => {
    const { service, state, handoff } = createHarness();
    const { shipment } = await handoff();
    const returned = await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      shipment._id,
      {
        eventKey: 'returned-to-shop-0001',
        eventType: 'RETURNED_TO_SHOP',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'carrier-return-proof',
      },
    );
    assert.equal(state.order.orderStatus, 'Shipped');
    assert.equal(returned.incident.incidentType, 'ReturnedToShop');
    assert.equal(state.incidents.length, 1);
    assert.deepEqual(state.inventories.map((entry) => entry.sellableQuantity), [5, 4]);

    await assert.rejects(
      service.chooseIncidentResolution(
        'customer-1',
        'order-1',
        returned.incident._id,
        { idempotencyKey: 'premature-returned-resend', choice: 'Resend' },
      ),
      (error) => error.errorCode === 'RETURNED_PARCEL_RECEIPT_REQUIRED',
    );
    assert.equal(state.reservations.length, 0);
    assert.equal(returned.incident.status, 'AwaitingWarehouseReceipt');
    let projection = await service.getCustomerFulfillment('customer-1', 'order-1');
    assert.deepEqual(projection.incidents[0].availableChoices, []);

    await assert.rejects(
      service.recordReturnedReceipt('warehouse-1', shipment._id, {
        idempotencyKey: 'receipt-command-invalid',
        receivedAt: '2026-07-25T12:00:00.000Z',
        evidenceReference: 'warehouse-receipt-photo',
        items: [{ orderDetailId: 'detail-1', receivedQuantity: 2, sellableQuantity: 2, damagedQuantity: 0 }],
      }),
      /every order line/i,
    );
    assert.equal(state.receipts.length, 0);

    const result = await service.recordReturnedReceipt('warehouse-1', shipment._id, {
      idempotencyKey: 'receipt-command-valid',
      receivedAt: '2026-07-25T12:00:00.000Z',
      evidenceReference: 'warehouse-receipt-photo',
      items: [
        { orderDetailId: 'detail-1', receivedQuantity: 2, sellableQuantity: 1, damagedQuantity: 1 },
        { orderDetailId: 'detail-2', receivedQuantity: 1, sellableQuantity: 1, damagedQuantity: 0 },
      ],
    });
    assert.equal(result.receipt.items.length, 2);
    assert.equal(state.incidents[0].status, 'AwaitingCustomerChoice');
    projection = await service.getCustomerFulfillment('customer-1', 'order-1');
    assert.deepEqual(
      projection.incidents[0].availableChoices,
      ['Resend', 'TerminalRefund'],
    );
    assert.deepEqual(state.inventories.map((entry) => [entry.sellableQuantity, entry.damagedQuantity]), [[6, 1], [5, 0]]);
    assert.equal(state.inventoryTransactions.length, 3);

    await service.chooseIncidentResolution(
      'customer-1',
      'order-1',
      returned.incident._id,
      { idempotencyKey: 'returned-terminal-choice', choice: 'TerminalRefund' },
    );
    const terminal = await service.resolveDeliveryFailure('staff-1', 'order-1', {
      idempotencyKey: 'returned-terminal-resolution',
      incidentId: returned.incident._id,
    });
    assert.equal(terminal.order.orderStatus, 'DeliveryFailed');
  });

  it('AT-068 gives Warehouse a receipt queue with every exact order line and no completed receipts', async () => {
    const { service, state, handoff } = createHarness();
    const { shipment } = await handoff();
    await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      shipment._id,
      {
        eventKey: 'returned-queue-event-0001',
        eventType: 'RETURNED_TO_SHOP',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'returned-queue-proof',
      },
    );

    const beforeReceipt = await service.listReturnedParcels();
    assert.equal(beforeReceipt.items.length, 1);
    assert.equal(beforeReceipt.items[0].shipmentId, shipment._id);
    assert.equal(beforeReceipt.items[0].orderCode, state.order.orderCode);
    assert.deepEqual(
      beforeReceipt.items[0].lines.map((line) => [line.orderDetailId, line.expectedQuantity]),
      [['detail-1', 2], ['detail-2', 1]],
    );

    await service.recordReturnedReceipt('warehouse-1', shipment._id, {
      idempotencyKey: 'receipt-queue-command-0001',
      receivedAt: '2026-07-25T11:00:00.000Z',
      evidenceReference: 'warehouse-receipt-proof',
      items: [
        { orderDetailId: 'detail-1', receivedQuantity: 2, sellableQuantity: 1, damagedQuantity: 1 },
        { orderDetailId: 'detail-2', receivedQuantity: 1, sellableQuantity: 1, damagedQuantity: 0 },
      ],
    });
    assert.equal((await service.listReturnedParcels()).items.length, 0);
  });

  it('AT-070 creates one same-Order exact resend cycle and reservation without a fee or new Order', async () => {
    const { service, state, handoff } = createHarness();
    const { shipment } = await handoff();
    const incidentResult = await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      shipment._id,
      {
        eventKey: 'lost-event-0001',
        eventType: 'LOST',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'carrier-lost-proof',
        irrecoverable: true,
      },
    );
    const resend = await service.chooseIncidentResolution(
      'customer-1',
      'order-1',
      incidentResult.incident._id,
      { idempotencyKey: 'resend-choice-0001', choice: 'Resend' },
    );
    assert.equal(resend.cycle.cycleType, 'Resend');
    assert.equal(resend.cycle.orderId, 'order-1');
    assert.equal(state.cycles.length, 2);
    assert.equal(state.exports.at(-1).requestKind, 'Resend');
    assert.equal(state.reservations.length, 2);
    assert.equal(state.order.shippingFee, 0);
  });

  it('P1 executes resend packing and handoff by cycle while preserving the original Shipped Order', async () => {
    const { service, state, handoff, packExact } = createHarness();
    const original = await handoff();
    const incidentResult = await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      original.shipment._id,
      {
        eventKey: 'lost-for-resend-lifecycle',
        eventType: 'LOST',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'carrier-lost-resend-lifecycle',
        irrecoverable: true,
      },
    );
    const resend = await service.chooseIncidentResolution(
      'customer-1',
      'order-1',
      incidentResult.incident._id,
      { idempotencyKey: 'resend-lifecycle-choice', choice: 'Resend' },
    );
    state.exports.at(-1).status = 'Completed';
    resend.cycle.status = 'Exported';

    const packed = await packExact('resend-packing-command');
    assert.equal(packed.packingRecord.cycleId, resend.cycle._id);
    assert.equal(resend.cycle.status, 'Packed');
    assert.equal(state.order.orderStatus, 'Shipped');

    const second = await service.recordHandoff('staff-1', 'order-1', {
      idempotencyKey: 'resend-handoff-command',
      carrierName: 'External Green Carrier',
      trackingReference: 'TRACK-004-RESEND',
      handedOffAt: '2026-07-26T09:00:00.000Z',
      evidenceReference: 'resend-handoff-photo',
    });
    assert.equal(second.shipment.cycleId, resend.cycle._id);
    assert.equal(state.shipments.length, 2);
    assert.equal(state.order.orderStatus, 'Shipped');
    assert.equal(original.shipment.status, 'Lost');

    await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      second.shipment._id,
      {
        eventKey: 'resend-delivered-event',
        eventType: 'DELIVERED',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-27T10:00:00.000Z',
        evidenceReference: 'resend-delivery-proof',
      },
    );
    assert.equal(state.order.orderStatus, 'Delivered');
    assert.equal(second.shipment.status, 'Delivered');
    assert.equal(original.shipment.status, 'Lost');
    assert.equal(resend.cycle.status, 'Delivered');
  });

  it('P1 permits Wait only when exact stock is unavailable', async () => {
    const { service, state, handoff } = createHarness();
    const original = await handoff();
    const incidentResult = await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      original.shipment._id,
      {
        eventKey: 'lost-for-wait-progression',
        eventType: 'LOST',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'lost-for-wait-proof',
        irrecoverable: true,
      },
    );

    await assert.rejects(
      service.chooseIncidentResolution(
        'customer-1',
        'order-1',
        incidentResult.incident._id,
        { idempotencyKey: 'wait-while-stock-available', choice: 'Wait' },
      ),
      (error) => error.errorCode === 'RESEND_STOCK_AVAILABLE',
    );
    assert.equal(incidentResult.incident.customerChoice || '', '');
  });

  it('P1 allows a WaitingForStock incident to progress once to a later final choice', async () => {
    const { service, state, handoff } = createHarness();
    const original = await handoff();
    const incidentResult = await service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      original.shipment._id,
      {
        eventKey: 'lost-for-later-choice',
        eventType: 'LOST',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'lost-for-later-choice-proof',
        irrecoverable: true,
      },
    );

    state.inventories[0].sellableQuantity = 1;
    const waiting = await service.chooseIncidentResolution(
      'customer-1',
      'order-1',
      incidentResult.incident._id,
      { idempotencyKey: 'wait-while-unavailable', choice: 'Wait' },
    );
    assert.equal(waiting.incident.status, 'WaitingForStock');
    assert.equal(state.cycles.length, 1);
    let projection = await service.getCustomerFulfillment('customer-1', 'order-1');
    assert.deepEqual(projection.incidents[0].availableChoices, ['TerminalRefund']);

    state.inventories[0].sellableQuantity = 5;
    projection = await service.getCustomerFulfillment('customer-1', 'order-1');
    assert.deepEqual(
      projection.incidents[0].availableChoices,
      ['Resend', 'TerminalRefund'],
    );
    const resend = await service.chooseIncidentResolution(
      'customer-1',
      'order-1',
      incidentResult.incident._id,
      { idempotencyKey: 'resend-after-wait', choice: 'Resend' },
    );
    assert.equal(resend.cycle.cycleType, 'Resend');
    assert.equal(state.cycles.length, 2);

    await assert.rejects(
      service.chooseIncidentResolution(
        'customer-1',
        'order-1',
        incidentResult.incident._id,
        { idempotencyKey: 'duplicate-cycle-after-wait', choice: 'Resend' },
      ),
      /already recorded/i,
    );
    assert.equal(state.cycles.length, 2);
  });

  it('AT-069/071 resolves receipt or irrecoverable incident to DeliveryFailed with independent money result', async () => {
    const paid = createHarness();
    const { shipment } = await paid.handoff();
    const incidentResult = await paid.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      shipment._id,
      {
        eventKey: 'damaged-event-0001',
        eventType: 'DAMAGED',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'carrier-damage-proof',
        irrecoverable: true,
      },
    );
    await paid.service.chooseIncidentResolution(
      'customer-1',
      'order-1',
      incidentResult.incident._id,
      { idempotencyKey: 'terminal-choice-0001', choice: 'TerminalRefund' },
    );
    const result = await paid.service.resolveDeliveryFailure('staff-1', 'order-1', {
      idempotencyKey: 'terminal-resolution-0001',
      incidentId: incidentResult.incident._id,
      note: 'Customer selected terminal resolution',
    });
    assert.equal(result.order.orderStatus, 'DeliveryFailed');
    assert.equal(result.order.paymentStatus, 'Paid');
    assert.equal(result.refund.amount, 100);
    assert.match(result.refund.obligationKey, /^FAILED_DELIVERY:/);
    assert.equal(result.order.moneyObligationsSettled, false);
    const replay = await paid.service.resolveDeliveryFailure('staff-1', 'order-1', {
      idempotencyKey: 'terminal-resolution-0001',
      incidentId: incidentResult.incident._id,
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.refund._id, result.refund._id);
    assert.equal(replay.refundRequest._id, result.refundRequest._id);

    const cod = createHarness({ paymentMethod: 'COD', paymentStatus: 'Unpaid' });
    const codShipment = await cod.handoff();
    const codIncident = await cod.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      codShipment.shipment._id,
      {
        eventKey: 'lost-cod-event-0001',
        eventType: 'LOST',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'carrier-lost-cod-proof',
        irrecoverable: true,
      },
    );
    await cod.service.chooseIncidentResolution(
      'customer-1',
      'order-1',
      codIncident.incident._id,
      { idempotencyKey: 'terminal-cod-choice', choice: 'TerminalRefund' },
    );
    const codResult = await cod.service.resolveDeliveryFailure('staff-1', 'order-1', {
      idempotencyKey: 'terminal-cod-resolution',
      incidentId: codIncident.incident._id,
    });
    assert.equal(codResult.order.paymentStatus, 'Cancelled');
    assert.equal(codResult.refund, null);
  });

  it('P1 binds a failed-delivery refund to the earliest verified primary Paid attempt', async () => {
    const paid = createHarness();
    paid.state.attempts.push({
      _id: 'attempt-excess',
      orderId: 'order-1',
      paymentMethod: 'ONLINE',
      paymentStatus: 'Paid',
      amount: 100,
      paidAt: new Date('2026-07-02T00:00:00.000Z'),
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
    });
    const { shipment } = await paid.handoff();
    const incidentResult = await paid.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      shipment._id,
      {
        eventKey: 'primary-attempt-lost-event',
        eventType: 'LOST',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'primary-attempt-lost-proof',
        irrecoverable: true,
      },
    );
    await paid.service.chooseIncidentResolution(
      'customer-1',
      'order-1',
      incidentResult.incident._id,
      { idempotencyKey: 'primary-attempt-terminal-choice', choice: 'TerminalRefund' },
    );

    const result = await paid.service.resolveDeliveryFailure('staff-1', 'order-1', {
      idempotencyKey: 'primary-attempt-terminal-resolution',
      incidentId: incidentResult.incident._id,
    });

    assert.equal(result.refund.paymentAttemptId, 'attempt-1');
    assert.match(result.refund.obligationKey, /attempt-1$/);
    assert.doesNotMatch(result.refund.obligationKey, /attempt-excess/);
  });

  it('AT-072 appends destination versions and requires Carrier acceptance after handoff', async () => {
    const { service, state, handoff } = createHarness();
    await service.addDestinationVersion(
      { actorType: 'Staff', actorId: 'staff-1' },
      'order-1',
      {
        idempotencyKey: 'destination-before-handoff',
        receiverName: 'Green Customer',
        receiverPhone: '0901234567',
        shippingAddress: '2 New Green Street',
        customerConfirmationReference: 'customer-message-1',
      },
    );
    await handoff();
    await assert.rejects(
      service.addDestinationVersion(
        { actorType: 'Staff', actorId: 'staff-1' },
        'order-1',
        {
          idempotencyKey: 'destination-after-invalid',
          receiverName: 'Green Customer',
          receiverPhone: '0901234567',
          shippingAddress: '3 Later Green Street',
          customerConfirmationReference: 'customer-message-2',
        },
      ),
      /Carrier acceptance/i,
    );
    await assert.rejects(
      service.addDestinationVersion(
        { actorType: 'Customer', actorId: 'customer-1' },
        'order-1',
        {
          idempotencyKey: 'destination-customer-spoofed-carrier',
          receiverName: 'Green Customer',
          receiverPhone: '0901234567',
          shippingAddress: '3 Spoofed Green Street',
          customerConfirmationReference: 'customer-message-spoofed',
          carrierAcceptanceReference: 'customer-cannot-attest-for-carrier',
        },
      ),
      /Staff.*Carrier acceptance/i,
    );
    await service.addDestinationVersion(
      { actorType: 'Staff', actorId: 'staff-1' },
      'order-1',
      {
        idempotencyKey: 'destination-after-valid',
        receiverName: 'Green Customer',
        receiverPhone: '0901234567',
        shippingAddress: '3 Later Green Street',
        customerConfirmationReference: 'customer-message-2',
        carrierAcceptanceReference: 'carrier-acceptance-1',
      },
    );
    assert.deepEqual(state.destinations.map((entry) => entry.version), [1, 2]);
    assert.equal(state.order.shippingAddress, '1 Green Street');
  });

  it('AT-074 returns the existing handoff and terminal outcomes without duplicate effects', async () => {
    const { service, state, handoff } = createHarness();
    const first = await handoff('handoff-command-replay');
    const replay = await handoff('handoff-command-replay');
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.shipment._id, first.shipment._id);
    assert.equal(state.shipments.length, 1);
    assert.equal(state.outbox.filter((entry) => entry.eventType === 'ORDER_SHIPPED').length, 1);
  });

  it('P1 rejects return/loss/damage after delivery and terminal resolution from a non-Shipped Order', async () => {
    const delivered = createHarness();
    const deliveredHandoff = await delivered.handoff();
    await delivered.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      deliveredHandoff.shipment._id,
      {
        eventKey: 'terminal-guard-delivered',
        eventType: 'DELIVERED',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-24T10:00:00.000Z',
        evidenceReference: 'delivery-before-invalid-terminal',
      },
    );
    for (const eventType of ['RETURNED_TO_SHOP', 'LOST', 'DAMAGED']) {
      await assert.rejects(
        delivered.service.recordShipmentEvent(
          { actorType: 'Staff', actorId: 'staff-1' },
          deliveredHandoff.shipment._id,
          {
            eventKey: `post-delivery-${eventType.toLowerCase()}`,
            eventType,
            source: 'STAFF_EVIDENCE',
            occurredAt: '2026-07-24T11:00:00.000Z',
            evidenceReference: 'invalid-post-delivery-terminal',
            irrecoverable: true,
          },
        ),
        /active Shipped|requires a Shipped order/i,
      );
    }
    assert.equal(delivered.state.order.orderStatus, 'Delivered');
    assert.equal(delivered.state.incidents.length, 0);

    const stale = createHarness();
    const staleHandoff = await stale.handoff();
    const lost = await stale.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      staleHandoff.shipment._id,
      {
        eventKey: 'stale-terminal-lost',
        eventType: 'LOST',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-24T10:00:00.000Z',
        evidenceReference: 'lost-before-stale-resolution',
        irrecoverable: true,
      },
    );
    await stale.service.chooseIncidentResolution(
      'customer-1',
      'order-1',
      lost.incident._id,
      { idempotencyKey: 'stale-terminal-choice', choice: 'TerminalRefund' },
    );
    stale.state.order.orderStatus = 'Delivered';
    await assert.rejects(
      stale.service.resolveDeliveryFailure('staff-1', 'order-1', {
        idempotencyKey: 'stale-terminal-resolution',
        incidentId: lost.incident._id,
      }),
      /requires a Shipped order/i,
    );
    assert.equal(stale.state.refunds.length, 0);
  });

  it('P1 rolls back each protected fulfillment command when its attributable Audit write fails and never audits a replay twice', async () => {
    const packing = createHarness();
    packing.auditControl.failNext = true;
    await assert.rejects(
      packing.packExact('packing-audit-rollback'),
      /injected audit write failure/,
    );
    assert.equal(packing.state.packingRecords.length, 0);
    assert.equal(packing.state.order.orderStatus, 'Confirmed');
    assert.equal(packing.state.audits.length, 0);

    const handoff = createHarness();
    await handoff.packExact('handoff-audit-prerequisite');
    const handoffAuditCount = handoff.state.audits.length;
    handoff.auditControl.failNext = true;
    await assert.rejects(
      handoff.service.recordHandoff('staff-1', 'order-1', {
        idempotencyKey: 'handoff-audit-rollback',
        carrierName: 'External Green Carrier',
        trackingReference: 'TRACK-AUDIT-HANDOFF',
        handedOffAt: '2026-07-24T09:00:00.000Z',
        evidenceReference: 'handoff-audit-proof',
      }),
      /injected audit write failure/,
    );
    assert.equal(handoff.state.shipments.length, 0);
    assert.equal(handoff.state.events.length, 0);
    assert.equal(handoff.state.outbox.length, 0);
    assert.equal(handoff.state.order.orderStatus, 'Packed');
    assert.equal(handoff.state.audits.length, handoffAuditCount);

    const receipt = createHarness();
    const receiptShipment = await receipt.handoff('receipt-audit-handoff');
    await receipt.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      receiptShipment.shipment._id,
      {
        eventKey: 'receipt-audit-returned-event',
        eventType: 'RETURNED_TO_SHOP',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'receipt-audit-returned-proof',
      },
    );
    const receiptInventory = structuredClone(receipt.state.inventories);
    const receiptAuditCount = receipt.state.audits.length;
    receipt.auditControl.failNext = true;
    await assert.rejects(
      receipt.service.recordReturnedReceipt('warehouse-1', receiptShipment.shipment._id, {
        idempotencyKey: 'receipt-audit-rollback',
        receivedAt: '2026-07-25T12:00:00.000Z',
        evidenceReference: 'receipt-audit-proof',
        items: [
          { orderDetailId: 'detail-1', receivedQuantity: 2, sellableQuantity: 1, damagedQuantity: 1 },
          { orderDetailId: 'detail-2', receivedQuantity: 1, sellableQuantity: 1, damagedQuantity: 0 },
        ],
      }),
      /injected audit write failure/,
    );
    assert.equal(receipt.state.receipts.length, 0);
    assert.equal(receipt.state.inventoryTransactions.length, 0);
    assert.deepEqual(receipt.state.inventories, receiptInventory);
    assert.equal(receipt.state.audits.length, receiptAuditCount);

    const shipmentEvent = createHarness();
    const eventShipment = await shipmentEvent.handoff('event-audit-handoff');
    const eventAuditCount = shipmentEvent.state.audits.length;
    shipmentEvent.auditControl.failNext = true;
    await assert.rejects(
      shipmentEvent.service.recordShipmentEvent(
        { actorType: 'Staff', actorId: 'staff-1' },
        eventShipment.shipment._id,
        {
          eventKey: 'event-audit-rollback',
          eventType: 'ATTEMPT_FAILED',
          source: 'STAFF_EVIDENCE',
          occurredAt: '2026-07-25T10:00:00.000Z',
          evidenceReference: 'event-audit-proof',
        },
      ),
      /injected audit write failure/,
    );
    assert.equal(shipmentEvent.state.events.length, 1);
    assert.equal(shipmentEvent.state.shipments[0].status, 'HandedOff');
    assert.equal(shipmentEvent.state.outbox.length, 1);
    assert.equal(shipmentEvent.state.audits.length, eventAuditCount);

    const choice = createHarness();
    const choiceShipment = await choice.handoff('choice-audit-handoff');
    const lost = await choice.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      choiceShipment.shipment._id,
      {
        eventKey: 'choice-audit-lost',
        eventType: 'LOST',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'choice-audit-proof',
        irrecoverable: true,
      },
    );
    const choiceAuditCount = choice.state.audits.length;
    choice.auditControl.failNext = true;
    await assert.rejects(
      choice.service.chooseIncidentResolution('customer-1', 'order-1', lost.incident._id, {
        idempotencyKey: 'choice-audit-rollback',
        choice: 'TerminalRefund',
      }),
      /injected audit write failure/,
    );
    assert.equal(choice.state.incidents[0].status, 'AwaitingCustomerChoice');
    assert.equal(choice.state.incidents[0].customerChoice || '', '');
    assert.equal(choice.state.audits.length, choiceAuditCount);

    const terminal = createHarness();
    const terminalShipment = await terminal.handoff('terminal-audit-handoff');
    const terminalIncident = await terminal.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      terminalShipment.shipment._id,
      {
        eventKey: 'terminal-audit-lost',
        eventType: 'LOST',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'terminal-audit-proof',
        irrecoverable: true,
      },
    );
    await terminal.service.chooseIncidentResolution('customer-1', 'order-1', terminalIncident.incident._id, {
      idempotencyKey: 'terminal-audit-choice',
      choice: 'TerminalRefund',
    });
    const terminalAuditCount = terminal.state.audits.length;
    terminal.auditControl.failNext = true;
    await assert.rejects(
      terminal.service.resolveDeliveryFailure('staff-1', 'order-1', {
        idempotencyKey: 'terminal-audit-rollback',
        incidentId: terminalIncident.incident._id,
      }),
      /injected audit write failure/,
    );
    assert.equal(terminal.state.order.orderStatus, 'Shipped');
    assert.equal(terminal.state.refunds.length, 0);
    assert.equal(terminal.state.refundRequests.length, 0);
    assert.equal(terminal.state.outbox.length, 1);
    assert.equal(terminal.state.audits.length, terminalAuditCount);

    const replay = createHarness();
    const first = await replay.packExact('packing-audit-replay');
    const replayed = await replay.packExact('packing-audit-replay');
    assert.equal(replayed.idempotentReplay, true);
    assert.equal(replayed.packingRecord._id, first.packingRecord._id);
    assert.equal(replay.state.audits.length, 1);
  });

  it('P1 returns the winning exact result when a same-key command loses a duplicate-key race', async () => {
    const packing = createHarness();
    packing.raceControl.packing = true;
    const packed = await packing.packExact('packing-duplicate-race');
    assert.equal(packed.idempotentReplay, true);
    assert.equal(packed.packingRecord._id, 'race-packing');
    assert.equal(packing.state.packingRecords.length, 0);

    const handoff = createHarness();
    await handoff.packExact('handoff-race-prerequisite');
    handoff.raceControl.shipment = true;
    const handedOff = await handoff.service.recordHandoff('staff-1', 'order-1', {
      idempotencyKey: 'handoff-duplicate-race',
      carrierName: 'External Green Carrier',
      trackingReference: 'TRACK-DUP-HANDOFF',
      handedOffAt: '2026-07-24T09:00:00.000Z',
      evidenceReference: 'handoff-duplicate-proof',
    });
    assert.equal(handedOff.idempotentReplay, true);
    assert.equal(handedOff.shipment._id, 'race-shipment');
    assert.equal(handoff.state.shipments.length, 0);

    const shipmentEvent = createHarness();
    const eventShipment = await shipmentEvent.handoff('event-race-handoff');
    shipmentEvent.raceControl.event = true;
    const event = await shipmentEvent.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      eventShipment.shipment._id,
      {
        eventKey: 'event-duplicate-race',
        eventType: 'ATTEMPT_FAILED',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'event-duplicate-proof',
      },
    );
    assert.equal(event.idempotentReplay, true);
    assert.equal(event.event._id, 'race-event');
    assert.equal(shipmentEvent.state.events.length, 1);

    const receipt = createHarness();
    const receiptShipment = await receipt.handoff('receipt-race-handoff');
    await receipt.service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      receiptShipment.shipment._id,
      {
        eventKey: 'receipt-race-returned',
        eventType: 'RETURNED_TO_SHOP',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-25T10:00:00.000Z',
        evidenceReference: 'receipt-race-returned-proof',
      },
    );
    receipt.raceControl.receipt = true;
    const received = await receipt.service.recordReturnedReceipt('warehouse-1', receiptShipment.shipment._id, {
      idempotencyKey: 'receipt-duplicate-race',
      receivedAt: '2026-07-25T12:00:00.000Z',
      evidenceReference: 'receipt-duplicate-proof',
      items: [
        { orderDetailId: 'detail-1', receivedQuantity: 2, sellableQuantity: 1, damagedQuantity: 1 },
        { orderDetailId: 'detail-2', receivedQuantity: 1, sellableQuantity: 1, damagedQuantity: 0 },
      ],
    });
    assert.equal(received.idempotentReplay, true);
    assert.equal(received.receipt._id, 'race-receipt');
    assert.equal(receipt.state.receipts.length, 0);
    assert.equal(receipt.state.inventoryTransactions.length, 0);

    const destination = createHarness();
    destination.raceControl.destination = true;
    const version = await destination.service.addDestinationVersion(
      { actorType: 'Staff', actorId: 'staff-1' },
      'order-1',
      {
        idempotencyKey: 'destination-duplicate-race',
        receiverName: 'Green Customer',
        receiverPhone: '0901234567',
        shippingAddress: '2 Green Street',
        customerConfirmationReference: 'destination-duplicate-proof',
      },
    );
    assert.equal(version.idempotentReplay, true);
    assert.equal(version.destination._id, 'race-destination');
    assert.equal(destination.state.destinations.length, 0);
  });

  it('P2 rejects a correction or dispute that replaces evidence from another Shipment', async () => {
    const { service, state, handoff } = createHarness();
    const { shipment } = await handoff('replaces-event-handoff');
    state.events.push({
      _id: 'foreign-event',
      eventKey: 'foreign-event-key',
      orderId: 'other-order',
      cycleId: 'other-cycle',
      shipmentId: 'other-shipment',
      eventType: 'DELIVERED',
      source: 'CARRIER',
      occurredAt: new Date('2026-07-20T00:00:00.000Z'),
      evidenceReference: 'foreign-proof',
    });

    for (const eventType of ['CORRECTION', 'DISPUTED']) {
      await assert.rejects(
        service.recordShipmentEvent(
          { actorType: 'Staff', actorId: 'staff-1' },
          shipment._id,
          {
            eventKey: `foreign-replaces-${eventType.toLowerCase()}`,
            eventType,
            source: 'STAFF_EVIDENCE',
            occurredAt: '2026-07-25T10:00:00.000Z',
            evidenceReference: 'local-correction-proof',
            replacesEventId: 'foreign-event',
          },
        ),
        /same Shipment/i,
      );
    }
    assert.equal(state.events.filter((event) => event.shipmentId === shipment._id).length, 1);
  });
});
