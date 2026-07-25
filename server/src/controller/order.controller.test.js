const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const orderController = require('./order.controller');
const { orderService } = require('../services/order.service');

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function requestOf(body = {}) {
  return {
    user: { id: 'customer-from-session', role: 'Customer' },
    body,
    get(name) {
      return name === 'Idempotency-Key' ? 'checkout-controller-001' : '';
    },
  };
}

describe('order controller checkout boundary', () => {
  it('uses the authenticated Customer identity and ignores body identity fields', async () => {
    const originalPlaceOrder = orderService.placeOrder;
    let captured;
    orderService.placeOrder = async (customerId, input) => {
      captured = { customerId, input };
      return { id: 'order-1', orderStatus: 'Pending', paymentStatus: 'Unpaid' };
    };

    try {
      const response = createResponse();
      await orderController.placeOrder(
        requestOf({
          paymentMethod: 'COD',
          userId: 'attacker-supplied',
          customerId: 'attacker-supplied',
          role: 'Admin',
        }),
        response,
        (error) => { throw error; },
      );

      assert.equal(captured.customerId, 'customer-from-session');
      assert.equal(captured.input.userId, undefined);
      assert.equal(captured.input.customerId, undefined);
      assert.equal(captured.input.role, undefined);
      assert.equal(captured.input.paymentMethod, 'COD');
      assert.equal(captured.input.idempotencyKey, 'checkout-controller-001');
      assert.equal(response.statusCode, 201);
    } finally {
      orderService.placeOrder = originalPlaceOrder;
    }
  });

  it('allows ONLINE while preserving the authenticated Customer identity', async () => {
    const originalPlaceOrder = orderService.placeOrder;
    let captured;
    orderService.placeOrder = async (customerId, input) => {
      captured = { customerId, input };
      return { id: 'online-order-1', orderStatus: 'Pending', paymentStatus: 'Pending' };
    };

    try {
      const response = createResponse();
      await orderController.placeOrder(
        requestOf({
          paymentMethod: 'ONLINE',
          customerId: 'attacker-supplied',
          role: 'Admin',
        }),
        response,
        (error) => { throw error; },
      );

      assert.equal(captured.customerId, 'customer-from-session');
      assert.equal(captured.input.paymentMethod, 'ONLINE');
      assert.equal(captured.input.customerId, undefined);
      assert.equal(captured.input.role, undefined);
      assert.equal(response.statusCode, 201);
    } finally {
      orderService.placeOrder = originalPlaceOrder;
    }
  });

  it('rejects an explicit non-COD method before invoking the order service', async () => {
    const originalPlaceOrder = orderService.placeOrder;
    let serviceCalled = false;
    let nextError;
    orderService.placeOrder = async () => {
      serviceCalled = true;
      return { id: 'must-not-be-created' };
    };

    try {
      await orderController.placeOrder(
        requestOf({ paymentMethod: 'BANK_TRANSFER' }),
        createResponse(),
        (error) => { nextError = error; },
      );
    } finally {
      orderService.placeOrder = originalPlaceOrder;
    }

    assert.equal(serviceCalled, false);
    assert.equal(nextError?.statusCode, 400);
    assert.equal(nextError?.errorCode, 'CHECKOUT_PAYMENT_METHOD_INVALID');
  });

  it('uses the authenticated Customer identity when loading an order detail', async () => {
    const originalGetMyOrder = orderService.getMyOrder;
    let captured;
    orderService.getMyOrder = async (customerId, orderId) => {
      captured = { customerId, orderId };
      return {
        id: orderId,
        customerId,
        orderStatus: 'Delivered',
        paymentStatus: 'Paid',
        shippingStatus: 'Delivered',
      };
    };

    try {
      const response = createResponse();
      await orderController.getMyOrder(
        { user: { id: 'customer-from-session' }, params: { id: 'order-1' } },
        response,
        (error) => { throw error; },
      );
      assert.deepEqual(captured, {
        customerId: 'customer-from-session',
        orderId: 'order-1',
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.payload.data.shippingStatus, 'Delivered');
    } finally {
      orderService.getMyOrder = originalGetMyOrder;
    }
  });
});
