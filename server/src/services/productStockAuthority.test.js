const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const Product = require('../models/product.model');
const { createProductService } = require('./product.service');

describe('Inventory-only Product quantity authority', () => {
  it('does not persist Product.stockQuantity as a second authority', () => {
    assert.equal(Product.schema.path('stockQuantity'), undefined);
  });

  it('derives public catalog quantity from Inventory', async () => {
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

    assert.equal((await service.listPublicProducts()).items[0].stockQuantity, 5);
    assert.equal((await service.getPublicProductById('product-1')).stockQuantity, 5);
  });
});
