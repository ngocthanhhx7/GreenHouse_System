import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createOrderService } from './orderService.js';

describe('client order service', () => {
  it('places customer order through order endpoint', async () => {
    const service = createOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/orders');
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ success: true, data: { orderCode: 'ORD-1' } }),
        };
      },
    });

    const result = await service.placeOrder({
      deliveryAddress: {
        receiverName: 'Khách hàng Demo',
        phoneNumber: '0900000001',
        province: 'Hà Nội',
        district: 'Thanh Xuân',
        ward: 'Khương Mai',
        addressLine: '12 Nguyễn Trãi',
      },
      paymentMethod: 'COD',
    }, { idempotencyKey: 'checkout-test-001' });

    assert.equal(result.orderCode, 'ORD-1');
  });

  it('sends the checkout idempotency key in the standard request header', async () => {
    const service = createOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (_url, options) => {
        assert.equal(options.headers['Idempotency-Key'], 'checkout-header-001');
        return { ok: true, json: async () => ({ success: true, data: {} }) };
      },
    });

    await service.placeOrder({
      deliveryAddress: {
        receiverName: 'Khách hàng Demo',
        phoneNumber: '0900000001',
        province: 'Hà Nội',
        district: 'Thanh Xuân',
        ward: 'Khương Mai',
        addressLine: '12 Nguyễn Trãi',
      },
      paymentMethod: 'COD',
    }, { idempotencyKey: 'checkout-header-001' });
  });

  it('preserves backend checkout errorCode and field errors for distinct feedback', async () => {
    const service = createOrderService({
      baseUrl: 'http://api.test',
      fetcher: async () => ({
        ok: false,
        json: async () => ({
          success: false,
          message: 'Thông tin địa chỉ nhận hàng không hợp lệ',
          errorCode: 'CHECKOUT_ADDRESS_INVALID',
          errors: [{ field: 'province', message: 'province must not exceed 100 characters' }],
        }),
      }),
    });

    await assert.rejects(
      () => service.placeOrder({ deliveryAddress: {}, paymentMethod: 'COD' }, { idempotencyKey: 'checkout-error-001' }),
      (error) => {
        assert.equal(error.errorCode, 'CHECKOUT_ADDRESS_INVALID');
        assert.equal(error.errors[0].field, 'province');
        return true;
      }
    );
  });

  it('sends a cancellation reason and idempotency key in the customer cancellation command', async () => {
    const service = createOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/orders/order-1/cancel');
        assert.equal(options.method, 'PATCH');
        assert.equal(options.headers['Idempotency-Key'], 'cancel-command-001');
        assert.deepEqual(JSON.parse(options.body), { cancelReason: 'Ordered twice' });
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 'order-1', orderStatus: 'Cancelled' } }),
        };
      },
    });

    const result = await service.cancelOrder('order-1', {
      cancelReason: 'Ordered twice',
      idempotencyKey: 'cancel-command-001',
    });

    assert.equal(result.orderStatus, 'Cancelled');
  });
});
