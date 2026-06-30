const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createOrderService } = require('./order.service');

function createCartRepository() {
  const carts = [{ _id: 'cart-1', customerId: 'customer-1', status: 'Active' }];
  const items = [
    { _id: 'item-1', cartId: 'cart-1', productId: 'p1', productName: 'Green Pan', quantity: 2, unitPrice: 25 },
  ];
  return {
    carts,
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
  };
}

function createProductRepository() {
  return {
    async findSellableById(id) {
      if (id !== 'p1') return null;
      return { _id: 'p1', name: 'Green Pan', price: 25, status: 'Active', stockQuantity: 5 };
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
    async listByCustomer(customerId) {
      return orders.filter((order) => order.customerId === customerId);
    },
    async findById(id) {
      return orders.find((order) => order._id === id) || null;
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

describe('order service', () => {
  let orderService;
  let orderRepository;
  let auditLogger;

  beforeEach(() => {
    orderRepository = createOrderRepository();
    auditLogger = createAuditLogger();
    orderService = createOrderService({
      cartRepository: createCartRepository(),
      productRepository: createProductRepository(),
      orderRepository,
      auditLogger,
    });
  });

  it('creates a COD order from active customer cart with product snapshots', async () => {
    const result = await orderService.placeOrder('customer-1', {
      shippingAddress: 'Ha Noi',
      paymentMethod: 'COD',
    });

    assert.equal(result.totalAmount, 50);
    assert.equal(result.orderStatus, 'Pending');
    assert.equal(result.paymentStatus, 'Pending');
    assert.equal(orderRepository.details[0].productNameSnapshot, 'Green Pan');
    assert.equal(orderRepository.payments[0].paymentMethod, 'COD');
    assert.equal(auditLogger.entries[0].action, 'ORDER_CREATE');
  });

  it('rejects checkout when customer cart is empty', async () => {
    orderService = createOrderService({
      cartRepository: {
        async findActiveByCustomer() {
          return { _id: 'empty-cart', customerId: 'customer-1', status: 'Active' };
        },
        async listItems() {
          return [];
        },
      },
      productRepository: createProductRepository(),
      orderRepository,
      auditLogger,
    });

    await assert.rejects(
      () => orderService.placeOrder('customer-1', { shippingAddress: 'Ha Noi', paymentMethod: 'COD' }),
      /Cart must have at least one item/
    );
  });

  it('cancels a Pending unpaid customer order', async () => {
    const order = await orderService.placeOrder('customer-1', {
      shippingAddress: 'Ha Noi',
      paymentMethod: 'COD',
    });

    const cancelled = await orderService.cancelOrder('customer-1', order.id);

    assert.equal(cancelled.orderStatus, 'Cancelled');
    assert.equal(auditLogger.entries.at(-1).action, 'ORDER_CANCEL');
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
      };
      orderService = createOrderService({
        cartRepository,
        productRepository: createProductRepository(),
        orderRepository,
        auditLogger,
      });

      const first = await orderService.placeOrder('customer-1', { shippingAddress: 'Ha Noi', paymentMethod: 'COD' });
      const second = await orderService.placeOrder('customer-2', { shippingAddress: 'Da Nang', paymentMethod: 'COD' });

      assert.notEqual(first.orderCode, second.orderCode);
    } finally {
      Date.now = originalNow;
    }
  });
});
