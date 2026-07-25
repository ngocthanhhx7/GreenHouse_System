const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createModelProductRepository, createOrderService } = require('./order.service');

function checkoutInput(overrides = {}) {
  const { deliveryAddress, ...inputOverrides } = overrides;
  return {
    deliveryAddress: {
      receiverName: 'Khách hàng Demo',
      phoneNumber: '0900000001',
      province: 'Hà Nội',
      district: 'Thanh Xuân',
      ward: 'Khương Mai',
      addressLine: '12 Nguyễn Trãi',
      ...deliveryAddress,
    },
    cartId: 'cart-1',
    cartVersion: 1,
    paymentMethod: 'COD',
    expectedItems: [
      { productId: 'p1', quantity: 2, unitPrice: 25, priceVersion: '2026-07-23T00:00:00.000Z' },
    ],
    ...inputOverrides,
  };
}

function createCartRepository() {
  const carts = [{
    _id: 'cart-1',
    customerId: 'customer-1',
    status: 'Active',
    version: 1,
  }];
  const items = [
    { _id: 'item-1', cartId: 'cart-1', productId: 'p1', productName: 'Green Pan', quantity: 2, unitPrice: 25 },
  ];
  return {
    carts,
    items,
    async findActiveByCustomer(customerId) {
      return carts.find((cart) => cart.customerId === customerId && cart.status === 'Active') || null;
    },
    async listItems(cartId) {
      return items.filter((item) => item.cartId === cartId);
    },
    async markCheckedOut(cartId) {
      const cart = carts.find((entry) => entry._id === cartId);
      cart.status = 'CheckedOut';
    },
    async clearExactCart(cartId) {
      const cart = carts.find((entry) => entry._id === cartId);
      cart.status = 'CheckedOut';
      return cart;
    },
  };
}

function createProductRepository(overrides = {}) {
  return {
    async findSellableById(id) {
      if (id !== 'p1') return null;
      return {
        _id: 'p1',
        name: 'Green Pan',
        sku: 'PAN-001',
        unit: 'piece',
        imageUrls: ['https://cdn.test/pan.jpg'],
        price: 25,
        status: 'Active',
        stockQuantity: 5,
        updatedAt: new Date('2026-07-23T00:00:00.000Z'),
        ...overrides,
      };
    },
  };
}

function createOrderRepository() {
  const orders = [];
  const details = [];
  const payments = [];
  const attempts = [];
  const refunds = [];
  const refundRequests = [];
  const outbox = [];
  const reservations = [];
  return {
    orders,
    details,
    payments,
    attempts,
    refunds,
    refundRequests,
    outbox,
    reservations,
    async createOrder(data) {
      const order = { _id: `order-${orders.length + 1}`, orderCode: `ORD-${orders.length + 1}`, ...data };
      orders.push(order);
      return order;
    },
    async createOrderDetail(data) {
      const detail = { _id: `detail-${details.length + 1}`, ...data };
      details.push(detail);
      return detail;
    },
    async createReservation(data) {
      const reservation = { _id: `reservation-${reservations.length + 1}`, ...data };
      reservations.push(reservation);
      return reservation;
    },
    async createPayment(data) {
      payments.push({ _id: `payment-${payments.length + 1}`, ...data });
    },
    async createPaymentAttempt(data) {
      attempts.push({ _id: `attempt-${attempts.length + 1}`, ...data });
      return attempts.at(-1);
    },
    async findCompletedByIdempotencyKey(customerId, idempotencyKey) {
      return orders.find((order) => order.customerId === customerId && order.idempotencyKey === idempotencyKey) || null;
    },
    async listByCustomer(customerId) {
      return orders.filter((order) => order.customerId === customerId);
    },
    async findById(id) {
      return orders.find((order) => order._id === id) || null;
    },
    async listDetails(orderId) {
      return details.filter((detail) => detail.orderId === orderId);
    },
    async claimCustomerCancellation(customerId, id, expectedPaymentStatus, data) {
      const order = orders.find((entry) => (
        entry._id === id
        && entry.customerId === customerId
        && entry.orderStatus === 'Pending'
        && entry.paymentStatus === expectedPaymentStatus
      ));
      if (!order) return null;
      Object.assign(order, data);
      return order;
    },
    async updateOrder(id, data) {
      const order = orders.find((entry) => entry._id === id);
      Object.assign(order, data);
      return order;
    },
    async findPaymentByOrderId(orderId) {
      return payments.find((payment) => payment.orderId === orderId) || null;
    },
    async updatePayment(id, data) {
      const payment = payments.find((entry) => entry._id === id);
      Object.assign(payment, data);
      return payment;
    },
    async findActivePaymentAttemptByOrder(orderId) {
      return attempts.findLast((attempt) => attempt.orderId === orderId && attempt.paymentStatus === 'Pending') || null;
    },
    async findPrimaryPaidPaymentAttemptByOrder(orderId) {
      return attempts.find((attempt) => attempt.orderId === orderId && attempt.paymentStatus === 'Paid') || null;
    },
    async updatePaymentAttempt(id, data) {
      const attempt = attempts.find((entry) => entry._id === id);
      Object.assign(attempt, data);
      return attempt;
    },
    async upsertRefundPending(data) {
      const existing = refunds.find((refund) => refund.obligationKey === data.obligationKey);
      if (existing) return existing;
      const refund = { _id: `refund-${refunds.length + 1}`, ...data };
      refunds.push(refund);
      return refund;
    },
    async updateRefundPending(id, data) {
      const refund = refunds.find((entry) => entry._id === id);
      Object.assign(refund, data);
      return refund;
    },
    async findRefundRequestByObligationKey(orderId, obligationKey) {
      return refundRequests.find((request) => (
        request.orderId === orderId && request.obligationKey === obligationKey
      )) || null;
    },
    async createRefundRequest(data) {
      const request = { _id: `refund-request-${refundRequests.length + 1}`, ...data };
      refundRequests.push(request);
      return request;
    },
    async updateRefundRequest(id, data) {
      const request = refundRequests.find((entry) => entry._id === id);
      Object.assign(request, data);
      return request;
    },
    async enqueuePostCommitWork(item) {
      const existing = outbox.find((entry) => entry.identityKey === item.identityKey);
      if (existing) return existing;
      outbox.push({ _id: `outbox-${outbox.length + 1}`, ...item });
      return outbox.at(-1);
    },
    async listPendingPostCommitWork() {
      return outbox.filter((entry) => entry.status !== 'Completed');
    },
    async markPostCommitWorkDone(id) {
      const entry = outbox.find((item) => item._id === id);
      if (entry) entry.status = 'Completed';
      return entry;
    },
  };
}

function createAuditLogger() {
  const entries = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

function createAddressRepository() {
  const addresses = [
    {
      _id: 'address-owned',
      userId: 'customer-1',
      receiverName: 'Nguyễn Quang Huy',
      phoneNumber: '0987654321',
      province: 'Hà Nội',
      district: 'Cầu Giấy',
      ward: 'Dịch Vọng',
      addressLine: 'Số 12 đường Bếp Việt',
    },
    {
      _id: 'address-foreign',
      userId: 'customer-2',
      receiverName: 'Khách hàng khác',
      phoneNumber: '0911111111',
      province: 'Đà Nẵng',
      district: 'Hải Châu',
      ward: 'Thạch Thang',
      addressLine: 'Số 8 đường khác',
    },
  ];
  return {
    addresses,
    async findByIdForUser(userId, id) {
      return addresses.find((address) => address._id === id && address.userId === userId) || null;
    },
  };
}

describe('order service', () => {
  let orderService;
  let orderRepository;
  let auditLogger;
  let cartRepository;
  let inventoryRepository;
  let emailEvents;
  let retiredPaymentLinks;

  beforeEach(() => {
    orderRepository = createOrderRepository();
    auditLogger = createAuditLogger();
    cartRepository = createCartRepository();
    inventoryRepository = {
      reservedQuantity: 0,
      async reserve(_productId, quantity) { this.reservedQuantity += quantity; },
      async release(_productId, quantity) { this.reservedQuantity -= quantity; },
    };
    emailEvents = [];
    retiredPaymentLinks = [];
    orderService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository,
      productRepository: createProductRepository(),
      inventoryRepository,
      orderRepository,
      addressRepository: createAddressRepository(),
      auditLogger,
      customerRepository: { async findEmail() { return 'customer@example.com'; } },
      emailOutboxService: { async enqueue(event) { emailEvents.push(event); return event; } },
      payosGateway: {
        async cancelPaymentLink(paymentLinkId, reason) {
          retiredPaymentLinks.push({ paymentLinkId, reason });
        },
      },
      settingsService: { async listSettings() { return { PAYMENT_TIMEOUT_MINUTES: 20 }; } },
      clock: () => new Date('2026-07-23T08:00:00.000Z'),
    });
  });

  it('creates a COD order from active customer cart with product snapshots', async () => {
    const result = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'checkout-cod-001' }));

    assert.equal(result.totalAmount, 50);
    assert.equal(result.orderStatus, 'Pending');
    assert.equal(result.paymentStatus, 'Unpaid');
    assert.equal(result.receiverName, 'Khách hàng Demo');
    assert.equal(result.receiverPhone, '0900000001');
    assert.equal(result.shippingAddress, '12 Nguyễn Trãi, Khương Mai, Thanh Xuân, Hà Nội');
    assert.equal(orderRepository.details[0].productNameSnapshot, 'Green Pan');
    assert.equal(orderRepository.details[0].productSkuSnapshot, 'PAN-001');
    assert.equal(orderRepository.details[0].unitSnapshot, 'piece');
    assert.equal(orderRepository.details[0].productImageSnapshot, 'https://cdn.test/pan.jpg');
    assert.equal(orderRepository.payments[0].paymentMethod, 'COD');
    assert.equal(orderRepository.reservations.length, 1);
    assert.equal(orderRepository.reservations[0].reservationKey, `ORDER:${result.id}:detail-1`);
    assert.equal(orderRepository.reservations[0].status, 'Reserved');
    assert.equal(cartRepository.items.length, 1);
    assert.equal(auditLogger.entries[0].action, 'ORDER_CREATE');
  });

  it('AT-227 returns a stable Vietnamese stock error for a final checkout shortage', async () => {
    inventoryRepository.reserve = async () => {
      throw new Error('Insufficient available inventory for checkout');
    };

    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'stock-short-001' })),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.errorCode, 'CHECKOUT_STOCK_INSUFFICIENT');
        assert.match(error.message, /không còn đủ số lượng/i);
        return true;
      },
    );
    assert.equal(cartRepository.carts[0].status, 'Active');
  });

  it('rejects a persisted Cart item with a non-positive quantity before creating an Order', async () => {
    cartRepository.items[0].quantity = 0;

    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({
        idempotencyKey: 'invalid-cart-quantity-001',
      })),
      (error) => error.statusCode === 400 && error.errorCode === 'CART_ITEM_INVALID',
    );

    assert.equal(orderRepository.orders.length, 0);
    assert.equal(orderRepository.details.length, 0);
    assert.equal(inventoryRepository.reservedQuantity, 0);
    assert.equal(cartRepository.carts[0].status, 'Active');
  });

  it('returns no sellable Product for a malformed MongoDB ObjectId', async () => {
    const repository = createModelProductRepository();

    assert.equal(await repository.findSellableById('not-a-mongo-id'), null);
  });

  it('creates an online checkout as Pending without creating a synthetic provider attempt', async () => {
    const result = await orderService.placeOrder('customer-1', checkoutInput({
      paymentMethod: 'ONLINE',
      idempotencyKey: 'checkout-online-001',
    }));

    assert.equal(result.orderStatus, 'Pending');
    assert.equal(result.paymentStatus, 'Pending');
    assert.equal(result.paymentDeadlineAt, '2026-07-23T08:20:00.000Z');
    assert.equal(orderRepository.payments.length, 1);
    assert.equal(orderRepository.attempts.length, 0);
  });

  it('AT-201 reads and snapshots the timeout version inside the Order transaction at create time', async () => {
    const transactionSession = { id: 'order-setting-transaction' };
    const settingReads = [];
    const localOrderRepository = createOrderRepository();
    const localCartRepository = createCartRepository();
    const createdAt = new Date('2026-07-23T09:00:00.000Z');
    const service = createOrderService({
      transactionManager: { async withTransaction(work) { return work(transactionSession); } },
      cartRepository: localCartRepository,
      productRepository: createProductRepository(),
      inventoryRepository: { async reserve() { return {}; } },
      orderRepository: localOrderRepository,
      addressRepository: createAddressRepository(),
      auditLogger: { async log() {} },
      settingsService: {
        async getCurrentSnapshot(session) {
          settingReads.push(session);
          return {
            version: 7,
            effectiveAt: new Date('2026-07-23T08:59:00.000Z'),
            values: { PAYMENT_TIMEOUT_MINUTES: 30, LOW_STOCK_DEFAULT_THRESHOLD: 5 },
          };
        },
      },
      clock: () => new Date(createdAt),
    });

    const result = await service.placeOrder('customer-1', checkoutInput({
      paymentMethod: 'ONLINE',
      idempotencyKey: 'checkout-setting-snapshot-001',
    }));

    assert.deepEqual(settingReads, [transactionSession]);
    assert.equal(result.paymentDeadlineAt, '2026-07-23T09:30:00.000Z');
    assert.equal(localOrderRepository.orders[0].createdAt.toISOString(), createdAt.toISOString());
    assert.equal(localOrderRepository.orders[0].paymentTimeoutMinutesSnapshot, 30);
    assert.equal(localOrderRepository.orders[0].paymentTimeoutSettingVersion, 7);
  });

  it('rejects a stale displayed line price before reserving stock', async () => {
    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({
        idempotencyKey: 'checkout-stale-price-001',
        expectedItems: [
          { productId: 'p1', quantity: 2, unitPrice: 24, priceVersion: '2026-07-22T00:00:00.000Z' },
        ],
      })),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.errorCode, 'PRICE_CHANGED');
        assert.equal(error.errors[0].field, 'expectedItems.p1.unitPrice');
        return true;
      }
    );

    assert.equal(inventoryRepository.reservedQuantity, 0);
    assert.equal(orderRepository.orders.length, 0);
  });

  it('rejects a stale displayed price version even when the numeric price matches', async () => {
    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({
        idempotencyKey: 'checkout-stale-price-version-001',
        expectedItems: [
          { productId: 'p1', quantity: 2, unitPrice: 25, priceVersion: '2026-07-22T00:00:00.000Z' },
        ],
      })),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.errorCode, 'PRICE_CHANGED');
        assert.equal(error.errors[0].field, 'expectedItems.p1.priceVersion');
        return true;
      }
    );
    assert.equal(inventoryRepository.reservedQuantity, 0);
  });

  it('accepts the dedicated priceVersion after an ordinary metadata edit changes updatedAt', async () => {
    const dedicatedPriceVersion = new Date('2026-07-22T00:00:00.000Z');
    orderService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository,
      productRepository: createProductRepository({
        priceVersion: dedicatedPriceVersion,
        updatedAt: new Date('2026-07-24T00:00:00.000Z'),
      }),
      inventoryRepository,
      orderRepository,
      addressRepository: createAddressRepository(),
      auditLogger,
    });

    const result = await orderService.placeOrder('customer-1', checkoutInput({
      idempotencyKey: 'checkout-metadata-edit-001',
      expectedItems: [{
        productId: 'p1',
        quantity: 2,
        unitPrice: 25,
        priceVersion: dedicatedPriceVersion.toISOString(),
      }],
    }));

    assert.equal(
      result.details[0].priceVersionSnapshot,
      dedicatedPriceVersion.toISOString(),
    );
    assert.equal(inventoryRepository.reservedQuantity, 2);
  });

  it('rejects a real dedicated priceVersion mismatch even when updatedAt matches the display', async () => {
    const displayedVersion = new Date('2026-07-22T00:00:00.000Z');
    orderService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository,
      productRepository: createProductRepository({
        priceVersion: new Date('2026-07-23T00:00:00.000Z'),
        updatedAt: displayedVersion,
      }),
      inventoryRepository,
      orderRepository,
      addressRepository: createAddressRepository(),
      auditLogger,
    });

    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({
        idempotencyKey: 'checkout-real-price-change-001',
        expectedItems: [{
          productId: 'p1',
          quantity: 2,
          unitPrice: 25,
          priceVersion: displayedVersion.toISOString(),
        }],
      })),
      (error) => error.errorCode === 'PRICE_CHANGED',
    );
    assert.equal(inventoryRepository.reservedQuantity, 0);
  });

  it('AT-175/177 atomically records Order audit and one canonical ORDER_RECEIVED outbox event', async () => {
    const result = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'checkout-email-001' }));
    const replay = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'checkout-email-001' }));

    assert.equal(replay.id, result.id);
    assert.equal(emailEvents.length, 0, 'email delivery belongs to the post-commit Notification consumer');
    const notificationEvent = orderRepository.outbox.find(
      (entry) => entry.eventType === 'ORDER_RECEIVED',
    );
    assert.ok(notificationEvent);
    assert.equal(notificationEvent.businessEventId, `order:${result.id}:received`);
    assert.equal(notificationEvent.aggregateType, 'Order');
    assert.equal(notificationEvent.aggregateId, result.id);
    assert.equal(notificationEvent.payloadSchemaVersion, 1);
    assert.equal(notificationEvent.payload.recipientId, 'customer-1');
    assert.equal(notificationEvent.payload.displayValues.orderCode, result.orderCode);
    assert.match(notificationEvent.eventHash, /^[a-f0-9]{64}$/);
    assert.equal(auditLogger.entries.filter((entry) => entry.action === 'ORDER_CREATE').length, 1);
  });

  it('AT-175 fails checkout when mandatory audit or canonical outbox persistence fails', async () => {
    const repository = createOrderRepository();
    repository.enqueuePostCommitWork = async () => {
      throw new Error('mandatory outbox unavailable');
    };
    orderService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository: createCartRepository(),
      productRepository: createProductRepository(),
      inventoryRepository: { async reserve() {} },
      orderRepository: repository,
      auditLogger: { async log() {} },
    });

    await assert.rejects(
      () => orderService.placeOrder(
        'customer-1',
        checkoutInput({ idempotencyKey: 'checkout-email-fail-001' }),
      ),
      /mandatory outbox unavailable/,
    );
  });

  it('rejects checkout when customer cart is empty', async () => {
    orderService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository: {
        async findActiveByCustomer() {
          return {
            _id: 'empty-cart',
            customerId: 'customer-1',
            status: 'Active',
            version: 1,
          };
        },
        async listItems() {
          return [];
        },
      },
      productRepository: createProductRepository(),
      inventoryRepository: { async reserve() {} },
      orderRepository,
      auditLogger,
    });

    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({
        cartId: 'empty-cart',
        idempotencyKey: 'empty-001',
      })),
      /Cart must have at least one item/
    );
  });

  it('cancels a Pending unpaid customer order', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'cancel-001' }));

    const cancelled = await orderService.cancelOrder('customer-1', order.id, {
      cancelReason: 'Changed my mind',
      idempotencyKey: 'cancel-command-001',
    });

    assert.equal(cancelled.orderStatus, 'Cancelled');
    assert.equal(cancelled.paymentStatus, 'Unpaid');
    assert.equal(orderRepository.payments[0].paymentStatus, 'Unpaid');
    assert.equal(inventoryRepository.reservedQuantity, 0);
    assert.equal(auditLogger.entries.at(-1).action, 'ORDER_CANCEL');
    const notificationEvent = orderRepository.outbox.find(
      (entry) => entry.eventType === 'ORDER_CANCELLED',
    );
    assert.ok(notificationEvent);
    assert.equal(notificationEvent.payload.recipientId, 'customer-1');
    assert.equal(notificationEvent.payload.displayValues.orderCode, order.orderCode);
    assert.equal(notificationEvent.payloadSchemaVersion, 1);
    const replay = await orderService.cancelOrder('customer-1', order.id, {
      cancelReason: 'Changed my mind',
      idempotencyKey: 'cancel-command-001',
    });
    assert.equal(replay.id, cancelled.id);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(inventoryRepository.reservedQuantity, 0);
  });

  it('claims only customer-cancellation audit events from the shared domain outbox', async () => {
    let requestedTypes = null;
    const service = createOrderService({
      orderRepository: {
        async listPendingPostCommitWork(eventTypes) {
          requestedTypes = eventTypes;
          return [];
        },
      },
    });

    await service.drainPostCommitWork();

    assert.deepEqual(requestedTypes, ['ORDER_CANCEL_AUDIT']);
  });

  it('does not publish a durable cancellation event claimed by another worker', async () => {
    const entries = [];
    let claimedId = null;
    const service = createOrderService({
      orderRepository: {
        async listPendingPostCommitWork() {
          return [{
            _id: 'outbox-order-lost',
            identityKey: 'ORDER_CANCEL_AUDIT:lost',
            eventType: 'ORDER_CANCEL_AUDIT',
            payload: { action: 'ORDER_CANCEL' },
          }];
        },
        async claimPostCommitWork(id) {
          claimedId = id;
          return null;
        },
      },
      auditLogger: { async log(entry) { entries.push(entry); } },
    });

    await service.drainPostCommitWork();

    assert.equal(claimedId, 'outbox-order-lost');
    assert.equal(entries.length, 0);
  });

  it('does not publish a transaction-local cancellation outbox item when commit fails', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({
      idempotencyKey: 'cancel-outbox-rollback-checkout-001',
    }));
    const rollbackAudit = createAuditLogger();
    const rollbackRepository = {
      ...orderRepository,
      async enqueuePostCommitWork(item) {
        return { _id: 'transaction-local-outbox', ...item };
      },
      async listPendingPostCommitWork() {
        return [];
      },
    };
    const rollbackService = createOrderService({
      transactionManager: {
        async withTransaction(work) {
          await work({ id: 'rolled-back-session' });
          throw new Error('commit failed');
        },
      },
      cartRepository,
      productRepository: createProductRepository(),
      inventoryRepository,
      orderRepository: rollbackRepository,
      auditLogger: rollbackAudit,
    });

    await assert.rejects(
      () => rollbackService.cancelOrder('customer-1', order.id, {
        cancelReason: 'Rollback audit check',
        idempotencyKey: 'cancel-outbox-rollback-command-001',
      }),
      /commit failed/,
    );
    await rollbackService.drainPostCommitWork();
  });

  it('fails closed when an order reservation lineage cannot be claimed during cancellation', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'cancel-missing-lineage-checkout-001' }));
    orderRepository.details[0]._id = 'detail-lineage-1';
    let releaseCalls = 0;
    orderRepository.claimReservationRelease = async () => null;
    inventoryRepository.release = async () => {
      releaseCalls += 1;
    };

    await assert.rejects(
      () => orderService.cancelOrder('customer-1', order.id, {
        cancelReason: 'Missing lineage',
        idempotencyKey: 'cancel-missing-lineage-command-001',
      }),
      /reservation lineage is missing or already released/i,
    );
    assert.equal(releaseCalls, 0);
  });

  it('AT-175 fails cancellation when its mandatory audit cannot persist', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'cancel-audit-checkout-001' }));
    const resilientService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository,
      productRepository: createProductRepository(),
      inventoryRepository,
      orderRepository,
      auditLogger: {
        async log(entry) {
          if (entry.action === 'ORDER_CANCEL') throw new Error('audit unavailable');
        },
      },
    });

    await assert.rejects(
      () => resilientService.cancelOrder('customer-1', order.id, {
        cancelReason: 'Audit retry',
        idempotencyKey: 'cancel-audit-command-001',
      }),
      /audit unavailable/,
    );
  });

  it('retires only the active online attempt when a customer cancels an unpaid order', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({
      paymentMethod: 'ONLINE',
      idempotencyKey: 'cancel-online-checkout-001',
    }));
    orderRepository.orders[0].paymentStatus = 'Failed';
    orderRepository.payments[0].paymentStatus = 'Failed';
    orderRepository.attempts.push(
      { _id: 'attempt-old', orderId: order.id, paymentStatus: 'Failed', amount: 50, currency: 'VND' },
      {
        _id: 'attempt-active',
        orderId: order.id,
        paymentStatus: 'Pending',
        amount: 50,
        currency: 'VND',
        paymentLinkId: 'payos-link-active',
      }
    );

    const cancelled = await orderService.cancelOrder('customer-1', order.id, {
      cancelReason: 'No longer needed',
      idempotencyKey: 'cancel-online-command-001',
    });

    assert.equal(cancelled.paymentStatus, 'Cancelled');
    assert.equal(orderRepository.attempts[0].paymentStatus, 'Failed');
    assert.equal(orderRepository.attempts[1].paymentStatus, 'Cancelled');
    assert.deepEqual(retiredPaymentLinks, [{
      paymentLinkId: 'payos-link-active',
      reason: 'Customer cancelled order',
    }]);
  });

  it('rejects reuse of a cancellation idempotency key with a different reason', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'cancel-conflict-checkout-001' }));
    await orderService.cancelOrder('customer-1', order.id, {
      cancelReason: 'Ordered twice',
      idempotencyKey: 'cancel-conflict-command-001',
    });

    await assert.rejects(
      () => orderService.cancelOrder('customer-1', order.id, {
        cancelReason: 'Price changed',
        idempotencyKey: 'cancel-conflict-command-001',
      }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.errorCode, 'IDEMPOTENCY_KEY_REUSED');
        return true;
      }
    );
  });

  it('cancels a paid online Pending order and creates one refund hand-off', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({
      paymentMethod: 'ONLINE',
      idempotencyKey: 'cancel-paid-checkout-001',
    }));
    orderRepository.orders[0].paymentStatus = 'Paid';
    orderRepository.payments[0].paymentStatus = 'Paid';
    orderRepository.attempts.push({
      _id: 'attempt-paid',
      orderId: order.id,
      paymentStatus: 'Paid',
      amount: 50,
      currency: 'VND',
    });

    const input = {
      cancelReason: 'Customer requested cancellation',
      idempotencyKey: 'cancel-paid-command-001',
    };
    const cancelled = await orderService.cancelOrder('customer-1', order.id, input);

    assert.equal(cancelled.orderStatus, 'Cancelled');
    assert.equal(cancelled.paymentStatus, 'Paid');
    assert.equal(cancelled.moneyObligationsSettled, false);
    assert.equal(orderRepository.orders[0].orderStatus, 'Cancelled');
    assert.equal(orderRepository.payments[0].paymentStatus, 'Paid');
    assert.equal(orderRepository.attempts[0].paymentStatus, 'Paid');
    assert.equal(orderRepository.refunds.length, 1);
    assert.equal(orderRepository.refunds[0].status, 'RefundPending');
    assert.equal(orderRepository.refunds[0].obligationKey, 'PAYMENT_REVERSAL:attempt-paid');
    assert.equal(orderRepository.refunds[0].returnRefundRequestId, 'refund-request-1');
    assert.equal(orderRepository.refundRequests.length, 1);
    assert.equal(orderRepository.refundRequests[0].status, 'ReadyForRefund');
    assert.equal(orderRepository.refundRequests[0].refundPendingId, 'refund-1');

    const replay = await orderService.cancelOrder('customer-1', order.id, input);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(orderRepository.refunds.length, 1);
    assert.equal(orderRepository.refundRequests.length, 1);
  });

  it('cancels an online Pending payment before provider settlement and retires its active link', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({
      paymentMethod: 'ONLINE',
      idempotencyKey: 'cancel-pending-checkout-001',
    }));
    orderRepository.attempts.push({
      _id: 'attempt-pending',
      orderId: order.id,
      paymentStatus: 'Pending',
      amount: 50,
      currency: 'VND',
      paymentLinkId: 'payos-link-pending',
    });

    const cancelled = await orderService.cancelOrder('customer-1', order.id, {
      cancelReason: 'Customer requested cancellation before payment',
      idempotencyKey: 'cancel-pending-command-001',
    });

    assert.equal(cancelled.orderStatus, 'Cancelled');
    assert.equal(cancelled.paymentStatus, 'Cancelled');
    assert.equal(orderRepository.payments[0].paymentStatus, 'Cancelled');
    assert.equal(orderRepository.attempts[0].paymentStatus, 'Cancelled');
    assert.deepEqual(retiredPaymentLinks, [{
      paymentLinkId: 'payos-link-pending',
      reason: 'Customer cancelled order',
    }]);
    assert.equal(orderRepository.refunds.length, 0);
  });

  it('generates unique order codes when orders are placed in the same millisecond', async () => {
    const originalNow = Date.now;
    Date.now = () => 1710000000000;
    try {
      const cartRepository = {
        carts: [
          { _id: 'cart-1', customerId: 'customer-1', status: 'Active', version: 1 },
          { _id: 'cart-2', customerId: 'customer-2', status: 'Active', version: 1 },
        ],
        items: [
          { _id: 'item-1', cartId: 'cart-1', productId: 'p1', productName: 'Green Pan', quantity: 1, unitPrice: 25 },
          { _id: 'item-2', cartId: 'cart-2', productId: 'p1', productName: 'Green Pan', quantity: 1, unitPrice: 25 },
        ],
        async findActiveByCustomer(customerId) {
          return this.carts.find((cart) => cart.customerId === customerId && cart.status === 'Active') || null;
        },
        async listItems(cartId) {
          return this.items.filter((item) => item.cartId === cartId);
        },
        async markCheckedOut(cartId) {
          const cart = this.carts.find((entry) => entry._id === cartId);
          cart.status = 'CheckedOut';
        },
        async clearExactCart(cartId) {
          const cart = this.carts.find((entry) => entry._id === cartId);
          cart.status = 'CheckedOut';
          return cart;
        },
      };
    orderService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository,
      productRepository: createProductRepository(),
      inventoryRepository: { async reserve() {} },
        orderRepository,
        auditLogger,
      });

      const first = await orderService.placeOrder('customer-1', checkoutInput({
        idempotencyKey: 'unique-001',
        expectedItems: [{ productId: 'p1', quantity: 1, unitPrice: 25, priceVersion: '2026-07-23T00:00:00.000Z' }],
      }));
      const second = await orderService.placeOrder('customer-2', checkoutInput({
        cartId: 'cart-2',
        deliveryAddress: { province: 'Đà Nẵng', district: 'Hải Châu', ward: 'Hòa Cường', addressLine: '12 Bạch Đằng' },
        idempotencyKey: 'unique-002',
        expectedItems: [{ productId: 'p1', quantity: 1, unitPrice: 25, priceVersion: '2026-07-23T00:00:00.000Z' }],
      }));

      assert.notEqual(first.orderCode, second.orderCode);
    } finally {
      Date.now = originalNow;
    }
  });

  it('requires a non-empty idempotency key for checkout', async () => {
    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput()),
      /Idempotency-Key is required/
    );
  });

  it('returns the original order for a completed idempotency key without creating another order', async () => {
    const input = checkoutInput({ idempotencyKey: 'retry-001' });
    const first = await orderService.placeOrder('customer-1', input);
    const second = await orderService.placeOrder('customer-1', input);

    assert.equal(second.id, first.id);
    assert.equal(orderRepository.orders.length, 1);
    assert.equal(orderRepository.details.length, 1);
  });

  it('rejects an idempotency key replay when the checkout facts have changed', async () => {
    await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'retry-conflict-001' }));

    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({
        idempotencyKey: 'retry-conflict-001',
        paymentMethod: 'ONLINE',
      })),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.errorCode, 'IDEMPOTENCY_KEY_REUSED');
        return true;
      }
    );
    assert.equal(orderRepository.orders.length, 1);
  });

  it('does not let an idempotency replay bypass the required checkout address source', async () => {
    await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'retry-source-001' }));

    await assert.rejects(
      () => orderService.placeOrder('customer-1', {
        cartId: 'cart-1',
        cartVersion: 1,
        paymentMethod: 'COD',
        idempotencyKey: 'retry-source-001',
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.errorCode, 'CHECKOUT_ADDRESS_SOURCE_INVALID');
        return true;
      }
    );
    assert.equal(orderRepository.orders.length, 1);
  });

  it('runs all checkout writes inside a transaction and does not audit when transaction rolls back', async () => {
    const calls = [];
    const failingRepository = createOrderRepository();
    failingRepository.withTransaction = async (work) => {
      calls.push('start');
      await assert.rejects(() => work({ id: 'session-1' }), /reservation failed/);
      calls.push('rollback');
      throw new Error('reservation failed');
    };

    const transactionalCart = createCartRepository();
    transactionalCart.clearExactCart = async (_cartId, session) => calls.push(`clear:${session.id}`);
    const inventoryRepository = {
      async reserve(productId, quantity, session) {
        calls.push(`reserve:${productId}:${quantity}:${session.id}`);
        throw new Error('reservation failed');
      },
    };
    orderService = createOrderService({
      transactionManager: failingRepository,
      cartRepository: transactionalCart,
      productRepository: createProductRepository(),
      orderRepository: failingRepository,
      inventoryRepository,
      auditLogger,
    });

    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'rollback-001' })),
      /reservation failed/
    );
    assert.deepEqual(calls, ['start', 'reserve:p1:2:session-1', 'rollback']);
    assert.equal(auditLogger.entries.length, 0);
  });

  it('persists a supplied cancel reason and rejects confirmed orders', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'reason-001' }));
    const cancelled = await orderService.cancelOrder('customer-1', order.id, {
      cancelReason: 'Đổi ý',
      idempotencyKey: 'reason-cancel-001',
    });
    assert.equal(orderRepository.orders[0].cancelReason, 'Đổi ý');
    assert.equal(cancelled.orderStatus, 'Cancelled');

    const confirmedRepository = createOrderRepository();
    const confirmedService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository: createCartRepository(),
      productRepository: createProductRepository(),
      inventoryRepository,
      orderRepository: confirmedRepository,
      addressRepository: createAddressRepository(),
      auditLogger,
    });
    const confirmed = await confirmedService.placeOrder(
      'customer-1',
      checkoutInput({ idempotencyKey: 'reason-confirmed-001' })
    );
    confirmedRepository.orders[0].orderStatus = 'Confirmed';
    await assert.rejects(
      () => confirmedService.cancelOrder('customer-1', confirmed.id, {
        cancelReason: 'Too late',
        idempotencyKey: 'reason-confirmed-cancel-001',
      }),
      /Only Pending orders/
    );
  });

  it('validates receiver identity and Vietnamese phone before reserving stock', async () => {
    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({ deliveryAddress: { receiverName: '' }, idempotencyKey: 'invalid-name-001' })),
      (error) => {
        assert.equal(error.errorCode, 'CHECKOUT_ADDRESS_INVALID');
        assert.equal(error.errors[0].field, 'receiverName');
        return true;
      }
    );
    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({ deliveryAddress: { phoneNumber: '12345' }, idempotencyKey: 'invalid-phone-001' })),
      (error) => {
        assert.equal(error.errorCode, 'CHECKOUT_ADDRESS_INVALID');
        assert.equal(error.errors[0].field, 'phoneNumber');
        return true;
      }
    );
    assert.equal(inventoryRepository.reservedQuantity, 0);
  });

  it('resolves an owned savedAddressId on the server and stores an immutable snapshot', async () => {
    const result = await orderService.placeOrder('customer-1', {
      cartId: 'cart-1',
      cartVersion: 1,
      savedAddressId: 'address-owned',
      paymentMethod: 'COD',
      idempotencyKey: 'saved-address-001',
      expectedItems: [{ productId: 'p1', quantity: 2, unitPrice: 25, priceVersion: '2026-07-23T00:00:00.000Z' }],
    });

    assert.equal(result.receiverName, 'Nguyễn Quang Huy');
    assert.equal(result.receiverPhone, '0987654321');
    assert.equal(result.shippingAddress, 'Số 12 đường Bếp Việt, Dịch Vọng, Cầu Giấy, Hà Nội');
  });

  it('replays a saved-address checkout after the saved address is deleted', async () => {
    const addressRepository = createAddressRepository();
    const service = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository,
      productRepository: createProductRepository(),
      inventoryRepository,
      orderRepository,
      addressRepository,
      auditLogger,
    });
    const input = {
      cartId: 'cart-1',
      cartVersion: 1,
      savedAddressId: 'address-owned',
      paymentMethod: 'COD',
      idempotencyKey: 'saved-address-replay-001',
      expectedItems: [{ productId: 'p1', quantity: 2, unitPrice: 25, priceVersion: '2026-07-23T00:00:00.000Z' }],
    };
    const first = await service.placeOrder('customer-1', input);
    addressRepository.addresses.splice(0, 1);
    const replay = await service.placeOrder('customer-1', input);
    assert.equal(replay.id, first.id);
    assert.equal(replay.shippingAddress, first.shippingAddress);
  });

  it('requires exactly one supported checkout address source with typed field errors', async () => {
    await assert.rejects(
      () => orderService.placeOrder('customer-1', {
        cartId: 'cart-1',
        cartVersion: 1,
        paymentMethod: 'COD',
        idempotencyKey: 'address-source-none-001',
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.errorCode, 'CHECKOUT_ADDRESS_SOURCE_INVALID');
        assert.deepEqual(error.errors, [{ field: 'addressSource', message: 'Chọn một địa chỉ đã lưu hoặc nhập địa chỉ mới' }]);
        return true;
      }
    );

    await assert.rejects(
      () => orderService.placeOrder('customer-1', checkoutInput({ savedAddressId: 'address-owned', idempotencyKey: 'address-source-both-001' })),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.errorCode, 'CHECKOUT_ADDRESS_SOURCE_INVALID');
        assert.deepEqual(error.errors, [{ field: 'addressSource', message: 'Chỉ được chọn một nguồn địa chỉ nhận hàng' }]);
        return true;
      }
    );
    assert.equal(inventoryRepository.reservedQuantity, 0);
  });

  it('rejects a savedAddressId that is not owned by the customer before reserving stock', async () => {
    await assert.rejects(
      () => orderService.placeOrder('customer-1', {
        cartId: 'cart-1',
        cartVersion: 1,
        savedAddressId: 'address-foreign',
        paymentMethod: 'COD',
        idempotencyKey: 'saved-address-foreign-001',
      }),
      (error) => {
        assert.equal(error.statusCode, 404);
        assert.equal(error.errorCode, 'CHECKOUT_ADDRESS_NOT_FOUND');
        return true;
      }
    );
    assert.equal(inventoryRepository.reservedQuantity, 0);
  });

  it('validates and snapshots a structured one-time deliveryAddress', async () => {
    const result = await orderService.placeOrder('customer-1', {
      cartId: 'cart-1',
      cartVersion: 1,
      deliveryAddress: {
        receiverName: 'Khách hàng Một lần',
        phoneNumber: '0900000001',
        province: 'Hà Nội',
        district: 'Thanh Xuân',
        ward: 'Khương Mai',
        addressLine: 'Số 20 phố Hoàng Văn Thái',
      },
      paymentMethod: 'COD',
      idempotencyKey: 'one-time-address-001',
      expectedItems: [{ productId: 'p1', quantity: 2, unitPrice: 25, priceVersion: '2026-07-23T00:00:00.000Z' }],
    });

    assert.equal(result.receiverName, 'Khách hàng Một lần');
    assert.equal(result.receiverPhone, '0900000001');
    assert.equal(result.shippingAddress, 'Số 20 phố Hoàng Văn Thái, Khương Mai, Thanh Xuân, Hà Nội');
  });

  it('returns distinct validation details for oversized administrative address fields', async () => {
    await assert.rejects(
      () => orderService.placeOrder('customer-1', {
        cartId: 'cart-1',
        cartVersion: 1,
        deliveryAddress: {
          receiverName: 'Khách hàng Demo',
          phoneNumber: '0900000001',
          province: 'x'.repeat(101),
          district: 'Thanh Xuân',
          ward: 'Khương Mai',
          addressLine: 'Số 20 phố Hoàng Văn Thái',
        },
        paymentMethod: 'COD',
        idempotencyKey: 'oversized-province-001',
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.errorCode, 'CHECKOUT_ADDRESS_INVALID');
        assert.equal(error.errors[0].field, 'province');
        assert.equal(error.errors[0].message, 'Tỉnh/Thành không được vượt quá 100 ký tự');
        return true;
      }
    );
  });
});
