import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createProductService } from './productService.js';

describe('client product service', () => {
  it('fetches public products with search query params', async () => {
    const service = createProductService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/products?keyword=pan&categoryId=cat-1');
        return {
          ok: true,
          json: async () => ({ success: true, data: { items: [{ name: 'Green Pan' }] } }),
        };
      },
    });

    const result = await service.listProducts({ keyword: 'pan', categoryId: 'cat-1' });

    assert.equal(result.items[0].name, 'Green Pan');
  });

  it('creates products through the admin endpoint', async () => {
    const service = createProductService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/admin/products');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['Idempotency-Key'], 'product-create-client-001');
        return {
          ok: true,
          json: async () => ({ success: true, data: { name: 'Chef Knife' } }),
        };
      },
    });

    const result = await service.createProduct(
      { name: 'Chef Knife' },
      { idempotencyKey: 'product-create-client-001' },
    );

    assert.equal(result.name, 'Chef Knife');
  });

  it('uploads local product images as multipart form data', async () => {
    const file = new Blob(['image'], { type: 'image/png' });
    const service = createProductService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/admin/uploads/products');
        assert.equal(options.method, 'POST');
        assert.ok(options.body instanceof FormData);
        assert.equal(options.body.getAll('images').length, 1);
        assert.equal(options.headers['Content-Type'], undefined);
        return {
          ok: true,
          json: async () => ({ success: true, data: { items: [{ url: '/uploads/products/demo.png' }] } }),
        };
      },
    });

    const result = await service.uploadImages([file]);

    assert.equal(result.items[0].url, '/uploads/products/demo.png');
  });

  it('deletes an unused managed product image', async () => {
    const service = createProductService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/admin/uploads/products');
        assert.equal(options.method, 'DELETE');
        assert.deepEqual(JSON.parse(options.body), { url: '/uploads/products/demo.png' });
        return { ok: true, json: async () => ({ success: true, data: { deleted: true } }) };
      },
    });

    assert.equal((await service.deleteImage('/uploads/products/demo.png')).deleted, true);
  });
});
