import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createOperationalEvidenceService } from './operationalEvidenceService.js';

describe('operational evidence service', () => {
  it('uploads one to five images as multipart data', async () => {
    const files = [new Blob(['one'], { type: 'image/png' }), new Blob(['two'], { type: 'image/webp' })];
    const service = createOperationalEvidenceService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/operational-evidence');
        assert.equal(options.method, 'POST');
        assert.ok(options.body instanceof FormData);
        assert.equal(options.body.getAll('images').length, 2);
        assert.equal(options.headers['Content-Type'], undefined);
        return {
          ok: true,
          json: async () => ({ success: true, data: { items: [{ url: '/api/operational-evidence/proof.png?size=3&claim=abc' }] } }),
        };
      },
    });
    const result = await service.uploadImages(files);
    assert.equal(result.items.length, 1);
  });

  it('rejects an empty or oversized batch before calling the API', async () => {
    const service = createOperationalEvidenceService({ fetcher: async () => { throw new Error('must not call'); } });
    await assert.rejects(() => service.uploadImages([]), /ít nhất 1 ảnh/i);
    await assert.rejects(() => service.uploadImages(Array.from({ length: 6 }, () => new Blob(['x'], { type: 'image/png' }))), /tối đa 5 ảnh/i);
  });
});
