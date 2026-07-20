import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createReturnRefundService } from './returnRefundService.js';

describe('client return/refund service', () => {
  it('creates a customer return/refund request for an order', async () => {
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/orders/order-1/return-refund');
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { reason: 'Product arrived damaged' });
        return { ok: true, json: async () => ({ success: true, data: { id: 'refund-1' } }) };
      },
    });

    const result = await service.createCustomerRequest('order-1', { reason: 'Product arrived damaged' });

    assert.equal(result.id, 'refund-1');
  });

  it('updates a staff return/refund decision', async () => {
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/staff/return-refunds/refund-1/status');
        assert.equal(options.method, 'PATCH');
        assert.deepEqual(JSON.parse(options.body), { status: 'Approved', refundAmount: 120, staffNote: 'Approved' });
        return { ok: true, json: async () => ({ success: true, data: { status: 'Approved' } }) };
      },
    });

    const result = await service.decideRequest('refund-1', { status: 'Approved', refundAmount: 120, staffNote: 'Approved' });

    assert.equal(result.status, 'Approved');
  });

  it('uses warehouse inspection and staff completion endpoints separately', async () => {
    const calls = [];
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ success: true, data: { status: 'ReadyForRefund' } }) };
      },
    });

    await service.inspectRequest('refund-1', { items: [] });
    await service.completeRefund('refund-1', { note: 'Da doi soat' });

    assert.equal(calls[0].url, 'http://api.test/api/warehouse/return-refunds/refund-1/inspection');
    assert.equal(calls[1].url, 'http://api.test/api/staff/return-refunds/refund-1/complete-refund');
  });
});
