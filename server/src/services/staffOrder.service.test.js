const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createStaffOrderService } = require('./staffOrder.service');

function createOrderRepository() {
  const orders = [
    {
      _id: 'order-1', orderCode: 'ORD-1', customerId: 'customer-1', totalAmount: 50,
      subtotal: 45, shippingFee: 5, currency: 'VND', receiverName: 'Nguyen Van A', receiverPhone: '0900000001',
      paymentMethod: 'COD', paymentStatus: 'Unpaid', orderStatus: 'Pending', shippingAddress: 'Ha Noi', createdAt: new Date('2026-06-30T08:00:00Z'),
    },
    {
      _id: 'order-2', orderCode: 'ORD-2', customerId: 'customer-2', totalAmount: 80,
      paymentMethod: 'ONLINE', paymentStatus: 'Pending', orderStatus: 'Pending', shippingAddress: 'Da Nang', createdAt: new Date('2026-06-30T09:00:00Z'),
    },
  ];
  const details = [
    { _id: 'detail-1', orderId: 'order-1', productId: 'p1', productNameSnapshot: 'Green Pan', productSkuSnapshot: 'PAN-01', unitSnapshot: 'piece', productImageSnapshot: 'pan.jpg', quantity: 2, priceSnapshot: 25, subtotal: 50 },
  ];
  const reservations = [{
    _id: 'reservation-1',
    orderId: 'order-1',
    orderDetailId: 'detail-1',
    productId: 'p1',
    quantity: 2,
    status: 'Reserved',
  }];
  const exports = [];
  const cycles = [];
  const payments = [
    { _id: 'payment-1', orderId: 'order-1', paymentMethod: 'COD', amount: 50, currency: 'VND', paymentStatus: 'Unpaid' },
    { _id: 'payment-2', orderId: 'order-2', paymentMethod: 'ONLINE', amount: 80, currency: 'VND', paymentStatus: 'Pending' },
  ];
  const attempts = [
    { _id: 'attempt-1', orderId: 'order-1', paymentMethod: 'COD', amount: 50, currency: 'VND', paymentStatus: 'Unpaid' },
    { _id: 'attempt-2', orderId: 'order-2', paymentMethod: 'ONLINE', amount: 80, currency: 'VND', paymentStatus: 'Pending' },
  ];
  const refunds = [];
  const invoices = [];
  const outbox = [];
  let reservedQuantity = 2;
  let releaseCalls = 0;
  const inventories = [{ productId: 'p1', stockQuantity: 10, reservedQuantity: 2, inventoryHealth: 'Normal' }];
  let cancelExportCalls = 0;
  const confirmationMutationSessions = [];

  return {
    orders, exports, cycles, payments, attempts, refunds, invoices, reservations, outbox,
    get reservedQuantity() { return reservedQuantity; },
    get releaseCalls() { return releaseCalls; },
    get cancelExportCalls() { return cancelExportCalls; },
    inventories,
    confirmationMutationSessions,
    async listOrders(query = {}) { return orders.filter((order) => !query.status || order.orderStatus === query.status); },
    async findOrderById(id) { return orders.find((order) => order._id === id) || null; },
    async listOrderDetails(orderId) { return details.filter((detail) => detail.orderId === orderId); },
    async listReservationsByOrder(orderId) {
      return reservations.filter((entry) => entry.orderId === orderId && entry.status === 'Reserved');
    },
    async updateOrder(id, data) { const order = orders.find((entry) => entry._id === id); Object.assign(order, data); return order; },
    async claimStaffConfirmation(id, data, session) {
      const order = orders.find((entry) => entry._id === id && entry.orderStatus === 'Pending');
      if (!order) return null;
      Object.assign(order, data);
      confirmationMutationSessions.push(session);
      return order;
    },
    async claimStaffCancellation(id, expectedPaymentStatus, data) {
      const order = orders.find((entry) => entry._id === id && ['Pending', 'Confirmed'].includes(entry.orderStatus) && entry.paymentStatus === expectedPaymentStatus);
      if (!order) return null;
      Object.assign(order, data);
      return order;
    },
    async releaseReservation(productId, quantity) {
      if (productId !== 'p1' || reservedQuantity < quantity) return null;
      releaseCalls += 1;
      reservedQuantity -= quantity;
      return { productId, reservedQuantity };
    },
    async findInventoryByProductId(productId) {
      return inventories.find((inventory) => inventory.productId === productId) || null;
    },
    async findOpenStockExportRequest(orderId) { return exports.find((entry) => entry.orderId === orderId && ['Pending', 'Approved', 'Processing'].includes(entry.status)) || null; },
    async findInitialStockExportRequest(orderId) {
      return exports.find((entry) => entry.orderId === orderId && entry.requestKind === 'Initial') || null;
    },
    async cancelOpenStockExportRequest(orderId, data) {
      const request = exports.find((entry) => entry.orderId === orderId && ['Pending', 'Approved'].includes(entry.status));
      if (!request) return null;
      Object.assign(request, { status: 'Cancelled', ...data });
      cancelExportCalls += 1;
      return request;
    },
    async findCompletedStockExportRequest(orderId) {
      return exports.find((entry) => entry.orderId === orderId && (
        entry.status === 'Completed'
        || entry.status === 'Exported'
        || entry.exportedAt
      )) || null;
    },
    async createStockExportRequest(data, session) {
      const request = { _id: `export-${exports.length + 1}`, status: 'Pending', exportedAt: null, ...data };
      exports.push(request);
      confirmationMutationSessions.push(session);
      return request;
    },
    async createFulfillmentCycle(data, session) {
      const cycle = { _id: `cycle-${cycles.length + 1}`, ...data };
      cycles.push(cycle);
      confirmationMutationSessions.push(session);
      return cycle;
    },
    async findPaymentByOrderId(orderId) { return payments.find((payment) => payment.orderId === orderId) || null; },
    async updatePayment(id, data) { const payment = payments.find((entry) => entry._id === id); Object.assign(payment, data); return payment; },
    async findLatestPaymentAttemptByOrder(orderId) { return attempts.filter((attempt) => attempt.orderId === orderId).at(-1) || null; },
    async findPrimaryPaidPaymentAttemptByOrder(orderId) {
      return attempts.find((attempt) => attempt.orderId === orderId && attempt.paymentStatus === 'Paid') || null;
    },
    async updatePaymentAttempt(id, data) { const attempt = attempts.find((entry) => entry._id === id); Object.assign(attempt, data); return attempt; },
    async upsertRefundPending(data) { let refund = refunds.find((entry) => data.obligationKey ? entry.obligationKey === data.obligationKey : entry.orderId === data.orderId && entry.obligationType === data.obligationType); if (!refund) { refund = { _id: `refund-${refunds.length + 1}`, ...data }; refunds.push(refund); } return refund; },
    async enqueuePostCommitWork(data) {
      const existing = outbox.find((entry) => entry.identityKey === data.identityKey);
      if (existing) return existing;
      const item = { _id: `outbox-${outbox.length + 1}`, ...data };
      outbox.push(item);
      return item;
    },
    async findInvoiceByOrderId(orderId) { return invoices.find((invoice) => invoice.orderId === orderId) || null; },
    async createInvoice(data) { const invoice = { _id: `invoice-${invoices.length + 1}`, ...data }; invoices.push(invoice); return invoice; },
    snapshot() {
      return {
        orders: structuredClone(orders),
        exports: structuredClone(exports),
        cycles: structuredClone(cycles),
        payments: structuredClone(payments),
        attempts: structuredClone(attempts),
        refunds: structuredClone(refunds),
        invoices: structuredClone(invoices),
        reservations: structuredClone(reservations),
        inventories: structuredClone(inventories),
        outbox: structuredClone(outbox),
        reservedQuantity,
        releaseCalls,
        cancelExportCalls,
        confirmationMutationSessions: [...confirmationMutationSessions],
      };
    },
    restore(snapshot) {
      for (const [target, values] of [
        [orders, snapshot.orders],
        [exports, snapshot.exports],
        [cycles, snapshot.cycles],
        [payments, snapshot.payments],
        [attempts, snapshot.attempts],
        [refunds, snapshot.refunds],
        [invoices, snapshot.invoices],
        [reservations, snapshot.reservations],
        [inventories, snapshot.inventories],
        [outbox, snapshot.outbox],
      ]) {
        target.splice(0, target.length, ...values);
      }
      reservedQuantity = snapshot.reservedQuantity;
      releaseCalls = snapshot.releaseCalls;
      cancelExportCalls = snapshot.cancelExportCalls;
      confirmationMutationSessions.splice(
        0,
        confirmationMutationSessions.length,
        ...snapshot.confirmationMutationSessions,
      );
    },
  };
}

function createAuditLogger() {
  const entries = [];
  return { entries, async log(entry, session) { entries.push({ ...entry, session }); } };
}

describe('staff order service', () => {
  let orderRepository;
  let auditLogger;
  let service;

  beforeEach(() => {
    orderRepository = createOrderRepository();
    auditLogger = createAuditLogger();
    let transactionTail = Promise.resolve();
    service = createStaffOrderService({
      orderRepository,
      auditLogger,
      transactionManager: {
        async withTransaction(work) {
          const previousTransaction = transactionTail;
          let releaseTransaction;
          transactionTail = new Promise((resolve) => {
            releaseTransaction = resolve;
          });
          await previousTransaction;
          const snapshot = orderRepository.snapshot();
          try {
            return await work({ id: 'staff-test-session' });
          } catch (error) {
            orderRepository.restore(snapshot);
            throw error;
          } finally {
            releaseTransaction();
          }
        },
      },
      assignmentCoordinator: { async coordinate() {} },
    });
  });

  it('lists staff orders by status', async () => {
    const result = await service.listOrders({ status: 'Pending' });
    assert.equal(result.items.length, 2);
    assert.deepEqual(result.items.map((item) => item.orderCode).sort(), ['ORD-1', 'ORD-2']);
  });

  it('requires an idempotency key before Staff confirmation', async () => {
    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-1', { note: 'Reviewed' }),
      (error) => error.statusCode === 400 && error.errorCode === 'STAFF_CONFIRM_IDEMPOTENCY_KEY_REQUIRED',
    );
    assert.equal(orderRepository.orders[0].orderStatus, 'Pending');
    assert.equal(orderRepository.exports.length, 0);
  });

  it('requires COD to remain Unpaid at confirmation', async () => {
    orderRepository.orders[0].paymentStatus = 'Paid';

    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
      (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_PAYMENT_INVALID',
    );
  });

  it('returns the completed stock export so Staff can continue to packing', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    orderRepository.exports.push({
      _id: 'export-completed',
      orderId: 'order-1',
      cycleId: 'cycle-1',
      requestKind: 'Initial',
      status: 'Completed',
      exportedAt: new Date('2026-07-01T08:00:00Z'),
    });

    const result = await service.getOrder('order-1');

    assert.equal(result.orderStatus, 'Confirmed');
    assert.equal(result.stockExportRequest.status, 'Completed');
    assert.equal(result.stockExportRequest.id, 'export-completed');
  });

  it('atomically confirms a pending order and creates its initial cycle and single stock export request', async () => {
    const result = await service.confirmOrder('staff-1', 'order-1', {
      note: 'Reviewed',
      idempotencyKey: 'staff-confirm-001',
    });

    assert.equal(result.orderStatus, 'Confirmed');
    assert.ok(orderRepository.orders[0].confirmedAt);
    assert.equal(orderRepository.exports.length, 1);
    assert.equal(orderRepository.exports[0].orderId, 'order-1');
    assert.equal(orderRepository.exports[0].requestedBy, 'staff-1');
    assert.equal(orderRepository.exports[0].status, 'Pending');
    assert.equal(orderRepository.exports[0].requestKind, 'Initial');
    assert.equal(orderRepository.exports[0].cycleId, 'cycle-1');
    assert.equal(orderRepository.exports[0].note, 'Reviewed');
    assert.equal(orderRepository.cycles.length, 1);
    assert.equal(orderRepository.cycles[0].cycleType, 'Initial');
    assert.equal(orderRepository.cycles[0].cycleNumber, 1);
    assert.equal(result.confirmedBy, 'staff-1');
    assert.ok(result.confirmedAt);
    assert.equal(orderRepository.confirmationMutationSessions.length, 3);
    assert.ok(orderRepository.confirmationMutationSessions.every(
      (session) => session === orderRepository.confirmationMutationSessions[0],
    ));
    assert.equal(auditLogger.entries[0].action, 'STAFF_ORDER_CONFIRM');
    assert.equal(auditLogger.entries[0].actorId, 'staff-1');
    assert.equal(auditLogger.entries[0].actorRole, 'Staff');
    assert.equal(auditLogger.entries[0].previousState, 'Pending');
    assert.equal(auditLogger.entries[0].newState, 'Confirmed');
    assert.equal(auditLogger.entries[0].businessEventId, 'order:order-1:confirmed');
    assert.equal(auditLogger.entries[0].session.id, 'staff-test-session');
  });

  it('rejects confirming an unpaid online order', async () => {
    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-2', { idempotencyKey: 'staff-confirm-001' }),
      (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_PAYMENT_INVALID',
    );
  });

  it('does not create a second stock export request for duplicate confirmation', async () => {
    await service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' });

    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-002' }),
      (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_STALE_STATE',
    );

    assert.equal(orderRepository.orders[0].orderStatus, 'Confirmed');
    assert.equal(orderRepository.exports.length, 1);
  });

  it('AT-229 rejects a second Staff confirmation with a new key and keeps one export request', async () => {
    await service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'confirm-001' });

    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'confirm-002' }),
      (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_STALE_STATE',
    );

    assert.equal(orderRepository.orders[0].orderStatus, 'Confirmed');
    assert.equal(orderRepository.exports.length, 1);
  });

  it('does not create a stock export request for a stale confirmation', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';

    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
      (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_STALE_STATE',
    );

    assert.equal(orderRepository.exports.length, 0);
  });

  it('rejects confirmation when the exact reservation is no longer intact', async () => {
    orderRepository.inventories[0].reservedQuantity = 1;

    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
      (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_RESERVATION_MISSING',
    );

    assert.equal(orderRepository.orders[0].orderStatus, 'Pending');
    assert.equal(orderRepository.exports.length, 0);
  });

  it('rejects an order whose reservation rows do not exactly match its details', async () => {
    orderRepository.reservations[0].quantity = 1;

    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
      (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_RESERVATION_MISSING',
    );
    assert.equal(orderRepository.orders[0].orderStatus, 'Pending');
    assert.equal(orderRepository.exports.length, 0);
  });

  it('rejects an order with duplicate active reservations for one detail', async () => {
    orderRepository.reservations.push({
      ...orderRepository.reservations[0],
      _id: 'reservation-duplicate',
    });

    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
      (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_RESERVATION_MISSING',
    );
  });

  it('returns exact request metadata and immutable detail items', async () => {
    const result = await service.confirmOrder('staff-1', 'order-1', {
      idempotencyKey: 'staff-confirm-001',
      note: 'Reviewed',
    });

    assert.equal(result.stockExportRequest.cycleId, 'cycle-1');
    assert.equal(result.stockExportRequest.requestKind, 'Initial');
    assert.deepEqual(result.stockExportRequest.items, [{
      orderDetailId: 'detail-1',
      productId: 'p1',
      productNameSnapshot: 'Green Pan',
      quantity: 2,
    }]);
  });

  it('replays a staff confirmation under the same idempotency key without creating another request', async () => {
    const first = await service.confirmOrder('staff-1', 'order-1', {
      idempotencyKey: 'staff-confirm-001',
      note: 'Reviewed',
    });
    const replay = await service.confirmOrder('staff-1', 'order-1', {
      idempotencyKey: 'staff-confirm-001',
      note: 'Reviewed',
    });

    assert.equal(first.orderStatus, 'Confirmed');
    assert.equal(replay.orderStatus, 'Confirmed');
    assert.equal(replay.idempotentReplay, true);
    assert.equal(orderRepository.exports.length, 1);
    assert.equal(orderRepository.cycles.length, 1);
  });

  it('rolls back confirmation and export creation when audit fails', async () => {
    auditLogger.log = async () => { throw new Error('audit unavailable'); };
    const before = structuredClone(orderRepository.orders[0]);

    await assert.rejects(
      () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
      /audit unavailable/,
    );

    assert.deepEqual(orderRepository.orders[0], before);
    assert.equal(orderRepository.exports.length, 0);
    assert.equal(orderRepository.cycles.length, 0);
  });

  it('serializes concurrent confirmations so only one different key succeeds', async () => {
    const claim = orderRepository.claimStaffConfirmation.bind(orderRepository);
    orderRepository.claimStaffConfirmation = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return claim(...args);
    };

    const outcomes = await Promise.allSettled([
      service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
      service.confirmOrder('staff-2', 'order-1', { idempotencyKey: 'staff-confirm-002' }),
    ]);
    const successes = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const failures = outcomes.filter((outcome) => outcome.status === 'rejected');

    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].reason.statusCode, 409);
    assert.ok(['ORDER_CONFIRM_STALE_STATE', 'ORDER_CONFIRM_CONCURRENT'].includes(failures[0].reason.errorCode));
    assert.equal(orderRepository.exports.length, 1);
    assert.equal(orderRepository.cycles.length, 1);
  });

  it('requires a cancel reason and creates one fixed refund obligation without rewriting paid records', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    orderRepository.orders[0].paymentStatus = 'Paid';
    orderRepository.payments[0].paymentStatus = 'Paid';
    orderRepository.attempts[0].paymentStatus = 'Paid';
    orderRepository.attempts.push({
      _id: 'attempt-later',
      orderId: 'order-1',
      paymentMethod: 'ONLINE',
      amount: 50,
      currency: 'VND',
      paymentStatus: 'Pending',
    });
    orderRepository.exports.push({ _id: 'export-1', orderId: 'order-1', requestedBy: 'staff-1', status: 'Pending', exportedAt: null });
    await assert.rejects(() => service.cancelOrder('staff-1', 'order-1', {}), /Cancel reason is required/);
    const cancelled = await service.cancelOrder('staff-1', 'order-1', {
      cancelReason: 'Customer requested cancellation',
      refundAmount: 1,
      obligationType: 'NORMAL_RETURN',
    });
    assert.equal(cancelled.orderStatus, 'Cancelled');
    assert.equal(cancelled.paymentStatus, 'Paid');
    assert.equal(orderRepository.payments[0].paymentStatus, 'Paid');
    assert.equal(orderRepository.attempts[0].paymentStatus, 'Paid');
    assert.equal(orderRepository.attempts[1].paymentStatus, 'Pending');
    assert.equal(orderRepository.reservedQuantity, 0);
    assert.equal(orderRepository.releaseCalls, 1);
    assert.equal(orderRepository.refunds.length, 1);
    assert.equal(orderRepository.refunds[0].amount, 50);
    assert.equal(orderRepository.refunds[0].obligationType, 'PAYMENT_REVERSAL');
    assert.equal(orderRepository.refunds[0].obligationKey, 'PAYMENT_REVERSAL:attempt-1');
    await assert.rejects(() => service.cancelOrder('staff-1', 'order-1', { cancelReason: 'Retry' }), /Only Pending or Confirmed orders can be cancelled/);
    assert.equal(orderRepository.reservedQuantity, 0);
    assert.equal(orderRepository.releaseCalls, 1);
    assert.equal(orderRepository.refunds.length, 1);
    assert.equal(auditLogger.entries.filter((entry) => entry.action === 'STAFF_ORDER_CANCEL').length, 1);
  });

  it('cancels an open stock export request when Staff cancels a confirmed order', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    orderRepository.exports.push({
      _id: 'export-open',
      orderId: 'order-1',
      requestedBy: 'staff-1',
      status: 'Pending',
      exportedAt: null,
    });

    const cancelled = await service.cancelOrder('staff-1', 'order-1', {
      idempotencyKey: 'staff-cancel-001',
      cancelReason: 'Customer requested cancellation',
    });

    assert.equal(cancelled.orderStatus, 'Cancelled');
    assert.equal(orderRepository.exports[0].status, 'Cancelled');
    assert.equal(orderRepository.cancelExportCalls, 1);
  });

  it('rejects cancellation while a stock export request is already Processing', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    orderRepository.exports.push({
      _id: 'export-processing',
      orderId: 'order-1',
      requestedBy: 'staff-1',
      status: 'Processing',
      exportedAt: null,
    });

    await assert.rejects(
      () => service.cancelOrder('staff-1', 'order-1', { cancelReason: 'Customer requested cancellation' }),
      /Processing|stock export/i,
    );
    assert.equal(orderRepository.orders[0].orderStatus, 'Confirmed');
    assert.equal(orderRepository.reservedQuantity, 2);
    assert.equal(orderRepository.releaseCalls, 0);
  });

  it('replays a Staff cancellation under the same idempotency key', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    const first = await service.cancelOrder('staff-1', 'order-1', {
      idempotencyKey: 'staff-cancel-002',
      cancelReason: 'Duplicate request',
    });
    const replay = await service.cancelOrder('staff-1', 'order-1', {
      idempotencyKey: 'staff-cancel-002',
      cancelReason: 'Duplicate request',
    });

    assert.equal(first.orderStatus, 'Cancelled');
    assert.equal(replay.orderStatus, 'Cancelled');
    assert.equal(replay.idempotentReplay, true);
    assert.equal(orderRepository.releaseCalls, 1);
    assert.equal(orderRepository.outbox.length, 1);
  });

  it('rolls Staff cancellation back when the required audit cannot be persisted', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    orderRepository.exports.push({
      _id: 'export-open',
      orderId: 'order-1',
      requestedBy: 'staff-1',
      status: 'Pending',
      exportedAt: null,
    });
    const before = orderRepository.snapshot();
    auditLogger.log = async () => {
      throw new Error('cancel audit unavailable');
    };

    await assert.rejects(
      () => service.cancelOrder('staff-1', 'order-1', {
        idempotencyKey: 'staff-cancel-audit-001',
        cancelReason: 'Customer requested cancellation',
      }),
      /cancel audit unavailable/,
    );

    assert.deepEqual(orderRepository.snapshot(), before);
  });

  it('rolls Staff cancellation back when the required notification outbox cannot be persisted', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    const before = orderRepository.snapshot();
    orderRepository.enqueuePostCommitWork = async () => {
      throw new Error('cancel outbox unavailable');
    };

    await assert.rejects(
      () => service.cancelOrder('staff-1', 'order-1', {
        idempotencyKey: 'staff-cancel-outbox-001',
        cancelReason: 'Customer requested cancellation',
      }),
      /cancel outbox unavailable/,
    );

    assert.deepEqual(orderRepository.snapshot(), before);
  });

  it('releases a confirmed unpaid COD reservation without creating a refund', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';

    const cancelled = await service.cancelOrder('staff-1', 'order-1', { cancelReason: 'Customer changed delivery date' });

    assert.equal(cancelled.orderStatus, 'Cancelled');
    assert.equal(cancelled.paymentStatus, 'Unpaid');
    assert.equal(orderRepository.reservedQuantity, 0);
    assert.equal(orderRepository.refunds.length, 0);
  });

  it('fails closed when Staff cancellation cannot claim the exact order reservation lineage', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    orderRepository.claimReservationRelease = async () => null;

    await assert.rejects(
      () => service.cancelOrder('staff-1', 'order-1', { cancelReason: 'Customer changed delivery date' }),
      /reservation.*missing|reservation.*released|reservation.*intact/i,
    );

    assert.equal(orderRepository.releaseCalls, 0);
  });

  it('blocks cancellation after stock export completion with zero mutation', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    orderRepository.orders[0].paymentStatus = 'Paid';
    orderRepository.payments[0].paymentStatus = 'Paid';
    orderRepository.attempts[0].paymentStatus = 'Paid';
    orderRepository.exports.push({
      _id: 'export-1',
      orderId: 'order-1',
      requestedBy: 'staff-1',
      status: 'Exported',
      exportedAt: new Date('2026-07-01T08:00:00Z'),
    });
    const beforeOrder = structuredClone(orderRepository.orders[0]);
    const beforePayment = structuredClone(orderRepository.payments[0]);
    const beforeAttempt = structuredClone(orderRepository.attempts[0]);

    await assert.rejects(
      () => service.cancelOrder('staff-1', 'order-1', { cancelReason: 'Too late' }),
      /stock export (?:is complete|was completed)/i,
    );

    assert.deepEqual(orderRepository.orders[0], beforeOrder);
    assert.deepEqual(orderRepository.payments[0], beforePayment);
    assert.deepEqual(orderRepository.attempts[0], beforeAttempt);
    assert.equal(orderRepository.reservedQuantity, 2);
    assert.equal(orderRepository.releaseCalls, 0);
    assert.equal(orderRepository.refunds.length, 0);
    assert.equal(auditLogger.entries.length, 0);
  });

  it('creates one immutable invoice snapshot without mutating fulfillment or payment', async () => {
    orderRepository.orders[0].orderStatus = 'Confirmed';
    const beforeOrder = structuredClone(orderRepository.orders[0]);
    const beforePayment = structuredClone(orderRepository.payments[0]);
    const first = await service.getInvoice('staff-1', 'order-1');
    const second = await service.getInvoice('staff-2', 'order-1');
    assert.equal(first.id, second.id);
    assert.equal(first.items[0].productSkuSnapshot, 'PAN-01');
    assert.deepEqual(orderRepository.orders[0], beforeOrder);
    assert.deepEqual(orderRepository.payments[0], beforePayment);
    assert.equal(orderRepository.invoices.length, 1);
  });
});
