import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAuthService } from './authService.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

describe('client auth service', () => {
  it('logs in through the API and stores the returned token', async () => {
    const storage = createStorage();
    const service = createAuthService({
      baseUrl: 'http://api.test/api',
      storage,
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/auth/login');
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              token: 'token-123',
              user: { email: 'thanh@example.com', role: { roleName: 'Customer' } },
            },
          }),
        };
      },
    });

    const result = await service.login({ email: 'thanh@example.com', password: 'Password123' });

    assert.equal(result.token, 'token-123');
    assert.equal(storage.getItem('greenhome_token'), 'token-123');
  });

  it('returns the default dashboard path for each role', () => {
    const service = createAuthService({ storage: createStorage() });

    assert.equal(service.getDashboardPath('Customer'), '/orders');
    assert.equal(service.getDashboardPath('Staff'), '/staff');
    assert.equal(service.getDashboardPath('WarehouseManager'), '/warehouse');
    assert.equal(service.getDashboardPath('Admin'), '/admin');
  });
});
