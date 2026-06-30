import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSupportService } from './supportService.js';

describe('client support service', () => {
  it('creates a customer support request', async () => {
    const service = createSupportService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/support-requests');
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { subject: 'Delivery issue', content: 'Box was open' });
        return { ok: true, json: async () => ({ success: true, data: { id: 'support-1' } }) };
      },
    });

    const result = await service.createCustomerRequest({ subject: 'Delivery issue', content: 'Box was open' });

    assert.equal(result.id, 'support-1');
  });

  it('responds to a staff support request', async () => {
    const service = createSupportService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/staff/support-requests/support-1/response');
        assert.equal(options.method, 'PATCH');
        assert.deepEqual(JSON.parse(options.body), { response: 'Resolved', status: 'Resolved' });
        return { ok: true, json: async () => ({ success: true, data: { status: 'Resolved' } }) };
      },
    });

    const result = await service.respondToRequest('support-1', { response: 'Resolved', status: 'Resolved' });

    assert.equal(result.status, 'Resolved');
  });
});
