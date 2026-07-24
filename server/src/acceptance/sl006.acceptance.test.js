const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { createProductService } = require('../services/product.service');
const { createCategoryService } = require('../services/category.service');
const { createCartService } = require('../services/cart.service');
const {
  aggregateQualifyingSales,
  vietnamWindowStart,
} = require('../services/bestSeller.service');

function createProductFixture() {
  const categories = [
    { _id: 'cat-active', name: 'Nồi chảo', status: 'Active' },
    { _id: 'cat-inactive', name: 'Ngừng bán', status: 'Inactive' },
  ];
  const products = [
    {
      _id: 'product-active',
      name: 'Nồi chống dính',
      sku: 'NOI-001',
      description: 'Nồi bếp Việt',
      imageUrls: ['/uploads/products/11111111-1111-4111-8111-111111111111.png'],
      price: 100000,
      unit: 'cái',
      categoryId: categories[0],
      status: 'Active',
      updatedAt: new Date('2026-07-23T00:00:00.000Z'),
      activeReviews: [{ id: 'review-1', status: 'Active', rating: 5 }],
    },
    {
      _id: 'product-inactive',
      name: 'Nồi cũ',
      sku: 'NOI-OLD',
      description: 'Ngừng bán',
      imageUrls: ['/uploads/products/22222222-2222-4222-8222-222222222222.png'],
      price: 80000,
      unit: 'cái',
      categoryId: categories[0],
      status: 'Inactive',
      updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    },
  ];
  const inventories = [
    {
      productId: 'product-active',
      sellableQuantity: 5,
      reservedQuantity: 1,
      quarantinedQuantity: 2,
      damagedQuantity: 3,
      lowStockThreshold: 4,
      inventoryHealth: 'Normal',
    },
  ];
  const auditEntries = [];
  const inventoryCreates = [];
  const deletedProductIds = [];
  let transactionCalls = 0;

  const productRepository = {
    isPersistent: true,
    products,
    async list() {
      return products;
    },
    async findById(id) {
      return products.find((product) => String(product._id) === String(id)) || null;
    },
    async findPublicById(id) {
      return products.find(
        (product) => String(product._id) === String(id) && product.status === 'Active',
      ) || null;
    },
    async create(data) {
      const product = {
        _id: `product-${products.length + 1}`,
        updatedAt: new Date('2026-07-24T00:00:00.000Z'),
        ...data,
      };
      products.push(product);
      return product;
    },
    async updateById(id, data) {
      const product = products.find((entry) => String(entry._id) === String(id));
      if (!product) return null;
      Object.assign(product, data);
      return product;
    },
    async deleteById(id) {
      deletedProductIds.push(String(id));
      const index = products.findIndex((entry) => String(entry._id) === String(id));
      if (index >= 0) products.splice(index, 1);
    },
  };
  const categoryRepository = {
    async findById(id) {
      return categories.find((category) => String(category._id) === String(id)) || null;
    },
  };
  const inventoryRepository = {
    async create(data) {
      inventoryCreates.push(data);
      inventories.push(data);
      return data;
    },
    async findByProductId(productId) {
      return inventories.find((inventory) => String(inventory.productId) === String(productId)) || null;
    },
    async findByProductIds(productIds) {
      const ids = new Set(productIds.map(String));
      return inventories.filter((inventory) => ids.has(String(inventory.productId)));
    },
  };
  const service = createProductService({
    productRepository,
    categoryRepository,
    inventoryRepository,
    transactionManager: {
      async withTransaction(work) {
        transactionCalls += 1;
        return work({ id: 'session-1' });
      },
    },
    auditLogger: {
      async log(entry) {
        auditEntries.push(entry);
      },
    },
  });

  return {
    service,
    products,
    categories,
    inventories,
    inventoryCreates,
    auditEntries,
    deletedProductIds,
    get transactionCalls() {
      return transactionCalls;
    },
  };
}

function validProductInput(overrides = {}) {
  return {
    name: 'Chảo mới',
    sku: 'CHAO-NEW',
    description: 'Chảo chống dính an toàn',
    imageUrls: ['/uploads/products/33333333-3333-4333-8333-333333333333.webp'],
    price: 120000,
    unit: 'cái',
    categoryId: 'cat-active',
    ...overrides,
  };
}

function createCategoryFixture() {
  const categories = [
    {
      _id: 'category-1',
      name: 'Nồi   chảo',
      description: '',
      status: 'Active',
    },
  ];
  const productReferences = [{ _id: 'product-1', categoryId: 'category-1', status: 'Active' }];
  const repository = {
    async list() {
      return categories;
    },
    async findByName(name) {
      return categories.find((category) => category.name.toLocaleLowerCase('vi') === String(name).toLocaleLowerCase('vi')) || null;
    },
    async findById(id) {
      return categories.find((category) => String(category._id) === String(id)) || null;
    },
    async create(data) {
      const category = { _id: `category-${categories.length + 1}`, ...data };
      categories.push(category);
      return category;
    },
    async updateById(id, data) {
      const category = categories.find((entry) => String(entry._id) === String(id));
      if (!category) return null;
      Object.assign(category, data);
      return category;
    },
  };
  const service = createCategoryService({
    categoryRepository: repository,
    productRepository: {
      async listActiveByCategory(categoryId) {
        return productReferences.filter(
          (product) => product.categoryId === categoryId && product.status === 'Active',
        );
      },
    },
    auditLogger: { async log() {} },
  });
  return { service, categories, productReferences };
}

function createCartFixture({
  productStatus = 'Active',
  categoryStatus = 'Active',
  availableQuantity = 4,
  inventoryHealth = 'Normal',
} = {}) {
  const carts = [];
  const items = [];
  const commands = [];
  const mutations = [];
  const product = {
    _id: 'product-1',
    name: 'Nồi hiện tại',
    sku: 'NOI-1',
    description: 'Nồi',
    imageUrls: ['/uploads/products/44444444-4444-4444-8444-444444444444.png'],
    price: 250000,
    status: productStatus,
    categoryId: { _id: 'category-1', name: 'Nồi chảo', status: categoryStatus },
    inventoryHealth,
    availableQuantity,
    updatedAt: new Date('2026-07-24T00:00:00.000Z'),
  };
  const productRepository = {
    async findSellableById() {
      if (product.status !== 'Active' || product.categoryId.status !== 'Active') return null;
      return product;
    },
    async findCurrentById() {
      return product;
    },
    async findCurrentByIds() {
      return [product];
    },
  };
  const cartRepository = {
    carts,
    items,
    commands,
    mutations,
    async findActiveByCustomer(customerId) {
      return carts.find((cart) => cart.customerId === customerId && cart.status === 'Active') || null;
    },
    async createCart(customerId) {
      const cart = {
        _id: `cart-${carts.length + 1}`,
        customerId,
        status: 'Active',
        version: 0,
      };
      carts.push(cart);
      mutations.push({ type: 'createCart', customerId });
      return cart;
    },
    async findItem(cartId, productId) {
      return items.find(
        (item) => String(item.cartId) === String(cartId) && String(item.productId) === String(productId),
      ) || null;
    },
    async addItem(data) {
      const item = { _id: `item-${items.length + 1}`, ...data };
      items.push(item);
      mutations.push({ type: 'addItem', id: item._id });
      return item;
    },
    async updateItem(id, data) {
      const item = items.find((entry) => String(entry._id) === String(id));
      if (!item) return null;
      Object.assign(item, data);
      mutations.push({ type: 'updateItem', id: String(id), data });
      return item;
    },
    async removeItem(id) {
      const index = items.findIndex((entry) => String(entry._id) === String(id));
      if (index < 0) return null;
      const [removed] = items.splice(index, 1);
      mutations.push({ type: 'removeItem', id: String(id) });
      return removed;
    },
    async listItems(cartId) {
      return items.filter((item) => String(item.cartId) === String(cartId));
    },
  };
  const service = createCartService({ productRepository, cartRepository });
  return { service, cartRepository, product };
}

async function captureError(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  assert.fail('Expected command to fail');
}

describe('SL-006 Product, Category, Catalog, Search, Cart acceptance', () => {
  it('AT-100 creates one Inactive Product and exactly one zero Inventory atomically', async () => {
    const fixture = createProductFixture();
    const result = await fixture.service.createProduct(
      validProductInput({ status: 'Active' }),
      { id: 'admin-1' },
      { idempotencyKey: 'product-create-at100' },
    );

    assert.equal(fixture.transactionCalls, 1);
    assert.equal(fixture.inventoryCreates.length, 1);
    assert.equal(fixture.inventoryCreates[0].sellableQuantity, 0);
    assert.equal(fixture.inventoryCreates[0].reservedQuantity, 0);
    assert.equal(result.status, 'Inactive');
  });

  it('AT-101 rejects unmanaged Product media without creating partial Product/Inventory state', async () => {
    const fixture = createProductFixture();
    const beforeProducts = fixture.products.length;
    const beforeInventories = fixture.inventories.length;

    await assert.rejects(
      () => fixture.service.createProduct(validProductInput({
        imageUrls: ['https://attacker.example/product.png'],
      }), { id: 'admin-1' }, { idempotencyKey: 'product-create-at101' }),
      (error) => error.statusCode === 400 && error.errorCode === 'PRODUCT_MEDIA_INVALID',
    );
    assert.equal(fixture.products.length, beforeProducts);
    assert.equal(fixture.inventories.length, beforeInventories);
  });

  it('AT-102 reruns complete media and exact-Inventory guards before activation', async () => {
    const fixture = createProductFixture();
    fixture.products.push({
      _id: 'activation-target',
      name: 'Thiếu ảnh',
      sku: 'MISSING-MEDIA',
      description: 'Chưa đủ điều kiện',
      imageUrls: [],
      price: 100000,
      unit: 'cái',
      categoryId: fixture.categories[0],
      status: 'Inactive',
    });

    await assert.rejects(
      () => fixture.service.updateProduct(
        'activation-target',
        { status: 'Active' },
        { id: 'admin-1' },
      ),
      (error) => error.statusCode === 409
        && error.errorCode === 'PRODUCT_ACTIVATION_GUARDS_FAILED'
        && error.errors.some((entry) => entry.field === 'imageUrls'),
    );
  });

  it('AT-103 requires an attributable SKU correction and prevents silent lineage rewrite', async () => {
    const fixture = createProductFixture();

    await assert.rejects(
      () => fixture.service.updateProduct(
        'product-active',
        { sku: 'NOI-002' },
        { id: 'admin-1' },
      ),
      (error) => error.statusCode === 400 && error.errorCode === 'SKU_CORRECTION_REASON_REQUIRED',
    );
  });

  it('AT-104 increments a dedicated price version and retains old/new price history', async () => {
    const fixture = createProductFixture();
    const before = await fixture.service.getPublicProductById('product-active');
    const updated = await fixture.service.updateProduct(
      'product-active',
      { price: 110000 },
      { id: 'admin-1' },
    );

    assert.notEqual(updated.priceVersion, before.priceVersion);
    assert.equal(updated.priceHistory.at(-1).oldPrice, 100000);
    assert.equal(updated.priceHistory.at(-1).newPrice, 110000);
  });

  it('AT-105 makes every Product-media mutation Admin-only and owner-bound', () => {
    const routeSource = readFileSync(
      path.join(__dirname, '../routes/upload.routes.js'),
      'utf8',
    );
    const controllerSource = readFileSync(
      path.join(__dirname, '../controller/upload.controller.js'),
      'utf8',
    );

    assert.doesNotMatch(
      routeSource,
      /admin\/uploads\/products[\s\S]{0,180}authorizeRoles\('Admin', 'Staff'\)/,
    );
    assert.match(routeSource, /admin\/uploads\/products[\s\S]{0,180}authorizeRoles\('Admin'\)/);
    assert.match(controllerSource, /req\.user\.id/);
    assert.match(controllerSource, /expiresAt|temporary|ownerId/i);
  });

  it('AT-106 rejects Unicode/case/whitespace-equivalent Category identities', async () => {
    const fixture = createCategoryFixture();

    await assert.rejects(
      () => fixture.service.createCategory({
        name: '  NỒI chảo  ',
        description: 'Trùng danh tính',
        status: 'Active',
      }, { id: 'admin-1' }),
      (error) => error.statusCode === 409 && error.errorCode === 'CATEGORY_NAME_CONFLICT',
    );
  });

  it('AT-107 blocks Category deactivation while an Active Product references it', async () => {
    const fixture = createCategoryFixture();

    await assert.rejects(
      () => fixture.service.updateCategory(
        'category-1',
        { status: 'Inactive' },
        { id: 'admin-1' },
      ),
      (error) => error.statusCode === 409
        && error.errorCode === 'CATEGORY_ACTIVE_PRODUCTS'
        && error.data.activeProductIds.includes('product-1'),
    );
    assert.equal(fixture.categories[0].status, 'Active');
  });

  it('AT-108 returns only Active Product + Active Category and authorized active reviews', async () => {
    const fixture = createProductFixture();
    const product = await fixture.service.getPublicProductById('product-active');

    assert.ok(Array.isArray(product.reviews), 'public Product detail must expose an authorized review array');
    assert.deepEqual(product.reviews.map((review) => review.id), ['review-1']);
    await assert.rejects(
      () => fixture.service.getPublicProductById('product-inactive'),
      (error) => error.statusCode === 404,
    );
  });

  it('AT-109 exposes only derived public availability and no raw Inventory dimensions', async () => {
    const fixture = createProductFixture();
    const product = await fixture.service.getPublicProductById('product-active');

    assert.equal(product.availabilityStatus, 'InStock');
    for (const protectedField of [
      'stockQuantity',
      'sellableQuantity',
      'reservedQuantity',
      'quarantinedQuantity',
      'damagedQuantity',
      'lowStockThreshold',
      'inventoryHealth',
    ]) {
      assert.equal(Object.hasOwn(product, protectedField), false, protectedField);
    }
  });

  it('AT-110 matches Vietnamese keyword variants across name, SKU, and description', async () => {
    const fixture = createProductFixture();
    const result = await fixture.service.listPublicProducts({ keyword: 'noi viet' });

    assert.deepEqual(result.items.map((product) => product.id), ['product-active']);
    assert.equal(result.items[0].name, 'Nồi chống dính');
  });

  it('AT-111 combines valid filters and returns field errors for a reversed price range', async () => {
    const fixture = createProductFixture();

    await assert.rejects(
      () => fixture.service.listPublicProducts({
        categoryId: 'cat-active',
        minPrice: 200000,
        maxPrice: 100000,
        availability: 'InStock',
      }),
      (error) => error.statusCode === 400
        && error.errorCode === 'CATALOG_FILTER_INVALID'
        && error.errors.some((entry) => entry.field === 'minPrice'),
    );
  });

  it('AT-112 returns bounded stable server pagination with deterministic metadata', async () => {
    const fixture = createProductFixture();
    const result = await fixture.service.listPublicProducts({
      page: 1,
      pageSize: 1,
      sort: 'name',
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.page, 1);
    assert.equal(result.pageSize, 1);
    assert.equal(result.totalPages, 1);
  });

  it('AT-113 uses the inclusive 30-day Vietnam window and CompletedSale time for ONLINE and later COD collection', () => {
    const now = new Date('2026-07-24T05:30:00.000Z');
    const start = vietnamWindowStart(now);
    assert.equal(start.toISOString(), '2026-06-24T17:00:00.000Z');

    const orders = [
      {
        _id: 'online-boundary',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        completedSaleAt: start,
      },
      {
        _id: 'cod-later-collection',
        paymentMethod: 'COD',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        deliveredAt: new Date('2026-06-20T03:00:00.000Z'),
        completedSaleAt: new Date('2026-06-25T03:00:00.000Z'),
        carrierSettledAt: new Date('2026-08-02T03:00:00.000Z'),
      },
      {
        _id: 'online-end-boundary',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        completedSaleAt: now,
      },
      {
        _id: 'carrier-only-inside',
        paymentMethod: 'COD',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        completedSaleAt: new Date(start.getTime() - 1),
        carrierSettledAt: new Date('2026-07-20T03:00:00.000Z'),
      },
      {
        _id: 'unpaid',
        paymentMethod: 'ONLINE',
        paymentStatus: 'Unpaid',
        orderStatus: 'Delivered',
        completedSaleAt: new Date('2026-07-20T03:00:00.000Z'),
      },
    ];
    const orderDetails = orders.map((order, index) => ({
      orderId: order._id,
      productId: `product-${index + 1}`,
      quantity: 1,
      subtotal: 100 + index,
    }));

    const rows = aggregateQualifyingSales({ orders, orderDetails, start, end: now });

    assert.deepEqual(rows.map((row) => row._id).sort(), [
      'product-1',
      'product-2',
      'product-3',
    ]);
  });

  it('AT-114 returns the explicit newest-Product fallback and label when no completed sales qualify', async () => {
    const activeCategory = { _id: 'category-active', name: 'Bếp Việt', status: 'Active' };
    const products = [
      {
        _id: 'newest',
        name: 'Mới nhất',
        sku: 'NEW-002',
        description: 'Sản phẩm mới',
        imageUrls: ['/uploads/products/44444444-4444-4444-8444-444444444444.png'],
        price: 200000,
        unit: 'cái',
        categoryId: activeCategory,
        status: 'Active',
        createdAt: new Date('2026-07-24T00:00:00.000Z'),
      },
      {
        _id: 'older',
        name: 'Cũ hơn',
        sku: 'NEW-001',
        description: 'Sản phẩm cũ hơn',
        imageUrls: ['/uploads/products/55555555-5555-4555-8555-555555555555.png'],
        price: 100000,
        unit: 'cái',
        categoryId: activeCategory,
        status: 'Active',
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
      },
    ];
    const service = createProductService({
      productRepository: { async list() { return products; } },
      bestSellerRepository: { async aggregateQualifying() { return []; } },
    });

    const result = await service.listBestSellers({
      limit: 2,
      now: new Date('2026-07-24T05:30:00.000Z'),
    });

    assert.equal(result.type, 'Newest');
    assert.equal(result.label, 'Sản phẩm mới');
    assert.deepEqual(result.items.map((item) => item.id), ['newest', 'older']);
  });

  it('AT-115 reads a missing Cart without creating persistence', async () => {
    const fixture = createCartFixture();
    const cart = await fixture.service.getCart('customer-1');

    assert.equal(cart.id, null);
    assert.equal(cart.version, 0);
    assert.equal(cart.status, 'Empty');
    assert.equal(fixture.cartRepository.carts.length, 0);
    assert.equal(fixture.cartRepository.mutations.length, 0);
  });

  it('AT-116 applies an owned Cart command once, increments version, and reserves nothing', async () => {
    const fixture = createCartFixture();
    const cart = await fixture.service.addItem('customer-1', {
      productId: 'product-1',
      quantity: 2,
      expectedVersion: 0,
      idempotencyKey: 'cart-add-command-0001',
    });

    assert.equal(cart.version, 1);
    assert.equal(cart.commandStatus, 'Applied');
    assert.equal(cart.items[0].quantity, 2);
    assert.equal(
      fixture.cartRepository.mutations.some((mutation) => /reserve|inventory/i.test(mutation.type)),
      false,
    );
  });

  it('AT-117 returns AlreadyProcessed for a repeated Cart command key without a second quantity effect', async () => {
    const fixture = createCartFixture();
    const command = {
      productId: 'product-1',
      quantity: 1,
      expectedVersion: 0,
      idempotencyKey: 'cart-add-command-0002',
    };
    await fixture.service.addItem('customer-1', command);
    const replay = await fixture.service.addItem('customer-1', command);

    assert.equal(replay.commandStatus, 'AlreadyProcessed');
    assert.equal(replay.items[0].quantity, 1);
    assert.equal(replay.version, 1);
  });

  it('AT-118 rejects an excessive quantity and returns only the owner-safe maximum', async () => {
    const fixture = createCartFixture({ availableQuantity: 4 });
    const error = await captureError(() => fixture.service.addItem('customer-1', {
      productId: 'product-1',
      quantity: 5,
      expectedVersion: 0,
      idempotencyKey: 'cart-add-command-0003',
    }));

    assert.equal(error.errorCode, 'CART_QUANTITY_EXCEEDS_AVAILABLE');
    assert.equal(error.data.maxOrderableQuantity, 4);
    assert.equal(fixture.cartRepository.carts.length, 0);
  });

  it('AT-119 rejects stale expected Cart version and returns the current Cart', async () => {
    const fixture = createCartFixture();
    const created = await fixture.service.addItem('customer-1', {
      productId: 'product-1',
      quantity: 1,
      expectedVersion: 0,
      idempotencyKey: 'cart-add-command-0004',
    });
    const error = await captureError(() => fixture.service.updateItem(
      'customer-1',
      created.items[0].id,
      {
        quantity: 2,
        expectedVersion: 0,
        idempotencyKey: 'cart-update-command-0001',
      },
    ));

    assert.equal(error.errorCode, 'CART_VERSION_CONFLICT');
    assert.equal(error.data.cart.version, 1);
    assert.equal(error.data.cart.items[0].quantity, 1);
  });

  it('AT-120 reconciles current presentation and price without writing on Cart read', async () => {
    const fixture = createCartFixture();
    const cart = await fixture.cartRepository.createCart('customer-1');
    await fixture.cartRepository.addItem({
      cartId: cart._id,
      productId: 'product-1',
      productName: 'Tên cũ',
      quantity: 2,
      unitPrice: 200000,
      priceVersion: new Date('2026-07-23T00:00:00.000Z'),
    });
    fixture.cartRepository.mutations.length = 0;

    const result = await fixture.service.getCart('customer-1');

    assert.equal(result.items[0].productName, 'Nồi hiện tại');
    assert.equal(result.items[0].previousUnitPrice, 200000);
    assert.equal(result.items[0].unitPrice, 250000);
    assert.equal(result.items[0].priceChanged, true);
    assert.equal(result.totalAmount, 500000);
    assert.equal(fixture.cartRepository.mutations.length, 0);
  });

  it('AT-121 retains an unavailable line and makes it eligible only after current publication guards pass', async () => {
    const fixture = createCartFixture({ productStatus: 'Inactive' });
    const cart = await fixture.cartRepository.createCart('customer-1');
    await fixture.cartRepository.addItem({
      cartId: cart._id,
      productId: 'product-1',
      productName: 'Tên cũ',
      quantity: 1,
      unitPrice: 250000,
      priceVersion: new Date('2026-07-23T00:00:00.000Z'),
    });

    const result = await fixture.service.getCart('customer-1');

    assert.equal(result.items.length, 1);
    assert.ok(result.items[0].issues.some((issue) => issue.code === 'Unavailable'));
    assert.equal(result.canCheckout, false);
  });

  it('AT-122 retains independent insufficient-stock and reconciliation issues and creates no reservation', async () => {
    const fixture = createCartFixture({
      availableQuantity: 0,
      inventoryHealth: 'ReconciliationRequired',
    });
    const cart = await fixture.cartRepository.createCart('customer-1');
    await fixture.cartRepository.addItem({
      cartId: cart._id,
      productId: 'product-1',
      productName: 'Nồi',
      quantity: 2,
      unitPrice: 250000,
      priceVersion: new Date('2026-07-23T00:00:00.000Z'),
    });

    const result = await fixture.service.getCart('customer-1');
    const issueCodes = result.items[0].issues.map((issue) => issue.code);

    assert.ok(issueCodes.includes('InsufficientStock'));
    assert.ok(issueCodes.includes('InventoryReconciliation'));
    assert.equal(result.items[0].maxOrderableQuantity, 0);
    assert.equal(result.canCheckout, false);
  });

  it('AT-123 requires exact displayed Cart and price versions at the SL-003 handoff', () => {
    const source = readFileSync(
      path.join(__dirname, '../services/order.service.js'),
      'utf8',
    );

    assert.match(source, /input\.cartId/);
    assert.match(source, /input\.cartVersion/);
    assert.match(source, /cartId[\s\S]{0,250}cartVersion[\s\S]{0,500}expectedItems/);
  });

  it('AT-124 closes only the exact Cart/version inside the existing atomic checkout transaction', () => {
    const source = readFileSync(
      path.join(__dirname, '../services/order.service.js'),
      'utf8',
    );

    assert.match(
      source,
      /clearExactCart\([^)]*cartId[^)]*cartVersion[^)]*session[^)]*\)/,
    );
    assert.match(
      source,
      /_id:\s*cartId[\s\S]{0,100}status:\s*'Active'[\s\S]{0,100}version:\s*Number\(cartVersion\)/,
    );
    assert.match(source, /shippingFee:\s*0/);
  });

  it('CR AT-218 excludes Returned orders from current public ranking without adding historical-report behavior', () => {
    const start = new Date('2026-06-24T17:00:00.000Z');
    const end = new Date('2026-07-24T05:30:00.000Z');
    const rows = aggregateQualifyingSales({
      orders: [
        {
          _id: 'delivered-sale',
          orderStatus: 'Delivered',
          paymentStatus: 'Paid',
          completedSaleAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          _id: 'returned-sale',
          orderStatus: 'Returned',
          paymentStatus: 'Paid',
          completedSaleAt: new Date('2026-07-02T00:00:00.000Z'),
        },
      ],
      orderDetails: [
        { orderId: 'delivered-sale', productId: 'public-product', quantity: 2, subtotal: 200 },
        { orderId: 'returned-sale', productId: 'public-product', quantity: 9, subtotal: 900 },
      ],
      start,
      end,
    });

    assert.deepEqual(rows, [{ _id: 'public-product', quantity: 2, revenue: 200 }]);
    assert.equal(typeof createProductFixture().service.listHistoricalGrossSales, 'undefined');
  });

  it('CR AT-219 ranks by quantity, revenue, then SKU and excludes inactive Products', async () => {
    const category = { _id: 'category-active', name: 'Bếp Việt', status: 'Active' };
    const product = (id, sku, status = 'Active') => ({
      _id: id,
      name: id,
      sku,
      description: id,
      imageUrls: ['/uploads/products/66666666-6666-4666-8666-666666666666.png'],
      price: 100,
      unit: 'cái',
      categoryId: category,
      status,
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
    });
    const products = [
      product('quantity-revenue', 'ZZ-001'),
      product('quantity-sku-a', 'AA-001'),
      product('quantity-sku-b', 'BB-001'),
      product('inactive-high-volume', 'INACTIVE-001', 'Inactive'),
    ];
    const service = createProductService({
      productRepository: {
        async findPublicByIds() {
          return products;
        },
      },
      bestSellerRepository: {
        async aggregateQualifying() {
          return [
            { _id: 'quantity-sku-b', quantity: 5, revenue: 500 },
            { _id: 'inactive-high-volume', quantity: 999, revenue: 999999 },
            { _id: 'quantity-revenue', quantity: 5, revenue: 600 },
            { _id: 'quantity-sku-a', quantity: 5, revenue: 500 },
          ];
        },
      },
    });

    const result = await service.listBestSellers({
      limit: 10,
      now: new Date('2026-07-24T05:30:00.000Z'),
    });

    assert.equal(result.type, 'BestSeller');
    assert.equal(result.label, 'Bán chạy');
    assert.deepEqual(result.items.map((item) => item.id), [
      'quantity-revenue',
      'quantity-sku-a',
      'quantity-sku-b',
    ]);
  });
});
