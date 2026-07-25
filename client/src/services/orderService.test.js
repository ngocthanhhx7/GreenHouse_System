import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createOrderService } from './orderService.js';

describe('client order service', () => {
  it('hydrates each owned order with its detail snapshot', async () => {
    const calls = [];
    const service = createOrderService({
      apiRequester: async (path) => {
        calls.push(path);
        if (path === '/orders/my') return [{ id: 'order-1' }, { id: 'order-2' }];
        return { id: path.split('/').at(-1), details: [{ id: `line-${calls.length}` }] };
      },
    });

    const result = await service.listMyOrdersWithDetails();

    assert.deepEqual(calls, ['/orders/my', '/orders/order-1', '/orders/order-2']);
    assert.equal(result.length, 2);
    assert.equal(result[0].details.length, 1);
  });

  it('keeps other owned orders visible when one detail request fails', async () => {
    const service = createOrderService({
      apiRequester: async (path) => {
        if (path === '/orders/my') return [{ id: 'order-1' }, { id: 'order-2', details: [{ id: 'line-2' }] }];
        throw new Error('detail unavailable');
      },
    });

    const result = await service.listMyOrdersWithDetails();

    assert.equal(result[0].detailLoadError, 'detail unavailable');
    assert.deepEqual(result[1].details, [{ id: 'line-2' }]);
  });

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

  it('records a customer delivery confirmation with only the canonical payload and idempotency key', async () => {
    const service = createOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/orders/order-1/delivery-confirmation');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['Idempotency-Key'], 'delivery-confirmation-001');
        assert.deepEqual(JSON.parse(options.body), {
          outcome: 'NOT_RECEIVED',
          expectedDeliveryEventId: 'event-1',
          reason: 'Tôi chưa nhận được kiện hàng dù trạng thái đã ghi là giao thành công.',
        });
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 'order-1', customerOrderStatus: 'Disputed' } }),
        };
      },
    });

    const result = await service.recordDeliveryConfirmation('order-1', {
      outcome: 'NOT_RECEIVED',
      expectedDeliveryEventId: 'event-1',
      reason: 'Tôi chưa nhận được kiện hàng dù trạng thái đã ghi là giao thành công.',
      ignored: 'must not be sent',
    }, 'delivery-confirmation-001');

    assert.equal(result.customerOrderStatus, 'Disputed');
  });
});
