const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const {
  SL006_INDEX_MODELS,
  createMigrationRepository,
  migrateSl006CatalogCart,
  normalizeLegacyCategory,
  normalizeLegacyProduct,
} = require('./migrateSl006CatalogCart');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Inventory = require('../models/inventory.model');

describe('SL-006 Catalog/Cart migration', () => {
  it('verifies all seven SL-006 index-owning models without inventing legacy commands', () => {
    assert.deepEqual(
      (SL006_INDEX_MODELS || []).map((model) => model.modelName),
      [
        'Product',
        'Category',
        'ProductMediaAsset',
        'ShoppingCart',
        'CartItem',
        'CartCommand',
        'ProductCommand',
      ],
    );
  });

  it('normalizes Category identity and Product search/price/SKU history without copying stock', () => {
    assert.deepEqual(
      normalizeLegacyCategory({ name: '  Nồi   Chảo  ', status: 'Active' }),
      {
        name: 'Nồi Chảo',
        normalizedName: 'nồi chảo',
        status: 'Active',
      },
    );
    const product = normalizeLegacyProduct({
      name: 'Nồi Việt',
      sku: ' noi-1 ',
      description: 'Bếp Việt',
      imageUrls: ['/uploads/products/11111111-1111-4111-8111-111111111111.png'],
      price: 100000,
      unit: 'cái',
      categoryId: 'category-1',
      status: 'Active',
      stockQuantity: 999,
      updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    }, { inventoryCount: 1, categoryActive: true });

    assert.equal(product.skuAliases[0], 'NOI-1');
    assert.match(product.searchTextNormalized, /noi viet.*bep viet/);
    assert.equal(product.priceVersion.toISOString(), '2026-07-23T00:00:00.000Z');
    assert.equal(Object.hasOwn(product, 'stockQuantity'), false);
  });

  it('conservatively inactivates a legacy Product whose publication guards cannot be proved', () => {
    const product = normalizeLegacyProduct({
      name: 'Thiếu ảnh',
      sku: 'MISSING',
      description: 'Không đủ điều kiện',
      imageUrls: [],
      price: 100000,
      unit: 'cái',
      categoryId: 'category-1',
      status: 'Active',
    }, { inventoryCount: 0, categoryActive: true });

    assert.equal(product.status, 'Inactive');
  });

  it('physically removes legacy stockQuantity even though it is absent from the strict Product schema', async () => {
    const categoryId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const normalized = normalizeLegacyProduct({
      name: 'Nồi Việt',
      sku: 'NOI-STRICT-1',
      description: 'Bếp Việt',
      imageUrls: ['/uploads/products/11111111-1111-4111-8111-111111111111.png'],
      price: 100000,
      priceVersion: new Date('2026-07-23T00:00:00.000Z'),
      priceHistory: [],
      unit: 'cái',
      categoryId,
      status: 'Active',
    }, { inventoryCount: 1, categoryActive: true });
    const storedProduct = {
      _id: productId,
      ...normalized,
      stockQuantity: 99,
    };
    const originals = {
      productFind: Product.find,
      categoryFind: Category.find,
      inventoryFind: Inventory.find,
      collectionUpdateOne: Product.collection.updateOne,
    };
    const leanQuery = (rows) => ({
      select() { return this; },
      async lean() { return rows; },
    });

    Product.find = () => leanQuery([storedProduct]);
    Category.find = () => leanQuery([{ _id: categoryId, status: 'Active' }]);
    Inventory.find = () => leanQuery([{ productId }]);
    Product.collection.updateOne = async (_filter, update) => {
      if (update.$unset?.stockQuantity) delete storedProduct.stockQuantity;
      return { modifiedCount: 1 };
    };

    try {
      const modified = await createMigrationRepository().backfillProducts();

      assert.equal(modified, 1);
      assert.equal(Object.hasOwn(storedProduct, 'stockQuantity'), false);
    } finally {
      Product.find = originals.productFind;
      Category.find = originals.categoryFind;
      Inventory.find = originals.inventoryFind;
      Product.collection.updateOne = originals.collectionUpdateOne;
    }
  });

  it('preflights before mutation and performs zero business writes on a second run', async () => {
    const calls = [];
    let first = true;
    const repository = {
      async preflight() { calls.push('preflight'); },
      async backfillCategories() { calls.push('categories'); return first ? 2 : 0; },
      async backfillProducts() { calls.push('products'); return first ? 3 : 0; },
      async backfillMediaAssets() { calls.push('media'); return first ? 4 : 0; },
      async backfillCarts() { calls.push('carts'); return first ? 5 : 0; },
      async verifyIndexes() { calls.push('indexes'); first = false; return 7; },
    };

    const firstRun = await migrateSl006CatalogCart({ repository });
    const secondRun = await migrateSl006CatalogCart({ repository });

    assert.equal(firstRun.businessWrites, 14);
    assert.equal(secondRun.businessWrites, 0);
    assert.equal(firstRun.indexesVerified, 7);
    assert.equal(secondRun.indexesVerified, 7);
    assert.deepEqual(calls.slice(0, 6), [
      'preflight',
      'categories',
      'products',
      'media',
      'carts',
      'indexes',
    ]);
  });
});
