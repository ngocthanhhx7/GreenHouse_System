import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createStaffOrderService } from './staffOrderService.js';

describe('client staff order service', () => {
  it('lists staff orders with status query', async () => {
    const service = createStaffOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        assert.equal(url, 'http://api.test/api/staff/orders?status=Pending');
        assert.equal(options.method || 'GET', 'GET');
        return {
          ok: true,
          json: async () => ({ success: true, data: { items: [{ orderCode: 'ORD-1' }] } }),
        };
      },
    });

    const result = await service.listOrders({ status: 'Pending' });

    assert.equal(result.items[0].orderCode, 'ORD-1');
  });

  it('keeps additional list parameters with the Pending status', async () => {
    const service = createStaffOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/staff/orders?status=Pending&page=2');
        return { ok: true, json: async () => ({ success: true, data: { items: [] } }) };
      },
    });

    await service.listOrders({ status: 'Pending', page: 2 });
  });

  it('sends the confirmation key as a header and excludes it from the body', async () => {
    const service = createStaffOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/staff/orders/order-1/confirm');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['Idempotency-Key'], 'staff-confirm-001');
        assert.deepEqual(JSON.parse(options.body), { note: 'Reviewed' });
        return {
          ok: true,
          json: async () => ({ success: true, data: { orderStatus: 'Confirmed' } }),
        };
      },
    });

    const result = await service.confirmOrder('order-1', {
      note: 'Reviewed',
      idempotencyKey: 'staff-confirm-001',
    });

    assert.equal(result.orderStatus, 'Confirmed');
  });

  it('uses dedicated cancellation, manual COD collection, and recovery actions', async () => {
    const calls = [];
    const service = createStaffOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ success: true, data: { ok: true } }) };
      },
    });

    await service.cancelOrder('order-1', { cancelReason: 'Khach doi lich giao' });

    assert.equal(calls[0].url, 'http://api.test/api/staff/orders/order-1/cancel');
    assert.deepEqual(JSON.parse(calls[0].options.body), { cancelReason: 'Khach doi lich giao' });
    await service.markCodCollected('order-1', {
      customerCollectedAmount: 50,
      collectionTiming: 'AT_DELIVERY',
      occurredAt: '2026-07-25T10:00:00.000Z',
      evidenceReference: 'staff-pod-1',
      idempotencyKey: 'staff-cod-001',
    });
    assert.equal(calls[1].url, 'http://api.test/api/staff/orders/order-1/cod-collection');
    assert.equal(calls[1].options.headers['Idempotency-Key'], 'staff-cod-001');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      customerCollectedAmount: 50,
      collectionTiming: 'AT_DELIVERY',
      occurredAt: '2026-07-25T10:00:00.000Z',
      evidenceReference: 'staff-pod-1',
    });
    await service.finalizeCodRecovery('order-1', {
      goodsRecovered: true,
      goodsRecoveryEvidenceId: 'warehouse-1',
      destinationVerified: true,
      destinationReference: 'destination-1',
    });
    assert.equal(calls[2].url, 'http://api.test/api/staff/orders/order-1/cod-recovery');
    assert.equal(Object.hasOwn(JSON.parse(calls[2].options.body), 'amount'), false);
  });
});
