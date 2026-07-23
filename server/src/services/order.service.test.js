const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createOrderService } = require('./order.service');

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
    paymentMethod: 'COD',
    ...inputOverrides,
  };
}

function createCartRepository() {
  const carts = [{ _id: 'cart-1', customerId: 'customer-1', status: 'Active' }];
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
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index].cartId === cartId) items.splice(index, 1);
      }
      return cart;
    },
  };
}

function createProductRepository() {
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
      };
    },
  };
}

function createOrderRepository() {
  const orders = [];
  const details = [];
  const payments = [];
  return {
    orders,
    details,
    payments,
    async createOrder(data) {
      const order = { _id: `order-${orders.length + 1}`, orderCode: `ORD-${orders.length + 1}`, ...data };
      orders.push(order);
      return order;
    },
    async createOrderDetail(data) {
      details.push({ _id: `detail-${details.length + 1}`, ...data });
    },
    async createPayment(data) {
      payments.push({ _id: `payment-${payments.length + 1}`, ...data });
    },
    async createPaymentAttempt(data) {
      payments.push({ _id: `attempt-${payments.length + 1}`, ...data });
      return payments.at(-1);
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
    async claimCustomerCancellation(customerId, id, data) {
      const order = orders.find((entry) => (
        entry._id === id
        && entry.customerId === customerId
        && ['Pending', 'WaitingForPayment'].includes(entry.orderStatus)
        && ['Unpaid', 'Pending', 'Failed'].includes(entry.paymentStatus)
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
    assert.equal(cartRepository.items.length, 0);
    assert.equal(auditLogger.entries[0].action, 'ORDER_CREATE');
  });

  it('enqueues one idempotent ORDER_CREATED email after checkout commits', async () => {
    const result = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'checkout-email-001' }));
    const replay = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'checkout-email-001' }));

    assert.equal(replay.id, result.id);
    assert.equal(emailEvents.length, 1);
    assert.equal(emailEvents[0].eventType, 'ORDER_CREATED');
    assert.equal(emailEvents[0].idempotencyKey, `ORDER_CREATED:${result.id}`);
    assert.equal(emailEvents[0].recipient, 'customer@example.com');
    assert.equal(emailEvents[0].payload.orderCode, result.orderCode);
  });

  it('keeps the committed order response when customer email lookup or enqueue fails', async () => {
    const failures = [];
    orderService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository: createCartRepository(),
      productRepository: createProductRepository(),
      inventoryRepository: { async reserve() {} },
      orderRepository: createOrderRepository(),
      auditLogger: { async log(entry) { failures.push(entry); } },
      customerRepository: { async findEmail() { throw new Error('customer lookup unavailable'); } },
      emailOutboxService: { async enqueue() { throw new Error('outbox unavailable'); } },
    });

    const result = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'checkout-email-fail-001' }));
    assert.equal(result.orderStatus, 'Pending');
    assert.equal(failures.at(-1).action, 'EMAIL_OUTBOX_ENQUEUE_FAILED');
  });

  it('rejects checkout when customer cart is empty', async () => {
    orderService = createOrderService({
      transactionManager: { async withTransaction(work) { return work({ id: 'test-session' }); } },
      cartRepository: {
        async findActiveByCustomer() {
          return { _id: 'empty-cart', customerId: 'customer-1', status: 'Active' };
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
      () => orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'empty-001' })),
      /Cart must have at least one item/
    );
  });

  it('cancels a Pending unpaid customer order', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'cancel-001' }));

    const cancelled = await orderService.cancelOrder('customer-1', order.id);

    assert.equal(cancelled.orderStatus, 'Cancelled');
    assert.equal(inventoryRepository.reservedQuantity, 0);
    assert.equal(auditLogger.entries.at(-1).action, 'ORDER_CANCEL');
    await assert.rejects(() => orderService.cancelOrder('customer-1', order.id), /Only unpaid pre-confirmation orders/);
    assert.equal(inventoryRepository.reservedQuantity, 0);
  });

  it('generates unique order codes when orders are placed in the same millisecond', async () => {
    const originalNow = Date.now;
    Date.now = () => 1710000000000;
    try {
      const cartRepository = {
        carts: [
          { _id: 'cart-1', customerId: 'customer-1', status: 'Active' },
          { _id: 'cart-2', customerId: 'customer-2', status: 'Active' },
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

      const first = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'unique-001' }));
      const second = await orderService.placeOrder('customer-2', checkoutInput({
        deliveryAddress: { province: 'Đà Nẵng', district: 'Hải Châu', ward: 'Hòa Cường', addressLine: '12 Bạch Đằng' },
        idempotencyKey: 'unique-002',
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

  it('does not let an idempotency replay bypass the required checkout address source', async () => {
    await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'retry-source-001' }));

    await assert.rejects(
      () => orderService.placeOrder('customer-1', { paymentMethod: 'COD', idempotencyKey: 'retry-source-001' }),
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

  it('persists a supplied cancel reason and rejects paid or confirmed orders', async () => {
    const order = await orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'reason-001' }));
    const cancelled = await orderService.cancelOrder('customer-1', order.id, { cancelReason: 'Đổi ý' });
    assert.equal(orderRepository.orders[0].cancelReason, 'Đổi ý');
    assert.equal(cancelled.orderStatus, 'Cancelled');

    orderRepository.orders[0].paymentStatus = 'Paid';
    await assert.rejects(() => orderService.cancelOrder('customer-1', order.id, {}), /Only unpaid pre-confirmation orders/);
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
      savedAddressId: 'address-owned',
      paymentMethod: 'COD',
      idempotencyKey: 'saved-address-001',
    });

    assert.equal(result.receiverName, 'Nguyễn Quang Huy');
    assert.equal(result.receiverPhone, '0987654321');
    assert.equal(result.shippingAddress, 'Số 12 đường Bếp Việt, Dịch Vọng, Cầu Giấy, Hà Nội');
  });

  it('requires exactly one supported checkout address source with typed field errors', async () => {
    await assert.rejects(
      () => orderService.placeOrder('customer-1', { paymentMethod: 'COD', idempotencyKey: 'address-source-none-001' }),
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
    });

    assert.equal(result.receiverName, 'Khách hàng Một lần');
    assert.equal(result.receiverPhone, '0900000001');
    assert.equal(result.shippingAddress, 'Số 20 phố Hoàng Văn Thái, Khương Mai, Thanh Xuân, Hà Nội');
  });

  it('returns distinct validation details for oversized administrative address fields', async () => {
    await assert.rejects(
      () => orderService.placeOrder('customer-1', {
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
