const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const Product = require('../models/product.model');
const {
  availableQuantityOf,
  inventoryHealthOf,
} = require('./cartProjection');
const { availabilityStatusOf } = require('./catalogQuery');
const { createProductService } = require('./product.service');

describe('Inventory-only Product quantity authority', () => {
  it('does not persist Product.stockQuantity as a second authority', () => {
    assert.equal(Product.schema.path('stockQuantity'), undefined);
  });

  it('derives only public availability from Inventory without exposing a raw quantity', async () => {
    const product = {
      _id: 'product-1',
      name: 'Inventory-backed product',
      sku: 'INV-1',
      currency: 'VND',
      price: 100,
      unit: 'item',
      status: 'Active',
      stockQuantity: 999,
      categoryId: { _id: 'category-1', name: 'Category', status: 'Active' },
    };
    const service = createProductService({
      productRepository: {
        async list() { return [product]; },
        async findPublicById() { return product; },
      },
      categoryRepository: { async findById() { return product.categoryId; } },
      inventoryRepository: {
        async findByProductIds() {
          return [{
            productId: 'product-1',
            sellableQuantity: 7,
            reservedQuantity: 2,
            inventoryHealth: 'Normal',
          }];
        },
        async findByProductId() {
          return {
            productId: 'product-1',
            sellableQuantity: 7,
            reservedQuantity: 2,
            inventoryHealth: 'Normal',
          };
        },
      },
      auditLogger: { async log() {} },
    });

    const listItem = (await service.listPublicProducts()).items[0];
    const detail = await service.getPublicProductById('product-1');
    assert.equal(listItem.availabilityStatus, 'InStock');
    assert.equal(detail.availabilityStatus, 'InStock');
    assert.equal(listItem.stockQuantity, undefined);
    assert.equal(detail.stockQuantity, undefined);
    assert.equal(listItem.availableQuantity, undefined);
    assert.equal(detail.inventoryHealth, undefined);
  });

  it('keeps coherent legacy Inventory records sellable when health fields are absent', () => {
    const legacyInventory = {
      stockQuantity: 25,
      reservedQuantity: 2,
    };

    assert.equal(availabilityStatusOf(legacyInventory), 'InStock');
    assert.equal(inventoryHealthOf({ inventory: legacyInventory }), 'Normal');
    assert.equal(availableQuantityOf({ inventory: legacyInventory }), 23);
  });

  it('fails closed for missing or inconsistent legacy Inventory records', () => {
    const inconsistentInventory = {
      stockQuantity: 2,
      reservedQuantity: 3,
    };

    assert.equal(availabilityStatusOf(null), 'OutOfStock');
    assert.equal(inventoryHealthOf({ inventory: inconsistentInventory }), 'ReconciliationRequired');
    assert.equal(availableQuantityOf({ inventory: inconsistentInventory }), 0);
  });
});
