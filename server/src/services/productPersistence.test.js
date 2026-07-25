const assert = require('node:assert/strict');
const { afterEach, describe, it } = require('node:test');

const Product = require('../models/product.model');
const { createModelProductRepository } = require('./productPersistence');

const originalFindOne = Product.findOne;

afterEach(() => {
  Product.findOne = originalFindOne;
});

describe('product persistence public detail lookup', () => {
  it('returns null without querying MongoDB when the public Product id is invalid', async () => {
    let queryCount = 0;
    Product.findOne = () => {
      queryCount += 1;
      return {
        populate() {
          return this;
        },
        lean() {
          return Promise.resolve({ _id: 'unexpected-product' });
        },
      };
    };

    const result = await createModelProductRepository().findPublicById('not-an-object-id');

    assert.equal(result, null);
    assert.equal(queryCount, 0);
  });

  it('queries only an Active Product when the public Product id is valid', async () => {
    const productId = '507f1f77bcf86cd799439011';
    let receivedQuery;
    Product.findOne = (query) => {
      receivedQuery = query;
      return {
        populate(path) {
          assert.equal(path, 'categoryId');
          return this;
        },
        lean() {
          return Promise.resolve({ _id: productId, status: 'Active' });
        },
      };
    };

    const result = await createModelProductRepository().findPublicById(productId);

    assert.deepEqual(receivedQuery, { _id: productId, status: 'Active' });
    assert.equal(result._id, productId);
  });
});
