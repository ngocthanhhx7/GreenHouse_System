const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const AuditLog = require('../models/auditLog.model');
const CustomerDeliveryReceipt = require('../models/customerDeliveryReceipt.model');
const DomainOutbox = require('../models/domainOutbox.model');
const Order = require('../models/order.model');
const Shipment = require('../models/shipment.model');
const ShipmentEvent = require('../models/shipmentEvent.model');
const { canonicalNotificationEvent } = require('./notificationOutbox.service');
const { resolveNotificationChannels } = require('./notificationPolicy.service');
const {
  createCustomerDeliveryReceiptService,
  createModelRepository,
} = require('./customerDeliveryReceipt.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-26T10:30:00.000Z');
const MONGOD_PATH = 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe';
const MONGOD_AVAILABLE = fs.existsSync(MONGOD_PATH);

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
      __v: 0,
      exchangeDeadlineAt: new Date('2026-07-31T09:00:00.000Z'),
      returnDeadlineAt: new Date('2026-07-31T09:00:00.000Z'),
    }],
    shipments: [{
      _id: 'shipment-1',
      orderId: 'order-1',
      status: 'Delivered',
      terminalEventId: 'delivery-event-1',
      customerReceiptGuardVersion: 0,
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
      if (shipment) {
        order.__v = Number(order.__v || 0) + 1;
        shipment.customerReceiptGuardVersion = Number(
          shipment.customerReceiptGuardVersion || 0,
        ) + 1;
      }
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
    repository,
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForMongoPort(child, port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Disposable mongod exited (${child.exitCode})`);
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(200);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      const unavailable = () => { socket.destroy(); resolve(false); };
      socket.once('error', unavailable);
      socket.once('timeout', unavailable);
    });
    if (connected) return;
    await delay(50);
  }
  throw new Error('Disposable mongod did not become ready');
}

async function waitForPrimary(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      if (hello.isWritablePrimary) return;
    } catch (_error) { /* replica-set election is still in progress */ }
    await delay(100);
  }
  throw new Error('Disposable MongoDB replica set did not elect a primary');
}

async function stopMongo(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function removeVerifiedMongoDirectory(directory) {
  if (!directory) return;
  const resolved = path.resolve(directory);
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(tempRoot)
    || !path.basename(resolved).startsWith('greenhome-customer-receipt-rs-')) {
    throw new Error(`Refusing to remove unverified Mongo directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

describe('customerDeliveryReceipt service', () => {
  it('uses technical increment guards and never writes physical delivery fields', async () => {
    const calls = [];
    const originalOrderUpdate = Order.findOneAndUpdate;
    const originalShipmentUpdate = Shipment.findOneAndUpdate;
    const query = (value) => ({
      session() { return this; },
      async lean() { return value; },
    });
    Order.findOneAndUpdate = (filter, update, options) => {
      calls.push({ model: 'Order', filter, update, options });
      return query({ _id: filter._id, customerId: filter.customerId, orderStatus: 'Delivered' });
    };
    Shipment.findOneAndUpdate = (filter, update, options) => {
      calls.push({ model: 'Shipment', filter, update, options });
      return query({
        _id: filter._id,
        orderId: filter.orderId,
        status: 'Delivered',
        terminalEventId: filter.terminalEventId,
      });
    };

    try {
      const repository = createModelRepository();
      const orderId = new mongoose.Types.ObjectId();
      const customerId = new mongoose.Types.ObjectId();
      const shipmentId = new mongoose.Types.ObjectId();
      const deliveryEventId = new mongoose.Types.ObjectId();
      const guarded = await repository.guardAuthoritativeDelivery({
        orderId,
        customerId,
        shipmentId,
        deliveryEventId,
      }, { id: 'guard-session' });

      assert.ok(guarded.order);
      assert.ok(guarded.shipment);
      assert.deepEqual(calls[0].update, { $inc: { __v: 1 } });
      assert.deepEqual(calls[1].update, { $inc: { customerReceiptGuardVersion: 1 } });
      assert.equal(calls[0].options.timestamps, false);
      assert.equal(calls[1].options.timestamps, false);
      for (const call of calls) {
        assert.equal(call.update.$set, undefined);
        assert.equal(call.update.$unset, undefined);
      }
      assert.equal(calls[1].filter.status, 'Delivered');
      assert.equal(String(calls[1].filter.terminalEventId), String(deliveryEventId));
    } finally {
      Order.findOneAndUpdate = originalOrderUpdate;
      Shipment.findOneAndUpdate = originalShipmentUpdate;
    }
  });

  it('maps malformed ObjectIds through the default repository without leaking CastError', async () => {
    const originalOrderFind = Order.findOne;
    const originalEventFind = ShipmentEvent.findById;
    Order.findOne = () => { throw new Error('Order query must not receive malformed ObjectId'); };
    ShipmentEvent.findById = () => {
      throw new Error('ShipmentEvent query must not receive malformed ObjectId');
    };

    try {
      const modelRepository = createModelRepository();
      const missingOrder = createHarness();
      missingOrder.repository.findOwnedOrder = modelRepository.findOwnedOrder;
      await rejectsCode(
        missingOrder.service.recordDecision(
          new mongoose.Types.ObjectId().toString(),
          'not-an-object-id',
          receivedInput(),
        ),
        404,
        'ORDER_NOT_FOUND',
      );

      const validOrderId = new mongoose.Types.ObjectId().toString();
      const validCustomerId = new mongoose.Types.ObjectId().toString();
      const validShipmentId = new mongoose.Types.ObjectId().toString();
      const validDeliveryEventId = new mongoose.Types.ObjectId().toString();
      const staleEvent = createHarness({
        state: {
          orders: [{
            _id: validOrderId,
            orderCode: 'ORD-VALID-OBJECT-ID',
            customerId: validCustomerId,
            orderStatus: 'Delivered',
          }],
          shipments: [{
            _id: validShipmentId,
            orderId: validOrderId,
            status: 'Delivered',
            terminalEventId: validDeliveryEventId,
            customerReceiptGuardVersion: 0,
            createdAt: new Date('2026-07-26T09:00:00.000Z'),
          }],
          shipmentEvents: [],
        },
      });
      staleEvent.repository.findShipmentEvent = modelRepository.findShipmentEvent;
      await rejectsCode(
        staleEvent.service.recordDecision(
          validCustomerId,
          validOrderId,
          receivedInput({ expectedDeliveryEventId: 'not-an-object-id' }),
        ),
        409,
        'DELIVERY_EVENT_STALE',
      );
    } finally {
      Order.findOne = originalOrderFind;
      ShipmentEvent.findById = originalEventFind;
    }
  });

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
    for (const field of ['_id', 'orderId', 'status', 'terminalEventId', 'deliveredAt']) {
      assert.deepEqual(state.shipments[0][field], before.shipments[0][field]);
    }
    assert.equal(state.shipments[0].customerReceiptGuardVersion, 1);
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
    const completionNotification = canonicalNotificationEvent(state.outbox[0]);
    assert.deepEqual(completionNotification, {
      businessEventId: state.outbox[0].businessEventId,
      type: 'ORDER_COMPLETED_BY_CUSTOMER',
      displayValues: { orderCode: 'ORD-RECEIPT-001' },
      recipient: { userId: 'customer-1', email: '', role: 'Customer' },
      target: { collection: 'Order', id: 'order-1' },
    });
    assert.deepEqual(resolveNotificationChannels(
      completionNotification.type,
      completionNotification.recipient,
    ), ['Email', 'InApp']);
    assert.deepEqual(resolveNotificationChannels(
      completionNotification.type,
      { userId: 'staff-1', role: 'Staff' },
    ), []);
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
    const disputeNotification = canonicalNotificationEvent(disputeEvent);
    assert.deepEqual(disputeNotification, {
      businessEventId: disputeEvent.businessEventId,
      type: 'CUSTOMER_DELIVERY_DISPUTED',
      displayValues: { orderCode: 'ORD-RECEIPT-001' },
      recipient: { userId: 'customer-1', email: '', role: 'Customer' },
      target: { collection: 'Order', id: 'order-1' },
    });
    assert.deepEqual(resolveNotificationChannels(
      disputeNotification.type,
      disputeNotification.recipient,
    ), ['Email', 'InApp']);
    assert.deepEqual(resolveNotificationChannels(
      disputeNotification.type,
      { userId: 'staff-1', role: 'Staff' },
    ), []);
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

  it('serializes a real concurrent shipment evidence change for both outcomes', {
    timeout: 60_000,
    skip: MONGOD_AVAILABLE ? false : `Disposable MongoDB skipped: ${MONGOD_PATH} is unavailable`,
  }, async () => {
    let child;
    let dbPath;
    try {
      dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'greenhome-customer-receipt-rs-'));
      const port = await reservePort();
      child = spawn(MONGOD_PATH, [
        '--dbpath', dbPath,
        '--port', String(port),
        '--bind_ip', '127.0.0.1',
        '--replSet', 'customer-receipt-rs',
        '--quiet',
        '--logpath', path.join(dbPath, 'mongod.log'),
      ], { windowsHide: true, stdio: 'ignore' });
      await waitForMongoPort(child, port);

      const database = `greenhome_customer_receipt_${randomUUID().replaceAll('-', '')}`;
      await mongoose.connect(`mongodb://127.0.0.1:${port}/${database}?directConnection=true`, {
        serverSelectionTimeoutMS: 5_000,
      });
      await mongoose.connection.db.admin().command({
        replSetInitiate: {
          _id: 'customer-receipt-rs',
          members: [{ _id: 0, host: `127.0.0.1:${port}` }],
        },
      });
      await waitForPrimary();

      await Promise.all([
        Order.createCollection(),
        Shipment.createCollection(),
        ShipmentEvent.createCollection(),
        CustomerDeliveryReceipt.createCollection(),
        AuditLog.createCollection(),
        DomainOutbox.createCollection(),
      ]);
      await Promise.all([
        Order.syncIndexes(),
        Shipment.syncIndexes(),
        ShipmentEvent.syncIndexes(),
        CustomerDeliveryReceipt.syncIndexes(),
        AuditLog.syncIndexes(),
        DomainOutbox.syncIndexes(),
      ]);

      const orderId = new mongoose.Types.ObjectId();
      const customerId = new mongoose.Types.ObjectId();
      const shipmentId = new mongoose.Types.ObjectId();
      const deliveredEventId = new mongoose.Types.ObjectId();
      const changedEventId = new mongoose.Types.ObjectId();
      await Order.create({
        _id: orderId,
        orderCode: 'ORD-REAL-RACE-001',
        customerId,
        totalAmount: 100_000,
        paymentMethod: 'ONLINE',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        shippingAddress: 'Địa chỉ kiểm thử giao dịch',
      });
      await Shipment.create({
        _id: shipmentId,
        commandKey: 'shipment-real-race',
        shipmentKey: 'shipment-real-race',
        orderId,
        cycleId: new mongoose.Types.ObjectId(),
        packingRecordId: new mongoose.Types.ObjectId(),
        carrierName: 'Test Carrier',
        trackingReference: 'TRACK-REAL-RACE',
        handedOffAt: new Date('2026-07-26T08:00:00.000Z'),
        handoffEvidenceReference: 'handoff-real-race',
        recordedBy: new mongoose.Types.ObjectId(),
        status: 'Delivered',
        deliveredAt: new Date('2026-07-26T09:00:00.000Z'),
        terminalEventId: deliveredEventId,
      });
      await ShipmentEvent.create({
        _id: deliveredEventId,
        eventKey: 'delivered-real-race',
        orderId,
        cycleId: new mongoose.Types.ObjectId(),
        shipmentId,
        eventType: 'DELIVERED',
        source: 'STAFF_EVIDENCE',
        occurredAt: new Date('2026-07-26T09:00:00.000Z'),
        evidenceReference: 'delivery-real-race',
      });

      for (const input of [
        {
          outcome: 'RECEIVED',
          expectedDeliveryEventId: String(deliveredEventId),
          idempotencyKey: 'real-race-received',
        },
        {
          outcome: 'NOT_RECEIVED',
          expectedDeliveryEventId: String(deliveredEventId),
          reason: 'Tôi chưa nhận được kiện hàng kiểm thử.',
          idempotencyKey: 'real-race-not-received',
        },
      ]) {
        await Promise.all([
          CustomerDeliveryReceipt.collection.deleteMany({}),
          AuditLog.collection.deleteMany({}),
          DomainOutbox.collection.deleteMany({}),
        ]);
        await Order.collection.updateOne(
          { _id: orderId },
          {
            $set: {
              orderStatus: 'Delivered',
              exchangeDeadlineAt: null,
              returnDeadlineAt: null,
            },
          },
        );
        await Shipment.collection.updateOne(
          { _id: shipmentId },
          {
            $set: {
              status: 'Delivered',
              terminalEventId: deliveredEventId,
              deliveredAt: new Date('2026-07-26T09:00:00.000Z'),
              customerReceiptGuardVersion: 0,
            },
          },
        );

        const baseRepository = createModelRepository();
        let releaseEvidenceRead;
        let notifyEvidenceRead;
        const evidenceRead = new Promise((resolve) => { notifyEvidenceRead = resolve; });
        const resume = new Promise((resolve) => { releaseEvidenceRead = resolve; });
        let firstRead = true;
        const repository = {
          ...baseRepository,
          async findShipmentEvent(eventId, session) {
            const event = await baseRepository.findShipmentEvent(eventId, session);
            if (firstRead) {
              firstRead = false;
              notifyEvidenceRead();
              await resume;
            }
            return event;
          },
        };
        const service = createCustomerDeliveryReceiptService({
          repository,
          clock: () => new Date(NOW),
        });
        const decision = service.recordDecision(String(customerId), String(orderId), input);
        await evidenceRead;
        await Shipment.collection.updateOne(
          { _id: shipmentId },
          {
            $set: {
              status: 'ReturnedToShop',
              terminalEventId: changedEventId,
            },
          },
        );
        releaseEvidenceRead();

        await rejectsCode(decision, 409, 'DELIVERY_EVENT_STALE');
        assert.equal(await CustomerDeliveryReceipt.countDocuments(), 0);
        assert.equal(await AuditLog.countDocuments(), 0);
        assert.equal(await DomainOutbox.countDocuments(), 0);
        const physical = await Shipment.findById(shipmentId)
          .select('+customerReceiptGuardVersion')
          .lean();
        assert.equal(physical.status, 'ReturnedToShop');
        assert.equal(String(physical.terminalEventId), String(changedEventId));
        assert.equal(physical.deliveredAt.toISOString(), '2026-07-26T09:00:00.000Z');
        assert.equal(physical.customerReceiptGuardVersion, 0);
      }
    } finally {
      await mongoose.disconnect().catch(() => {});
      await stopMongo(child);
      removeVerifiedMongoDirectory(dbPath);
    }
  });
});
