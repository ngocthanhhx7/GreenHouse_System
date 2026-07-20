const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createProductMediaService } = require('./productMedia.service');

function createService({ productReference = false, orderReference = false, deleted = true } = {}) {
  return createProductMediaService({
    productRepository: { existsByImageUrl: async () => productReference },
    orderDetailRepository: { existsByImageSnapshot: async () => orderReference },
    managedUploadService: { removeManagedFile: async () => deleted },
  });
}

describe('product media service', () => {
  it('deletes an unused managed product image', async () => {
    const result = await createService().deleteUnusedImage('/uploads/products/11111111-1111-4111-8111-111111111111.png');
    assert.equal(result.deleted, true);
  });

  it('rejects URLs outside the managed product upload folder', async () => {
    await assert.rejects(
      () => createService().deleteUnusedImage('https://example.com/product.png'),
      (error) => error.statusCode === 400
    );
  });

  it('preserves images referenced by a current product', async () => {
    await assert.rejects(
      () => createService({ productReference: true }).deleteUnusedImage('/uploads/products/11111111-1111-4111-8111-111111111111.png'),
      (error) => error.statusCode === 409
    );
  });

  it('preserves images referenced by an order detail snapshot', async () => {
    await assert.rejects(
      () => createService({ orderReference: true }).deleteUnusedImage('/uploads/products/11111111-1111-4111-8111-111111111111.png'),
      (error) => error.statusCode === 409
    );
  });
});
