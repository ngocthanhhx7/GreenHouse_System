const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const productController = require('./product.controller');
const { productService } = require('../services/product.service');

function response() {
  return {
    req: {},
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('Admin Product controller command identity', () => {
  it('forwards only the authenticated Admin and Idempotency-Key to Product creation', async () => {
    const original = productService.createProduct;
    let received;
    productService.createProduct = async (input, actor, options) => {
      received = { input, actor, options };
      return { id: 'product-1', name: input.name };
    };
    const req = {
      body: { name: 'Nồi mới', actor: { id: 'spoofed-admin' } },
      user: { id: 'admin-1', role: 'Admin' },
      get(name) {
        return name === 'Idempotency-Key' ? 'product-create-header-001' : '';
      },
    };

    try {
      await productController.create(req, response(), (error) => {
        throw error;
      });
    } finally {
      productService.createProduct = original;
    }

    assert.deepEqual(received.input, req.body);
    assert.equal(received.actor.id, 'admin-1');
    assert.equal(received.options.idempotencyKey, 'product-create-header-001');
  });
});
