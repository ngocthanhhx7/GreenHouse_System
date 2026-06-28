import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCategoryService } from './categoryService.js';

describe('client category service', () => {
  it('fetches public categories', async () => {
    const service = createCategoryService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/categories');
        return {
          ok: true,
          json: async () => ({ success: true, data: [{ name: 'Cookware' }] }),
        };
      },
    });

    const result = await service.listCategories();

    assert.equal(result[0].name, 'Cookware');
  });
});
