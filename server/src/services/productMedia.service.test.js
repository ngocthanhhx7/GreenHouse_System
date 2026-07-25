const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createProductMediaService } = require('./productMedia.service');

function createService({
  productReference = false,
  orderReference = false,
  deleted = true,
  asset = null,
  published = false,
  attachedProduct = true,
  now = new Date('2026-07-24T00:00:00.000Z'),
} = {}) {
  return createProductMediaService({
    productRepository: {
      existsByImageUrl: async () => productReference,
      findPublicByIdAndImageUrl: async () => (published ? { _id: 'product-1' } : null),
      findByIdAndImageUrl: async () => (attachedProduct ? { _id: 'product-1' } : null),
    },
    orderDetailRepository: { existsByImageSnapshot: async () => orderReference },
    assetRepository: {
      async findByUrl(url) {
        return asset || { _id: 'asset-1', url, status: 'Attached', productId: 'product-1' };
      },
      async deleteTemporary() {},
    },
    managedUploadService: { removeManagedFile: async () => deleted },
    clock: () => now,
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

  it('allows a temporary Product image read only to its owning Admin before expiry', async () => {
    const url = '/uploads/products/11111111-1111-4111-8111-111111111111.png';
    const service = createService({
      asset: {
        _id: 'asset-1', url, status: 'Temporary', ownerId: 'admin-1',
        expiresAt: new Date('2026-07-25T00:00:00.000Z'), productId: null,
      },
    });

    const result = await service.authorizeRead(url, { id: 'admin-1', role: 'Admin' });
    assert.equal(result.status, 'Temporary');
    await assert.rejects(
      () => service.authorizeRead(url, { id: 'admin-2', role: 'Admin' }),
      (error) => error.statusCode === 404,
    );
  });

  it('serves attached Product media publicly only while its Product remains published', async () => {
    const url = '/uploads/products/11111111-1111-4111-8111-111111111111.png';
    const asset = { _id: 'asset-1', url, status: 'Attached', productId: 'product-1' };

    await assert.rejects(
      () => createService({ asset, published: false }).authorizeRead(url, null),
      (error) => error.statusCode === 404,
    );
    const result = await createService({ asset, published: true }).authorizeRead(url, null);
    assert.equal(result.status, 'Attached');
  });

  it('allows an authenticated Admin to preview attached media for an inactive Product', async () => {
    const url = '/uploads/products/11111111-1111-4111-8111-111111111111.png';
    const asset = { _id: 'asset-1', url, status: 'Attached', productId: 'product-1' };

    const result = await createService({ asset, published: false }).authorizeRead(url, {
      id: 'admin-1',
      role: 'Admin',
    });

    assert.equal(result.status, 'Attached');
  });

  it('allows an authenticated Admin to preview retained media for an inactive Product', async () => {
    const url = '/uploads/products/11111111-1111-4111-8111-111111111111.png';
    const asset = { _id: 'asset-1', url, status: 'Retained', productId: 'product-1' };

    const result = await createService({ asset, published: false }).authorizeRead(url, {
      id: 'admin-1',
      role: 'Admin',
    });

    assert.equal(result.status, 'Retained');
  });

  it('does not let an Admin read an attached asset after its Product reference is removed', async () => {
    const url = '/uploads/products/11111111-1111-4111-8111-111111111111.png';
    const asset = { _id: 'asset-1', url, status: 'Attached', productId: 'product-1' };

    await assert.rejects(
      () => createService({ asset, attachedProduct: false }).authorizeRead(url, {
        id: 'admin-1',
        role: 'Admin',
      }),
      (error) => error.statusCode === 404,
    );
  });
});
