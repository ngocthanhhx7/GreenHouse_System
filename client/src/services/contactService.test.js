import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createContactService } from './contactService.js';

describe('client public contact service', () => {
  it('submits the public contact form to the real API', async () => {
    const input = {
      name: 'Nguyễn Văn A',
      email: 'guest@example.com',
      subject: 'Tư vấn sản phẩm',
      message: 'Tôi cần tư vấn thêm về sản phẩm này.',
    };
    const service = createContactService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/contact');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['Content-Type'], 'application/json');
        assert.deepEqual(JSON.parse(options.body), input);
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { id: 'contact-1' },
          }),
        };
      },
    });

    const result = await service.submit(input);

    assert.equal(result.id, 'contact-1');
  });

  it('surfaces the server error instead of reporting a false success', async () => {
    const service = createContactService({
      baseUrl: 'http://api.test/api',
      fetcher: async () => ({
        ok: false,
        json: async () => ({
          success: false,
          message: 'Bạn gửi quá nhanh. Vui lòng thử lại sau.',
        }),
      }),
    });

    await assert.rejects(
      () => service.submit({}),
      /Bạn gửi quá nhanh/,
    );
  });
});
