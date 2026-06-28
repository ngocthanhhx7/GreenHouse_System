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
        return {
          ok: true,
          json: async () => ({ success: true, data: { name: 'Chef Knife' } }),
        };
      },
    });

    const result = await service.createProduct({ name: 'Chef Knife' });

    assert.equal(result.name, 'Chef Knife');
  });
});
