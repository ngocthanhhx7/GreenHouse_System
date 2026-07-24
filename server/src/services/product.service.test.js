const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createProductService } = require('./product.service');

const MANAGED_IMAGE = '/uploads/products/11111111-1111-4111-8111-111111111111.png';

function validProductInput(overrides = {}) {
  return {
    name: 'Chef Knife',
    sku: 'CK-001',
    description: 'Sharp kitchen knife',
    imageUrls: [MANAGED_IMAGE],
    price: 30,
    unit: 'piece',
    categoryId: 'cat-active',
    currency: 'VND',
    ...overrides,
  };
}

function createCategoryRepository() {
  const categories = [
    { _id: 'cat-active', name: 'Cookware', status: 'Active' },
    { _id: 'cat-inactive', name: 'Old Category', status: 'Inactive' },
  ];

  return {
    async findById(id) {
      return categories.find((category) => category._id === id) || null;
    },
    async listPublic() {
      return categories.filter((category) => category.status === 'Active');
    },
  };
}

function createProductRepository() {
  const activeCategory = { _id: 'cat-active', name: 'Cookware', status: 'Active' };
  const products = [
    { _id: 'p1', name: 'Green Pan', price: 25, sku: 'gp-001', categoryId: activeCategory, status: 'Active' },
    { _id: 'p2', name: 'Hidden Plate', price: 10, categoryId: activeCategory, status: 'Inactive' },
    { _id: 'p3', name: 'Storage Box', price: 15, categoryId: activeCategory, status: 'Active' },
    { _id: 'p4', name: 'Inactive Category Product', price: 12, categoryId: { _id: 'cat-inactive', name: 'Old Category', status: 'Inactive' }, status: 'Active' },
    { _id: 'p5', name: 'Missing Category Product', price: 14, categoryId: null, status: 'Active' },
    {
      _id: 'p6',
      name: 'Reactivation Inactive Category',
      sku: 'P-006',
      description: 'Archived Product',
      imageUrls: [MANAGED_IMAGE],
      price: 16,
      unit: 'piece',
      categoryId: { _id: 'cat-inactive', name: 'Old Category', status: 'Inactive' },
      status: 'Inactive',
    },
    {
      _id: 'p7',
      name: 'Reactivation Missing Category',
      sku: 'P-007',
      description: 'Archived Product',
      imageUrls: [MANAGED_IMAGE],
      price: 18,
      unit: 'piece',
      categoryId: null,
      status: 'Inactive',
    },
  ];

  return {
    products,
    async list() {
      return products;
    },
    async findById(id) {
      return products.find((item) => item._id === id) || null;
    },
    async create(data) {
      const product = { _id: `p${products.length + 1}`, ...data };
      products.push(product);
      return product;
    },
    async updateById(id, data) {
      const product = products.find((item) => item._id === id);
      if (!product) return null;
      Object.assign(product, data);
      return product;
    },
    async findPublicById(id) {
      return products.find((item) => item._id === id && item.status === 'Active') || null;
    },
  };
}

function createAuditLogger() {
  const entries = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

describe('product service', () => {
  let productService;
  let productRepository;
  let auditLogger;

  beforeEach(() => {
    productRepository = createProductRepository();
    auditLogger = createAuditLogger();
    productService = createProductService({
      productRepository,
      categoryRepository: createCategoryRepository(),
      auditLogger,
    });
  });

  it('lists only active public products and supports keyword filtering', async () => {
    const result = await productService.listPublicProducts({ keyword: 'pan' });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].name, 'Green Pan');
    assert.equal(result.items[0].sku, 'GP-001');
    assert.equal(result.items[0].currency, 'VND');
    assert.equal(result.items[0].status, undefined);
  });

  it('hides active products whose populated category is inactive or missing', async () => {
    const result = await productService.listPublicProducts();

    assert.deepEqual(result.items.map((product) => product.id), ['p1', 'p3']);
  });

  it('gets one active public product by id without scanning the full catalog', async () => {
    let listCalled = false;
    productRepository.list = async () => {
      listCalled = true;
      return [];
    };

    const result = await productService.getPublicProductById('p1');

    assert.equal(result.name, 'Green Pan');
    assert.equal(listCalled, false);
  });

  it('returns the existing 404 contract for active products with inactive or missing categories', async () => {
    await assert.rejects(() => productService.getPublicProductById('p4'), (error) => error.statusCode === 404 && error.message === 'Product not found');
    await assert.rejects(() => productService.getPublicProductById('p5'), (error) => error.statusCode === 404 && error.message === 'Product not found');
  });

  it('returns the existing 404 contract for an inactive product detail', async () => {
    await assert.rejects(() => productService.getPublicProductById('p2'), (error) => error.statusCode === 404 && error.message === 'Product not found');
  });

  it('canonicalizes SKU and normalizes VND currency across create and update', async () => {
    const legacyDetail = await productService.getPublicProductById('p1');
    assert.equal(legacyDetail.sku, 'GP-001');
    assert.equal(legacyDetail.currency, 'VND');

    const created = await productService.createProduct(
      validProductInput({ sku: ' ck-001 ', currency: 'vnd' }),
      { id: 'admin-1' },
      { idempotencyKey: 'product-create-canonical-001' },
    );
    assert.equal(productRepository.products.at(-1).sku, 'CK-001');
    assert.equal(productRepository.products.at(-1).currency, 'VND');
    assert.equal(created.sku, 'CK-001');
    assert.equal(created.currency, 'VND');

    const updated = await productService.updateProduct('p1', {
      sku: ' gp-002 ',
      skuCorrectionReason: 'Correct supplier identity',
      currency: ' vnd ',
    }, { id: 'admin-1' });
    assert.equal(productRepository.products[0].sku, 'GP-002');
    assert.equal(productRepository.products[0].currency, 'VND');
    assert.equal(updated.sku, 'GP-002');
    assert.equal(updated.currency, 'VND');
  });

  it('rejects blank and missing required SKU values', async () => {
    await assert.rejects(
      () => productService.createProduct(
        validProductInput({ sku: undefined }),
        { id: 'admin-1' },
        { idempotencyKey: 'product-create-invalid-sku-001' },
      ),
      (error) => error.errorCode === 'PRODUCT_VALIDATION_FAILED'
    );

    await assert.rejects(
      () => productService.updateProduct('p1', { sku: '   ' }, { id: 'admin-1' }),
      (error) => error.errorCode === 'PRODUCT_VALIDATION_FAILED',
    );
  });

  it('rejects unsupported currency on create and update', async () => {
    await assert.rejects(
      () => productService.createProduct(
        validProductInput({ currency: 'USD' }),
        { id: 'admin-1' },
        { idempotencyKey: 'product-create-invalid-currency-001' },
      ),
      /Product currency must be VND/
    );
    await assert.rejects(() => productService.updateProduct('p1', { currency: 'USD' }), /Product currency must be VND/);
  });

  it('maps duplicate SKU errors from create and update to a clear 400 error', async () => {
    const duplicateError = () => Object.assign(new Error('duplicate sku'), { code: 11000, keyPattern: { sku: 1 } });
    productRepository.create = async () => {
      throw duplicateError();
    };
    productRepository.updateById = async () => {
      throw duplicateError();
    };

    await assert.rejects(
      () => productService.createProduct(
        validProductInput({ sku: 'GP-001' }),
        { id: 'admin-1' },
        { idempotencyKey: 'product-create-duplicate-sku-001' },
      ),
      (error) => error.statusCode === 409 && error.errorCode === 'PRODUCT_SKU_CONFLICT'
    );
    await assert.rejects(
      () => productService.updateProduct('p1', {
        sku: 'GP-002',
        skuCorrectionReason: 'Correct Product identity',
      }),
      (error) => error.statusCode === 409 && error.errorCode === 'PRODUCT_SKU_CONFLICT'
    );
  });

  it('rejects reactivation when the effective category is inactive or missing', async () => {
    await assert.rejects(
      () => productService.updateProduct('p6', { status: 'Active' }),
      (error) => (
        error.errorCode === 'PRODUCT_ACTIVATION_GUARDS_FAILED'
        && error.errors.some((entry) => entry.field === 'categoryId')
      )
    );
    await assert.rejects(
      () => productService.updateProduct('p7', { status: 'Active' }),
      (error) => (
        error.errorCode === 'PRODUCT_ACTIVATION_GUARDS_FAILED'
        && error.errors.some((entry) => entry.field === 'categoryId')
      )
    );
  });

  it('creates a product when Admin provides an active category and valid price', async () => {
    const result = await productService.createProduct(
      validProductInput({ status: 'Active' }),
      { id: 'admin-1' },
      { idempotencyKey: 'product-create-valid-001' },
    );

    assert.equal(result.name, 'Chef Knife');
    assert.equal(result.status, 'Inactive');
    assert.equal(productRepository.products.at(-1).categoryId, 'cat-active');
    assert.equal(auditLogger.entries[0].action, 'PRODUCT_CREATE');
  });

  it('rejects product creation when price is not positive', async () => {
    await assert.rejects(
      () =>
        productService.createProduct(
          validProductInput({ price: 0 }),
          { id: 'admin-1' },
          { idempotencyKey: 'product-create-invalid-price-001' },
        ),
      (error) => error.errorCode === 'PRODUCT_VALIDATION_FAILED'
    );
  });

  it('rejects product creation when category is inactive', async () => {
    await assert.rejects(
      () =>
        productService.createProduct(
          validProductInput({ categoryId: 'cat-inactive' }),
          { id: 'admin-1' },
          { idempotencyKey: 'product-create-inactive-category-001' },
        ),
      /Product category must be active/
    );
  });

  it('rejects stock input because Inventory is the only quantity authority', async () => {
    await assert.rejects(
      () => productService.createProduct({
        ...validProductInput(),
        stockQuantity: 3,
      }, { id: 'admin-1' }, { idempotencyKey: 'product-create-stock-001' }),
      /managed by Inventory/,
    );
  });

  it('can atomically initialize a zero-dimension Inventory through the persistent repository boundary', async () => {
    const created = [];
    const inventoryRepository = {
      async create(data) { created.push(data); return data; },
    };
    const persistentProductRepository = {
      isPersistent: true,
      async create(data) { return { _id: 'persistent-product', ...data }; },
      async findById() { return null; },
    };
    const service = createProductService({
      productRepository: persistentProductRepository,
      categoryRepository: createCategoryRepository(),
      inventoryRepository,
      transactionManager: { async withTransaction(work) { return work(null); } },
      auditLogger: { async log() {} },
    });
    await service.createProduct(
      validProductInput({ name: 'Initialized Product' }),
      { id: 'admin-1' },
      { idempotencyKey: 'product-create-inventory-001' },
    );
    assert.equal(created.length, 1);
    assert.equal(created[0].productId, 'persistent-product');
    assert.equal(created[0].sellableQuantity, 0);
    assert.equal(created[0].reservedQuantity, 0);
  });

  it('replays the committed Product result after a lost response without repeating grouped writes', async () => {
    const products = [];
    const inventories = [];
    const mediaAttachments = [];
    const commands = [];
    const audits = [];
    const sessions = [];
    const activeCategory = { _id: 'cat-active', name: 'Cookware', status: 'Active' };
    const commandRepository = {
      async findByAdminAndKey(adminId, idempotencyKey) {
        return commands.find(
          (command) => command.adminId === adminId
            && command.idempotencyKey === idempotencyKey,
        ) || null;
      },
      async create(data, session) {
        sessions.push(session);
        const command = { _id: `command-${commands.length + 1}`, ...data };
        commands.push(command);
        return command;
      },
    };
    const service = createProductService({
      productRepository: {
        async create(data, session) {
          sessions.push(session);
          const product = {
            _id: `product-${products.length + 1}`,
            ...data,
            categoryId: activeCategory,
            createdAt: new Date('2026-07-24T00:00:00.000Z'),
            updatedAt: new Date('2026-07-24T00:00:00.000Z'),
          };
          products.push(product);
          return product;
        },
      },
      categoryRepository: createCategoryRepository(),
      inventoryRepository: {
        async create(data, session) {
          sessions.push(session);
          inventories.push(data);
          return data;
        },
      },
      mediaRepository: {
        async assertOwnedForAttachment() {},
        async attach(_urls, _adminId, _productId, session) {
          sessions.push(session);
          mediaAttachments.push('attached');
        },
      },
      commandRepository,
      transactionManager: {
        async withTransaction(work) {
          return work('product-create-session');
        },
      },
      auditLogger: {
        async log(entry, session) {
          sessions.push(session);
          audits.push(entry);
        },
      },
      clock: () => new Date('2026-07-24T00:00:00.000Z'),
    });
    const options = { idempotencyKey: 'product-create-retry-001' };

    const first = await service.createProduct(
      validProductInput(),
      { id: 'admin-1' },
      options,
    );
    const replay = await service.createProduct(
      validProductInput(),
      { id: 'admin-1' },
      options,
    );

    assert.deepEqual(replay, first);
    assert.equal(products.length, 1);
    assert.equal(inventories.length, 1);
    assert.equal(mediaAttachments.length, 1);
    assert.equal(audits.length, 1);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].productId, first.id);
    assert.deepEqual(commands[0].resultSnapshot, first);
    assert.ok(sessions.length >= 5);
    assert.ok(sessions.every((session) => session === 'product-create-session'));
  });

  it('rejects one Admin reusing a Product creation key for different canonical facts', async () => {
    const products = [];
    const commands = [];
    const activeCategory = { _id: 'cat-active', name: 'Cookware', status: 'Active' };
    const service = createProductService({
      productRepository: {
        async create(data) {
          const product = {
            _id: `product-${products.length + 1}`,
            ...data,
            categoryId: activeCategory,
          };
          products.push(product);
          return product;
        },
      },
      categoryRepository: createCategoryRepository(),
      inventoryRepository: {
        async create(data) { return data; },
      },
      mediaRepository: {
        async assertOwnedForAttachment() {},
        async attach() {},
      },
      commandRepository: {
        async findByAdminAndKey(adminId, idempotencyKey) {
          return commands.find(
            (command) => command.adminId === adminId
              && command.idempotencyKey === idempotencyKey,
          ) || null;
        },
        async create(data) {
          commands.push(data);
          return data;
        },
      },
      transactionManager: { async withTransaction(work) { return work('session'); } },
      auditLogger: { async log() {} },
      clock: () => new Date('2026-07-24T00:00:00.000Z'),
    });
    const options = { idempotencyKey: 'product-create-reuse-001' };

    await service.createProduct(validProductInput(), { id: 'admin-1' }, options);
    await assert.rejects(
      () => service.createProduct(
        validProductInput({ price: 31 }),
        { id: 'admin-1' },
        options,
      ),
      (error) => error.statusCode === 409 && error.errorCode === 'IDEMPOTENCY_KEY_REUSED',
    );

    assert.equal(products.length, 1);
    assert.equal(commands.length, 1);
  });

  it('returns the committed Product when a duplicate-key loser aborts its grouped transaction', async () => {
    const products = [];
    const inventories = [];
    const mediaAttachments = [];
    const audits = [];
    let committedCommand = null;
    const activeCategory = { _id: 'cat-active', name: 'Cookware', status: 'Active' };
    const service = createProductService({
      productRepository: {
        async create(data) {
          const product = {
            _id: 'product-winner',
            ...data,
            categoryId: activeCategory,
          };
          products.push(product);
          return product;
        },
      },
      categoryRepository: createCategoryRepository(),
      inventoryRepository: {
        async create(data) {
          inventories.push(data);
          return data;
        },
      },
      mediaRepository: {
        async assertOwnedForAttachment() {},
        async attach() { mediaAttachments.push('attached'); },
      },
      commandRepository: {
        async findByAdminAndKey() {
          return committedCommand;
        },
        async create(data) {
          committedCommand = { _id: 'command-winner', ...data };
          throw Object.assign(new Error('duplicate Product command'), {
            code: 11000,
            keyPattern: { adminId: 1, idempotencyKey: 1 },
          });
        },
      },
      transactionManager: {
        async withTransaction(work) {
          const before = {
            products: products.length,
            inventories: inventories.length,
            media: mediaAttachments.length,
            audits: audits.length,
          };
          try {
            return await work('loser-session');
          } catch (error) {
            products.splice(before.products);
            inventories.splice(before.inventories);
            mediaAttachments.splice(before.media);
            audits.splice(before.audits);
            throw error;
          }
        },
      },
      auditLogger: { async log(entry) { audits.push(entry); } },
      clock: () => new Date('2026-07-24T00:00:00.000Z'),
    });

    const result = await service.createProduct(
      validProductInput(),
      { id: 'admin-1' },
      { idempotencyKey: 'product-create-race-001' },
    );

    assert.deepEqual(result, committedCommand.resultSnapshot);
    assert.equal(result.id, 'product-winner');
    assert.equal(products.length, 0);
    assert.equal(inventories.length, 0);
    assert.equal(mediaAttachments.length, 0);
    assert.equal(audits.length, 0);
  });

  it('requires a safe Idempotency-Key for Admin Product creation', async () => {
    await assert.rejects(
      () => productService.createProduct(validProductInput(), { id: 'admin-1' }),
      (error) => error.statusCode === 400
        && error.errorCode === 'PRODUCT_IDEMPOTENCY_KEY_REQUIRED',
    );
  });
});
