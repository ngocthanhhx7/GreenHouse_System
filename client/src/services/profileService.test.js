import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createProfileService } from './profileService.js';

function response(data) {
  return { ok: true, json: async () => ({ success: true, data }) };
}

describe('client profile service', () => {
  it('loads and updates editable profile data', async () => {
    const calls = [];
    const service = createProfileService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        calls.push({ url, options });
        return response({ fullName: 'Nguyễn Ngọc Thành' });
      },
    });

    await service.getProfile();
    await service.updateProfile({ fullName: 'Nguyễn Ngọc Thành' });

    assert.equal(calls[0].url, 'http://api.test/api/profile');
    assert.equal(calls[1].options.method, 'PATCH');
    assert.match(calls[1].options.body, /Nguyễn Ngọc Thành/);
  });

  it('supports address CRUD and selecting the default address', async () => {
    const calls = [];
    const service = createProfileService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        calls.push({ url, options });
        return response({ items: [] });
      },
    });

    await service.listAddresses();
    await service.createAddress({ label: 'Nhà riêng' });
    await service.updateAddress('address-1', { label: 'Văn phòng' });
    await service.setDefaultAddress('address-1');
    await service.deleteAddress('address-1');

    assert.deepEqual(calls.map((call) => call.options.method || 'GET'), ['GET', 'POST', 'PATCH', 'PATCH', 'DELETE']);
    assert.match(calls[3].url, /\/profile\/addresses\/address-1\/default$/);
  });

  it('sends avatar as multipart form data', async () => {
    const service = createProfileService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        assert.equal(url, 'http://api.test/api/profile/avatar');
        assert.equal(options.method, 'POST');
        assert.ok(options.body instanceof FormData);
        assert.equal(options.headers, undefined);
        return response({ profile: { avatarUrl: '/uploads/avatars/avatar.png' } });
      },
    });

    await service.uploadAvatar(new Blob(['image'], { type: 'image/png' }), 'avatar.png');
  });
});
