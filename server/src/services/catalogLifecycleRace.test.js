const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createCategoryService } = require('./category.service');
const { createProductService } = require('./product.service');

const MANAGED_IMAGE = '/uploads/products/11111111-1111-4111-8111-111111111111.png';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function createLifecycleFixture({ categoryStatus = 'Active', pauseProductWrite = false } = {}) {
  const category = {
    _id: 'category-1',
    name: 'Cookware',
    description: '',
    status: categoryStatus,
    catalogVersion: 0,
  };
  const product = {
    _id: 'product-1',
    name: 'Chef Knife',
    sku: 'CK-001',
    description: 'Sharp kitchen knife',
    imageUrls: [MANAGED_IMAGE],
    price: 30,
    unit: 'piece',
    categoryId: 'category-1',
    status: 'Inactive',
  };
  const productCategoryClaimed = deferred();
  const permitProductWrite = deferred();
  let transactionTail = Promise.resolve();
  let transactionSequence = 0;
  const transactionManager = {
    async withTransaction(work) {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        transactionSequence += 1;
        return await work({ id: `transaction-${transactionSequence}` });
      } finally {
        release();
      }
    },
  };

  const categoryRepository = {
    async findById(id) {
      return String(id) === category._id ? category : null;
    },
    async updateById(id, data) {
      if (String(id) !== category._id) return null;
      Object.assign(category, data);
      return category;
    },
    async claimActiveByVersion(id, expectedVersion) {
      if (
        String(id) !== category._id
        || category.status !== 'Active'
        || Number(category.catalogVersion || 0) !== Number(expectedVersion || 0)
      ) return null;
      category.catalogVersion += 1;
      productCategoryClaimed.resolve();
      return category;
    },
    async deactivateIfUnchangedAndEmpty(id, _data, expectedVersion) {
      if (String(id) !== category._id) return null;
      if (
        category.status !== 'Active'
        || Number(category.catalogVersion || 0) !== Number(expectedVersion || 0)
      ) return null;
      category.status = 'Inactive';
      category.catalogVersion += 1;
      return category;
    },
  };
  const productRepository = {
    async findById(id) {
      return String(id) === product._id ? product : null;
    },
    async updateById(id, data) {
      if (String(id) !== product._id) return null;
      if (data.status === 'Active' && pauseProductWrite) await permitProductWrite.promise;
      Object.assign(product, data);
      return product;
    },
    async listActiveByCategory(categoryId) {
      return String(categoryId) === product.categoryId && product.status === 'Active'
        ? [product]
        : [];
    },
  };
  const auditLogger = { async log() {} };

  return {
    category,
    product,
    categoryService: createCategoryService({
      categoryRepository,
      productRepository,
      auditLogger,
      transactionManager,
    }),
    productService: createProductService({
      categoryRepository,
      productRepository,
      inventoryRepository: {
        async findByProductId(productId) {
          return String(productId) === product._id ? { productId, sellableQuantity: 0 } : null;
        },
      },
      auditLogger,
      transactionManager,
    }),
    productCategoryClaimed,
    permitProductWrite,
  };
}

describe('Catalog lifecycle race guard', () => {
  it('cannot deactivate after activation claims the Category but before Product status writes', async () => {
    const fixture = createLifecycleFixture({ pauseProductWrite: true });
    const activate = fixture.productService.updateProduct(
      'product-1',
      { status: 'Active' },
      { id: 'admin-product' },
    );
    await fixture.productCategoryClaimed.promise;
    const deactivate = fixture.categoryService.updateCategory(
      'category-1',
      { status: 'Inactive' },
      { id: 'admin-category' },
    );
    await new Promise((resolve) => setImmediate(resolve));
    fixture.permitProductWrite.resolve();

    const [deactivation, activation] = await Promise.allSettled([deactivate, activate]);

    assert.equal(activation.status, 'fulfilled');
    assert.equal(deactivation.status, 'rejected');
    assert.equal(deactivation.reason.statusCode, 409);
    assert.equal(deactivation.reason.errorCode, 'CATEGORY_ACTIVE_PRODUCTS');
    assert.equal(fixture.product.status, 'Active');
    assert.equal(fixture.category.status, 'Active');
  });

  it('keeps a normal deactivation durable and rejects repeated activation attempts with a typed guard', async () => {
    const fixture = createLifecycleFixture();
    const deactivated = await fixture.categoryService.updateCategory(
      'category-1',
      { status: 'Inactive' },
      { id: 'admin-category' },
    );
    assert.equal(deactivated.status, 'Inactive');

    // Recreate only the Product command over the already-deactivated shared Category.
    const retryFixture = createLifecycleFixture({ categoryStatus: fixture.category.status });
    await assert.rejects(
      () => retryFixture.productService.updateProduct('product-1', { status: 'Active' }, { id: 'admin-product' }),
      (error) => error.statusCode === 409 && error.errorCode === 'PRODUCT_ACTIVATION_GUARDS_FAILED',
    );
    await assert.rejects(
      () => retryFixture.productService.updateProduct('product-1', { status: 'Active' }, { id: 'admin-product' }),
      (error) => error.statusCode === 409 && error.errorCode === 'PRODUCT_ACTIVATION_GUARDS_FAILED',
    );
  });
});
