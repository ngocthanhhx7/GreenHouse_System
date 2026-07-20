const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createProductService } = require('./product.service');

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
    { _id: 'p1', name: 'Green Pan', price: 25, sku: 'GP-001', categoryId: activeCategory, status: 'Active' },
    { _id: 'p2', name: 'Hidden Plate', price: 10, categoryId: activeCategory, status: 'Inactive' },
    { _id: 'p3', name: 'Storage Box', price: 15, categoryId: activeCategory, status: 'Active' },
    { _id: 'p4', name: 'Inactive Category Product', price: 12, categoryId: { _id: 'cat-inactive', name: 'Old Category', status: 'Inactive' }, status: 'Active' },
    { _id: 'p5', name: 'Missing Category Product', price: 14, categoryId: null, status: 'Active' },
  ];

  return {
    products,
    async list() {
      return products;
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
    assert.equal(result.items[0].status, 'Active');
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

  it('serializes SKU and normalizes VND currency across create and update', async () => {
    const legacyDetail = await productService.getPublicProductById('p1');
    assert.equal(legacyDetail.sku, 'GP-001');
    assert.equal(legacyDetail.currency, 'VND');

    const created = await productService.createProduct(
      {
        name: 'Chef Knife',
        sku: ' CK-001 ',
        price: 30,
        unit: 'piece',
        categoryId: 'cat-active',
        currency: 'vnd',
      },
      { id: 'admin-1' }
    );
    assert.equal(productRepository.products.at(-1).sku, 'CK-001');
    assert.equal(productRepository.products.at(-1).currency, 'VND');
    assert.equal(created.sku, 'CK-001');
    assert.equal(created.currency, 'VND');

    const updated = await productService.updateProduct('p1', { sku: ' GP-002 ', currency: ' vnd ' }, { id: 'admin-1' });
    assert.equal(productRepository.products[0].sku, 'GP-002');
    assert.equal(productRepository.products[0].currency, 'VND');
    assert.equal(updated.sku, 'GP-002');
    assert.equal(updated.currency, 'VND');
  });

  it('rejects unsupported currency on create and update', async () => {
    await assert.rejects(
      () => productService.createProduct({ name: 'USD Product', price: 10, unit: 'piece', categoryId: 'cat-active', currency: 'USD' }),
      /Product currency must be VND/
    );
    await assert.rejects(() => productService.updateProduct('p1', { currency: 'USD' }), /Product currency must be VND/);
  });

  it('creates a product when Admin provides an active category and valid price', async () => {
    const result = await productService.createProduct(
      {
        name: 'Chef Knife',
        description: 'Sharp kitchen knife',
        imageUrls: ['https://example.com/knife.png'],
        price: 30,
        unit: 'piece',
        categoryId: 'cat-active',
        status: 'Active',
      },
      { id: 'admin-1' }
    );

    assert.equal(result.name, 'Chef Knife');
    assert.equal(productRepository.products.at(-1).categoryId, 'cat-active');
    assert.equal(auditLogger.entries[0].action, 'PRODUCT_CREATE');
  });

  it('rejects product creation when price is not positive', async () => {
    await assert.rejects(
      () =>
        productService.createProduct(
          {
            name: 'Invalid Product',
            price: 0,
            unit: 'piece',
            categoryId: 'cat-active',
          },
          { id: 'admin-1' }
        ),
      /Product price must be greater than 0/
    );
  });

  it('rejects product creation when category is inactive', async () => {
    await assert.rejects(
      () =>
        productService.createProduct(
          {
            name: 'Old Category Product',
            price: 10,
            unit: 'piece',
            categoryId: 'cat-inactive',
          },
          { id: 'admin-1' }
        ),
      /Product category must be active/
    );
  });
});
