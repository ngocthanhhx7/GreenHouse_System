const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const DomainOutbox = require('../models/domainOutbox.model');
const { canonicalNotificationEvent } = require('./notificationOutbox.service');
const {
  createCustomerDeliveryReceiptService,
} = require('./customerDeliveryReceipt.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-26T10:30:00.000Z');

function clone(value) {
  return structuredClone(value);
}

function createHarness(overrides = {}) {
  const initial = {
    orders: [{
      _id: 'order-1',
      orderCode: 'ORD-RECEIPT-001',
      customerId: 'customer-1',
      orderStatus: 'Delivered',
      exchangeDeadlineAt: new Date('2026-07-31T09:00:00.000Z'),
      returnDeadlineAt: new Date('2026-07-31T09:00:00.000Z'),
    }],
    shipments: [{
      _id: 'shipment-1',
      orderId: 'order-1',
      status: 'Delivered',
      terminalEventId: 'delivery-event-1',
      createdAt: new Date('2026-07-26T09:00:00.000Z'),
    }],
    shipmentEvents: [{
      _id: 'delivery-event-1',
      orderId: 'order-1',
      shipmentId: 'shipment-1',
      eventType: 'DELIVERED',
      occurredAt: new Date('2026-07-26T09:30:00.000Z'),
    }],
    receipts: [],
    audits: [],
    outbox: [],
  };
  let state = clone({ ...initial, ...overrides.state });
  let transactionTail = Promise.resolve();

  const transactionManager = {
    withTransaction(work) {
      const run = transactionTail.then(async () => {
        const session = clone(state);
        const result = await work(session);
        state = session;
        return result;
      });
      transactionTail = run.catch(() => {});
      return run;
    },
  };

  const repository = {
    async findOwnedOrder(customerId, orderId, session) {
      const source = session || state;
      return clone(source.orders.find(
        (order) => order._id === orderId && order.customerId === customerId,
      ) || null);
    },
    async findLatestTerminalShipment(orderId, session) {
      const source = session || state;
      return clone(source.shipments
        .filter((shipment) => (
          shipment.orderId === orderId
          && ['Delivered', 'ReturnedToShop', 'Lost', 'Damaged'].includes(shipment.status)
        ))
        .sort((left, right) => (
          new Date(right.createdAt) - new Date(left.createdAt)
          || String(right._id).localeCompare(String(left._id))
        ))[0] || null);
    },
    async findShipmentEvent(eventId, session) {
      const source = session || state;
      return clone(source.shipmentEvents.find((event) => event._id === eventId) || null);
    },
    async guardAuthoritativeDelivery({
      orderId,
      customerId,
      shipmentId,
      deliveryEventId,
    }, session) {
      if (overrides.concurrentEvidenceChange) {
        const changingShipment = session.shipments.find(
          (shipment) => shipment._id === shipmentId,
        );
        changingShipment.status = 'ReturnedToShop';
        changingShipment.terminalEventId = 'returned-event-concurrent';
      }
      const order = session.orders.find((candidate) => (
        candidate._id === orderId
        && candidate.customerId === customerId
        && candidate.orderStatus === 'Delivered'
      ));
      if (!order) return { order: null, shipment: null };
      const shipment = session.shipments.find((candidate) => (
        candidate._id === shipmentId
        && candidate.orderId === orderId
        && candidate.status === 'Delivered'
        && candidate.terminalEventId === deliveryEventId
      ));
      return { order: clone(order), shipment: clone(shipment || null) };
    },
    async findByCommand(customerId, idempotencyKey, session) {
      const source = session || state;
      return clone(source.receipts.find(
        (receipt) => (
          receipt.customerId === customerId && receipt.idempotencyKey === idempotencyKey
        ),
      ) || null);
    },
    async findTerminalReceived(orderId, session) {
      const source = session || state;
      return clone(source.receipts.find(
        (receipt) => receipt.orderId === orderId && receipt.outcome === 'RECEIVED',
      ) || null);
    },
    async findLatestDecision(orderId, session) {
      const source = session || state;
      return clone(source.receipts
        .filter((receipt) => receipt.orderId === orderId)
        .sort((left, right) => (
          new Date(right.respondedAt) - new Date(left.respondedAt)
          || String(right._id).localeCompare(String(left._id))
        ))[0] || null);
    },
    async createDecision(data, session) {
      if (overrides.duplicateRaceWinner && !state.receipts.length) {
        state.receipts.push(clone(overrides.duplicateRaceWinner));
        const error = new Error('duplicate key from concurrent winner');
        error.code = 11000;
        throw error;
      }
      const duplicateCommand = session.receipts.find(
        (receipt) => (
          receipt.customerId === data.customerId
          && receipt.idempotencyKey === data.idempotencyKey
        ),
      );
      const duplicateTerminal = data.outcome === 'RECEIVED' && session.receipts.find(
        (receipt) => receipt.orderId === data.orderId && receipt.outcome === 'RECEIVED',
      );
      const duplicateInitial = !data.supersedesId && session.receipts.find(
        (receipt) => receipt.orderId === data.orderId && !receipt.supersedesId,
      );
      if (duplicateCommand || duplicateTerminal || duplicateInitial) {
        const error = new Error('duplicate key');
        error.code = 11000;
        throw error;
      }
      const decision = { _id: `receipt-${session.receipts.length + 1}`, ...clone(data) };
      session.receipts.push(decision);
      return clone(decision);
    },
    async updateOrderReceiptProjection(orderId, patch, session) {
      const order = session.orders.find((candidate) => candidate._id === orderId);
      Object.assign(order, clone(patch));
      return clone(order);
    },
  };

  const auditLogger = {
    async append(entry, session) {
      if (overrides.failAudit) throw new Error('audit persistence failed');
      session.audits.push(clone(entry));
    },
  };
  const outboxWriter = {
    async publish(entry, session) {
      if (overrides.failOutbox) throw new Error('outbox persistence failed');
      const row = new DomainOutbox(entry);
      await row.validate();
      const persisted = row.toObject();
      canonicalNotificationEvent(persisted);
      session.outbox.push(clone(persisted));
    },
  };

  const service = createCustomerDeliveryReceiptService({
    repository,
    transactionManager,
    auditLogger,
    outboxWriter,
    clock: () => new Date(NOW),
  });

  return {
    service,
    snapshot: () => clone(state),
  };
}

function receivedInput(overrides = {}) {
  return {
    outcome: 'RECEIVED',
    expectedDeliveryEventId: 'delivery-event-1',
    idempotencyKey: 'receipt-command-0001',
    ...overrides,
  };
}

async function rejectsCode(promise, statusCode, errorCode) {
  await assert.rejects(
    promise,
    (error) => error.statusCode === statusCode && error.errorCode === errorCode,
  );
}

describe('customerDeliveryReceipt service', () => {
  it('returns the same ownership-safe 404 for missing and foreign orders', async () => {
    const { service } = createHarness();

    await rejectsCode(
      service.recordDecision('customer-2', 'order-1', receivedInput()),
      404,
      'ORDER_NOT_FOUND',
    );
    await rejectsCode(
      service.recordDecision('customer-1', 'missing-order', receivedInput()),
      404,
      'ORDER_NOT_FOUND',
    );
  });

  it('requires the owned order to have physical Delivered status', async () => {
    const { service } = createHarness({
      state: {
        orders: [{ _id: 'order-1', customerId: 'customer-1', orderStatus: 'Shipped' }],
      },
    });

    await rejectsCode(
      service.recordDecision('customer-1', 'order-1', receivedInput()),
      409,
      'ORDER_NOT_AUTHORITATIVELY_DELIVERED',
    );
  });

  it('uses exact required/invalid idempotency errors and rejects non-string input fields', async () => {
    const { service } = createHarness();

    await rejectsCode(
      service.recordDecision('customer-1', 'order-1', receivedInput({
        idempotencyKey: undefined,
      })),
      422,
      'IDEMPOTENCY_KEY_REQUIRED',
    );
    await rejectsCode(
      service.recordDecision('customer-1', 'order-1', receivedInput({
        idempotencyKey: 12345678,
      })),
      422,
      'IDEMPOTENCY_KEY_INVALID',
    );
    await rejectsCode(
      service.recordDecision('customer-1', 'order-1', receivedInput({
        idempotencyKey: null,
      })),
      422,
      'IDEMPOTENCY_KEY_INVALID',
    );
    for (const [field, value] of [
      ['outcome', { value: 'RECEIVED' }],
      ['expectedDeliveryEventId', ['delivery-event-1']],
      ['reason', 123],
    ]) {
      await rejectsCode(
        service.recordDecision('customer-1', 'order-1', receivedInput({
          [field]: value,
          idempotencyKey: `receipt-command-invalid-${field}`,
        })),
        422,
        'DELIVERY_RECEIPT_INPUT_INVALID',
      );
    }
  });

  it('binds to the latest terminal shipment and its exact DELIVERED terminal event', async () => {
    const stale = createHarness({
      state: {
        shipments: [
          {
            _id: 'shipment-1',
            orderId: 'order-1',
            status: 'Delivered',
            terminalEventId: 'delivery-event-1',
            createdAt: new Date('2026-07-25T09:00:00.000Z'),
          },
          {
            _id: 'shipment-2',
            orderId: 'order-1',
            status: 'Delivered',
            terminalEventId: 'delivery-event-2',
            createdAt: new Date('2026-07-26T09:00:00.000Z'),
          },
        ],
        shipmentEvents: [
          {
            _id: 'delivery-event-1',
            orderId: 'order-1',
            shipmentId: 'shipment-1',
            eventType: 'DELIVERED',
          },
          {
            _id: 'delivery-event-2',
            orderId: 'order-1',
            shipmentId: 'shipment-2',
            eventType: 'DELIVERED',
          },
        ],
      },
    });
    await rejectsCode(
      stale.service.recordDecision('customer-1', 'order-1', receivedInput()),
      409,
      'DELIVERY_EVENT_STALE',
    );

    const invalidEvent = createHarness({
      state: {
        shipmentEvents: [{
          _id: 'delivery-event-1',
          orderId: 'order-1',
          shipmentId: 'shipment-1',
          eventType: 'CORRECTION',
        }],
      },
    });
    await rejectsCode(
      invalidEvent.service.recordDecision('customer-1', 'order-1', receivedInput()),
      409,
      'DELIVERY_EVENT_STALE',
    );
  });

  it('records RECEIVED with exact five-day snapshots without changing shipment evidence', async () => {
    const harness = createHarness();
    const before = harness.snapshot();

    const result = await harness.service.recordDecision(
      'customer-1',
      'order-1',
      receivedInput(),
    );

    const state = harness.snapshot();
    const exactDeadline = new Date(NOW.getTime() + 5 * DAY_MS);
    assert.equal(result.outcome, 'RECEIVED');
    assert.equal(new Date(result.respondedAt).toISOString(), NOW.toISOString());
    assert.equal(new Date(result.exchangeDeadlineAt).toISOString(), exactDeadline.toISOString());
    assert.equal(new Date(result.returnDeadlineAt).toISOString(), exactDeadline.toISOString());
    assert.equal(new Date(state.orders[0].exchangeDeadlineAt).toISOString(), exactDeadline.toISOString());
    assert.equal(new Date(state.orders[0].returnDeadlineAt).toISOString(), exactDeadline.toISOString());
    assert.deepEqual(state.shipments, before.shipments);
    assert.deepEqual(state.shipmentEvents, before.shipmentEvents);
    assert.equal(state.receipts.length, 1);
    assert.equal(state.audits.length, 1);
    assert.equal(state.audits[0].action, 'CUSTOMER_DELIVERY_RECEIVED');
    assert.equal(state.audits[0].safeFacts.reason, undefined);
    assert.equal(state.outbox.length, 1);
    assert.equal(state.outbox[0].eventType, 'ORDER_COMPLETED_BY_CUSTOMER');
    assert.equal(state.outbox[0].payloadSchemaVersion, 1);
    assert.match(state.outbox[0].eventHash, /^[a-f0-9]{64}$/);
    assert.equal(state.outbox[0].aggregateType, 'Order');
    assert.equal(state.outbox[0].aggregateId, 'order-1');
    assert.deepEqual(canonicalNotificationEvent(state.outbox[0]), {
      businessEventId: state.outbox[0].businessEventId,
      type: 'ORDER_COMPLETED_BY_CUSTOMER',
      displayValues: { orderCode: 'ORD-RECEIPT-001' },
      recipient: { userId: 'customer-1', email: '', role: 'Customer' },
      target: { collection: 'Order', id: 'order-1' },
    });
    assert.equal(JSON.stringify(state.outbox[0]).includes('Tôi chưa nhận'), false);
  });

  it('requires a normalized 10-500 character reason for NOT_RECEIVED', async () => {
    const { service } = createHarness();

    await rejectsCode(
      service.recordDecision('customer-1', 'order-1', receivedInput({
        outcome: 'NOT_RECEIVED',
        reason: '',
      })),
      422,
      'NOT_RECEIVED_REASON_INVALID',
    );
    await rejectsCode(
      service.recordDecision('customer-1', 'order-1', receivedInput({
        outcome: 'NOT_RECEIVED',
        reason: ' short ',
      })),
      422,
      'NOT_RECEIVED_REASON_INVALID',
    );
    await rejectsCode(
      service.recordDecision('customer-1', 'order-1', receivedInput({
        outcome: 'NOT_RECEIVED',
        reason: 'x'.repeat(501),
      })),
      422,
      'NOT_RECEIVED_REASON_INVALID',
    );
  });

  it('records NOT_RECEIVED without deadlines and allows a later RECEIVED to supersede it', async () => {
    const harness = createHarness();
    const dispute = await harness.service.recordDecision(
      'customer-1',
      'order-1',
      receivedInput({
        outcome: 'NOT_RECEIVED',
        reason: '  Tôi chưa nhận được kiện hàng.  ',
        idempotencyKey: 'receipt-command-dispute',
      }),
    );
    const received = await harness.service.recordDecision(
      'customer-1',
      'order-1',
      receivedInput({ idempotencyKey: 'receipt-command-later-received' }),
    );

    assert.equal(dispute.reason, 'Tôi chưa nhận được kiện hàng.');
    assert.equal(dispute.exchangeDeadlineAt, null);
    assert.equal(dispute.returnDeadlineAt, null);
    assert.equal(received.supersedesId, dispute._id);
    assert.equal(harness.snapshot().receipts.length, 2);
    const disputeEvent = harness.snapshot().outbox[0];
    assert.equal(disputeEvent.eventType, 'CUSTOMER_DELIVERY_DISPUTED');
    assert.deepEqual(canonicalNotificationEvent(disputeEvent), {
      businessEventId: disputeEvent.businessEventId,
      type: 'CUSTOMER_DELIVERY_DISPUTED',
      displayValues: { orderCode: 'ORD-RECEIPT-001' },
      recipientRole: 'Staff',
      target: { collection: 'Order', id: 'order-1' },
    });
    assert.equal(JSON.stringify(disputeEvent).includes(dispute.reason), false);
  });

  it('reports DELIVERY_DISPUTE_OPEN when another NOT_RECEIVED is attempted', async () => {
    const harness = createHarness();
    await harness.service.recordDecision(
      'customer-1',
      'order-1',
      receivedInput({
        outcome: 'NOT_RECEIVED',
        reason: 'Tôi chưa nhận được kiện hàng.',
        idempotencyKey: 'receipt-command-open-dispute',
      }),
    );

    await rejectsCode(
      harness.service.recordDecision(
        'customer-1',
        'order-1',
        receivedInput({
          outcome: 'NOT_RECEIVED',
          reason: 'Kiện hàng vẫn chưa được giao cho tôi.',
          idempotencyKey: 'receipt-command-second-dispute',
        }),
      ),
      409,
      'DELIVERY_DISPUTE_OPEN',
    );
  });

  it('rejects any decision after terminal RECEIVED and returns the safe winning projection', async () => {
    const harness = createHarness();
    const winner = await harness.service.recordDecision(
      'customer-1',
      'order-1',
      receivedInput(),
    );

    await assert.rejects(
      harness.service.recordDecision(
        'customer-1',
        'order-1',
        receivedInput({
          outcome: 'NOT_RECEIVED',
          reason: 'Tôi chưa nhận được kiện hàng.',
          idempotencyKey: 'receipt-command-0002',
        }),
      ),
      (error) => (
        error.statusCode === 409
        && error.errorCode === 'DELIVERY_CONFIRMATION_ALREADY_RECORDED'
        && error.data?.winner?._id === winner._id
        && error.data?.winner?.requestHash === undefined
        && error.data?.winner?.idempotencyKey === undefined
      ),
    );
  });

  it('returns an exact same-key replay without duplicate audit or outbox writes', async () => {
    const harness = createHarness();
    const first = await harness.service.recordDecision(
      'customer-1',
      'order-1',
      receivedInput(),
    );
    const replay = await harness.service.recordDecision(
      'customer-1',
      'order-1',
      receivedInput(),
    );

    assert.deepEqual(replay, first);
    const state = harness.snapshot();
    assert.equal(state.receipts.length, 1);
    assert.equal(state.audits.length, 1);
    assert.equal(state.outbox.length, 1);
  });

  it('rejects same idempotency key reused with changed canonical facts', async () => {
    const harness = createHarness();
    await harness.service.recordDecision('customer-1', 'order-1', receivedInput());

    await rejectsCode(
      harness.service.recordDecision(
        'customer-1',
        'order-1',
        receivedInput({ expectedDeliveryEventId: 'different-event' }),
      ),
      409,
      'IDEMPOTENCY_KEY_REUSED',
    );
  });

  it('allows exactly one winner for concurrent different-key initial decisions', async () => {
    const harness = createHarness();
    const results = await Promise.allSettled([
      harness.service.recordDecision(
        'customer-1',
        'order-1',
        receivedInput({ idempotencyKey: 'receipt-command-concurrent-a' }),
      ),
      harness.service.recordDecision(
        'customer-1',
        'order-1',
        receivedInput({
          outcome: 'NOT_RECEIVED',
          reason: 'Tôi chưa nhận được kiện hàng.',
          idempotencyKey: 'receipt-command-concurrent-b',
        }),
      ),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const conflict = results.find((result) => result.status === 'rejected').reason;
    assert.equal(conflict.statusCode, 409);
    assert.ok([
      'DELIVERY_CONFIRMATION_ALREADY_RECORDED',
      'DELIVERY_RECEIPT_CONFLICT',
    ].includes(conflict.errorCode));
    assert.ok(conflict.data?.winner);
    assert.equal(harness.snapshot().receipts.length, 1);
  });

  it('maps a database unique-index race to a deterministic conflict with a safe winner', async () => {
    const winner = {
      _id: 'receipt-concurrent-winner',
      orderId: 'order-1',
      customerId: 'customer-1',
      shipmentId: 'shipment-1',
      deliveryEventId: 'delivery-event-1',
      outcome: 'NOT_RECEIVED',
      reason: 'Tôi chưa nhận được kiện hàng.',
      supersedesId: null,
      respondedAt: new Date(NOW),
      exchangeDeadlineAt: null,
      returnDeadlineAt: null,
      idempotencyKey: 'other-concurrent-command',
      requestHash: 'f'.repeat(64),
    };
    const harness = createHarness({ duplicateRaceWinner: winner });

    await assert.rejects(
      harness.service.recordDecision(
        'customer-1',
        'order-1',
        receivedInput({ idempotencyKey: 'receipt-command-losing-race' }),
      ),
      (error) => (
        error.statusCode === 409
        && error.errorCode === 'DELIVERY_RECEIPT_CONFLICT'
        && error.data?.winner?._id === winner._id
        && error.data?.winner?.requestHash === undefined
        && error.data?.winner?.idempotencyKey === undefined
      ),
    );
  });

  it('rolls back both outcomes when physical delivery changes before the guarded write', async () => {
    for (const input of [
      receivedInput(),
      receivedInput({
        outcome: 'NOT_RECEIVED',
        reason: 'Tôi chưa nhận được kiện hàng.',
        idempotencyKey: 'receipt-command-guarded-dispute',
      }),
    ]) {
      const harness = createHarness({ concurrentEvidenceChange: true });
      const before = harness.snapshot();

      await rejectsCode(
        harness.service.recordDecision('customer-1', 'order-1', input),
        409,
        'DELIVERY_EVENT_STALE',
      );
      assert.deepEqual(harness.snapshot(), before);
    }
  });

  it('rolls back receipt, order projection, audit, and outbox when Audit fails', async () => {
    const harness = createHarness({ failAudit: true });
    const before = harness.snapshot();

    await assert.rejects(
      harness.service.recordDecision('customer-1', 'order-1', receivedInput()),
      /audit persistence failed/,
    );
    assert.deepEqual(harness.snapshot(), before);
  });

  it('rolls back receipt, order projection, audit, and outbox when Outbox fails', async () => {
    const harness = createHarness({ failOutbox: true });
    const before = harness.snapshot();

    await assert.rejects(
      harness.service.recordDecision('customer-1', 'order-1', receivedInput()),
      /outbox persistence failed/,
    );
    assert.deepEqual(harness.snapshot(), before);
  });
});
