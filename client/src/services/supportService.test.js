import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSupportService } from './supportService.js';

function jsonResponse(data, { ok = true } = {}) {
  return {
    ok,
    json: async () => data,
  };
}

describe('SL-008 Support client service', () => {
  it('sends every mutation to the locked route with command identity in the header', async () => {
    const calls = [];
    const service = createSupportService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        calls.push({ url, options });
        return jsonResponse({ success: true, data: { id: 'ticket-1' } });
      },
    });
    const rows = [
      ['createRequest', [{ type: 'Other', subject: 'Account help', initialMessage: 'Please help me today.', expectedVersion: 0 }, { idempotencyKey: 'support-create-001' }], '/support-requests', 'POST'],
      ['appendMessage', ['ticket-1', { message: 'Customer follow-up', expectedVersion: 1 }, { idempotencyKey: 'support-message-001', scope: 'customer' }], '/support-requests/ticket-1/messages', 'POST'],
      ['appendMessage', ['ticket-1', { message: 'Staff follow-up', expectedVersion: 2 }, { idempotencyKey: 'support-message-002', scope: 'staff' }], '/staff/support-requests/ticket-1/messages', 'POST'],
      ['withdraw', ['ticket-1', { expectedVersion: 1 }, { idempotencyKey: 'support-withdraw-001' }], '/support-requests/ticket-1/withdraw', 'PATCH'],
      ['reopen', ['ticket-1', { message: 'Issue returned', expectedVersion: 3 }, { idempotencyKey: 'support-reopen-001' }], '/support-requests/ticket-1/reopen', 'POST'],
      ['claim', ['ticket-1', { expectedVersion: 1 }, { idempotencyKey: 'support-claim-001' }], '/staff/support-requests/ticket-1/claim', 'POST'],
      ['changePriority', ['ticket-1', { priority: 'High', reason: 'Customer impact', expectedVersion: 2 }, { idempotencyKey: 'support-priority-001' }], '/staff/support-requests/ticket-1/priority', 'PATCH'],
      ['transfer', ['ticket-1', { assigneeId: 'staff-b', reason: 'Specialist transfer', expectedVersion: 3 }, { idempotencyKey: 'support-transfer-001' }], '/staff/support-requests/ticket-1/transfer', 'PATCH'],
      ['resolve', ['ticket-1', { finalMessage: 'Resolved for the customer', expectedVersion: 4 }, { idempotencyKey: 'support-resolve-001' }], '/staff/support-requests/ticket-1/resolve', 'POST'],
    ];

    for (const [method, args] of rows) await service[method](...args);

    assert.deepEqual(
      calls.map(({ url, options }) => ({
        url,
        method: options.method,
        idempotencyKey: options.headers['Idempotency-Key'],
        contentType: options.headers['Content-Type'],
        credentials: options.credentials,
      })),
      rows.map(([, args, path, method]) => ({
        url: `http://api.test/api${path}`,
        method,
        idempotencyKey: args.at(-1).idempotencyKey,
        contentType: 'application/json',
        credentials: 'include',
      })),
    );
    assert.deepEqual(
      calls.map(({ options }) => JSON.parse(options.body)),
      rows.map(([, args]) => args.length === 2 ? args[0] : args[1]),
    );
  });

  it('serializes Customer, Staff, detail, and authorized selector reads exactly', async () => {
    const urls = [];
    const service = createSupportService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        urls.push(url);
        return jsonResponse({ success: true, data: { items: [] } });
      },
    });

    await service.listOwn({ page: 2, pageSize: 20 });
    await service.getDetail('ticket-1', { page: 3, pageSize: 10 }, { scope: 'customer' });
    await service.getDetail('ticket-1', { page: 4, pageSize: 20 }, { scope: 'staff' });
    await service.listOperational({
      type: 'Order',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      status: 'New',
      priority: 'Normal',
      assigneeId: 'unassigned',
      page: 1,
      pageSize: 20,
    });
    await service.listEligibleOrders();
    await service.listActiveProducts();
    await service.listActiveStaff('ticket-1');

    assert.deepEqual(urls, [
      'http://api.test/api/support-requests/my?page=2&pageSize=20',
      'http://api.test/api/support-requests/ticket-1?page=3&pageSize=10',
      'http://api.test/api/staff/support-requests/ticket-1?page=4&pageSize=20',
      'http://api.test/api/staff/support-requests?type=Order&dateFrom=2026-07-01&dateTo=2026-07-31&status=New&priority=Normal&assigneeId=unassigned&page=1&pageSize=20',
      'http://api.test/api/orders/my',
      'http://api.test/api/products?page=1&pageSize=50',
      'http://api.test/api/staff/support-requests/ticket-1',
    ]);
  });

  it('preserves typed private field errors from the API', async () => {
    const service = createSupportService({
      baseUrl: 'http://api.test/api',
      fetcher: async () => jsonResponse({
        success: false,
        message: 'Support reference is invalid',
        errorCode: 'SUPPORT_REFERENCE_INVALID',
        errors: [{ field: 'orderId', message: 'Choose one of your orders' }],
        data: { retryable: false },
        requestId: 'request-1',
      }, { ok: false }),
    });

    await assert.rejects(
      () => service.createRequest(
        { type: 'Order', subject: 'Delivery issue', initialMessage: 'Please check this delivery.', expectedVersion: 0 },
        { idempotencyKey: 'support-create-001' },
      ),
      (error) => {
        assert.equal(error.message, 'Support reference is invalid');
        assert.equal(error.errorCode, 'SUPPORT_REFERENCE_INVALID');
        assert.deepEqual(error.errors, [{ field: 'orderId', message: 'Choose one of your orders' }]);
        assert.deepEqual(error.data, { retryable: false });
        assert.equal(error.requestId, 'request-1');
        return true;
      },
    );
  });
});
