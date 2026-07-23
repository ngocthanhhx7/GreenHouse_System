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
  it('AT-139 logs in with credentials cookies and never stores a bearer token', async () => {
    const storage = createStorage();
    const calls = [];
    const service = createAuthService({
      baseUrl: 'http://api.test/api',
      storage,
      fetcher: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/auth/csrf')) {
          return {
            ok: true,
            json: async () => ({ success: true, data: { csrfToken: 'csrf-token' } }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              user: { email: 'thanh@example.com', role: { roleName: 'Customer' } },
            },
          }),
        };
      },
    });

    const result = await service.login({ email: 'thanh@example.com', password: 'Password123' });

    assert.equal(result.token, undefined);
    assert.equal(storage.getItem('greenhome_token'), null);
    assert.equal(calls[0].options.credentials, 'include');
    assert.equal(calls[1].url, 'http://api.test/api/auth/csrf');
    assert.equal(calls[1].options.credentials, 'include');
  });

  it('AT-141 waits for server logout revocation before clearing local identity', async () => {
    let completed = false;
    const service = createAuthService({
      baseUrl: 'http://api.test/api',
      storage: createStorage(),
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/auth/logout');
        assert.equal(options.method, 'POST');
        completed = true;
        return { ok: true, json: async () => ({ success: true, data: { alreadyProcessed: false } }) };
      },
    });
    const result = await service.logout();
    assert.equal(completed, true);
    assert.equal(result.alreadyProcessed, false);
  });

  it('returns the default dashboard path for each role', () => {
    const service = createAuthService({ storage: createStorage() });

    assert.equal(service.getDashboardPath('Customer'), '/orders');
    assert.equal(service.getDashboardPath('Staff'), '/staff');
    assert.equal(service.getDashboardPath('WarehouseManager'), '/warehouse');
    assert.equal(service.getDashboardPath('Admin'), '/admin');
  });

  it('AT-125 and AT-129 use challenge/invitation endpoints without a client token', async () => {
    const calls = [];
    const service = createAuthService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ success: true, data: { challengeId: 'challenge-1' } }) };
      },
    });
    await service.requestRegistrationChallenge('thanh@example.com');
    await service.completeRegistration({
      email: 'thanh@example.com',
      otp: '123456',
      fullName: 'Nguyen Ngoc Thanh',
      phoneNumber: '0912345678',
      password: 'Matkhau123',
      confirmPassword: 'Matkhau123',
    });
    await service.acceptInvitation({ email: 'staff@example.com', token: 'opaque-token', fullName: 'Staff', phoneNumber: '0912345678', password: 'Matkhau123', confirmPassword: 'Matkhau123' });
    assert.equal(calls[0].url, 'http://api.test/api/auth/registration-challenges');
    assert.equal(calls[1].url, 'http://api.test/api/auth/registrations');
    assert.equal(calls[2].url, 'http://api.test/api/internal-invitations/accept');
    assert.equal(calls.every(({ options }) => options.credentials === 'include'), true);
    assert.equal(Object.values(globalThis).some((value) => value === 'opaque-token'), false);
  });
});
