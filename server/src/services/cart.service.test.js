const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createCartService } = require('./cart.service');

function createProductRepository() {
  const products = [
    {
      _id: 'p1',
      name: 'Green Pan',
      price: 25,
      status: 'Active',
      categoryId: { _id: 'cat-1', status: 'Active' },
      inventoryHealth: 'Normal',
      sellableQuantity: 5,
      updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    },
    {
      _id: 'p2',
      name: 'Hidden Plate',
      price: 10,
      status: 'Inactive',
      categoryId: { _id: 'cat-1', status: 'Active' },
      inventoryHealth: 'Normal',
      sellableQuantity: 5,
    },
  ];
  return {
    async findSellableById(id) {
      const product = products.find((item) => item._id === id);
      return product && product.status === 'Active' ? product : null;
    },
  };
}

function createCartRepository() {
  const carts = [];
  const items = [];
  return {
    carts,
    items,
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
      return cart;
    },
    async findItem(cartId, productId) {
      return items.find((item) => item.cartId === cartId && item.productId === productId) || null;
    },
    async addItem(data) {
      const item = { _id: `item-${items.length + 1}`, ...data };
      items.push(item);
      return item;
    },
    async updateItem(id, data) {
      const item = items.find((entry) => entry._id === id);
      if (!item) return null;
      Object.assign(item, data);
      return item;
    },
    async removeItem(id) {
      const index = items.findIndex((entry) => entry._id === id);
      if (index === -1) return null;
      const [item] = items.splice(index, 1);
      return item;
    },
    async listItems(cartId) {
      return items.filter((item) => item.cartId === cartId);
    },
  };
}

describe('cart service', () => {
  let cartService;

  beforeEach(() => {
    cartService = createCartService({
      productRepository: createProductRepository(),
      cartRepository: createCartRepository(),
    });
  });

  it('adds an active product to customer cart and calculates totals', async () => {
    const result = await cartService.addItem('customer-1', {
      productId: 'p1',
      quantity: 2,
      expectedVersion: 0,
      idempotencyKey: 'cart-add-001',
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].productName, 'Green Pan');
    assert.equal(result.items[0].priceVersion, '2026-07-23T00:00:00.000Z');
    assert.equal(result.totalAmount, 50);
  });

  it('refreshes stale cart price evidence before displaying checkout totals', async () => {
    const cartRepository = createCartRepository();
    const cart = await cartRepository.createCart('customer-1');
    await cartRepository.addItem({
      cartId: cart._id,
      productId: 'p1',
      productName: 'Old Pan',
      quantity: 2,
      unitPrice: 20,
      priceVersion: new Date('2026-07-22T00:00:00.000Z'),
    });
    cartService = createCartService({
      productRepository: createProductRepository(),
      cartRepository,
    });

    const result = await cartService.getCart('customer-1');

    assert.equal(result.items[0].productName, 'Green Pan');
    assert.equal(result.items[0].unitPrice, 25);
    assert.equal(result.items[0].priceVersion, '2026-07-23T00:00:00.000Z');
    assert.equal(result.totalAmount, 50);
  });

  it('merges quantity when the same product is added twice', async () => {
    await cartService.addItem('customer-1', {
      productId: 'p1',
      quantity: 2,
      expectedVersion: 0,
      idempotencyKey: 'cart-merge-001',
    });
    const result = await cartService.addItem('customer-1', {
      productId: 'p1',
      quantity: 1,
      expectedVersion: 1,
      idempotencyKey: 'cart-merge-002',
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].quantity, 3);
    assert.equal(result.totalAmount, 75);
  });

  it('rejects quantity greater than current availability', async () => {
    await assert.rejects(
      () => cartService.addItem('customer-1', {
        productId: 'p1',
        quantity: 6,
        expectedVersion: 0,
        idempotencyKey: 'cart-too-many-001',
      }),
      /exceeds current availability/
    );
  });

  it('rejects zero, negative, and decimal quantities before changing the cart', async () => {
    for (const [quantity, idempotencyKey] of [
      [0, 'cart-invalid-zero-001'],
      [-1, 'cart-invalid-negative-001'],
      [1.5, 'cart-invalid-decimal-001'],
    ]) {
      await assert.rejects(
        () => cartService.addItem('customer-1', {
          productId: 'p1',
          quantity,
          expectedVersion: 0,
          idempotencyKey,
        }),
        (error) => error.statusCode === 400 && error.errorCode === 'CART_QUANTITY_INVALID',
      );
    }

    const cart = await cartService.getCart('customer-1');
    assert.equal(cart.id, null);
    assert.deepEqual(cart.items, []);
  });

  it('updates one owned item quantity and increments the cart version', async () => {
    const added = await cartService.addItem('customer-1', {
      productId: 'p1',
      quantity: 1,
      expectedVersion: 0,
      idempotencyKey: 'cart-update-setup-001',
    });

    const result = await cartService.updateItem('customer-1', added.items[0].id, {
      quantity: 4,
      expectedVersion: added.version,
      idempotencyKey: 'cart-update-owned-001',
    });

    assert.equal(result.version, 2);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].quantity, 4);
    assert.equal(result.totalAmount, 100);
  });

  it('rejects an update above availability without changing the stored quantity', async () => {
    const added = await cartService.addItem('customer-1', {
      productId: 'p1',
      quantity: 2,
      expectedVersion: 0,
      idempotencyKey: 'cart-update-stock-setup-001',
    });

    await assert.rejects(
      () => cartService.updateItem('customer-1', added.items[0].id, {
        quantity: 6,
        expectedVersion: added.version,
        idempotencyKey: 'cart-update-too-many-001',
      }),
      (error) => (
        error.statusCode === 409
        && error.errorCode === 'CART_QUANTITY_EXCEEDS_AVAILABLE'
        && error.data.maxOrderableQuantity === 5
      ),
    );

    const current = await cartService.getCart('customer-1');
    assert.equal(current.version, 1);
    assert.equal(current.items[0].quantity, 2);
  });

  it('removes one owned item without affecting another customer cart', async () => {
    const customerOne = await cartService.addItem('customer-1', {
      productId: 'p1',
      quantity: 1,
      expectedVersion: 0,
      idempotencyKey: 'cart-remove-owner-setup-001',
    });
    await cartService.addItem('customer-2', {
      productId: 'p1',
      quantity: 2,
      expectedVersion: 0,
      idempotencyKey: 'cart-remove-other-setup-001',
    });

    const result = await cartService.removeItem('customer-1', customerOne.items[0].id, {
      expectedVersion: customerOne.version,
      idempotencyKey: 'cart-remove-owned-001',
    });

    assert.equal(result.version, 2);
    assert.deepEqual(result.items, []);
    assert.equal((await cartService.getCart('customer-2')).items[0].quantity, 2);
  });

  it('returns only the authenticated customer cart on read', async () => {
    await cartService.addItem('customer-1', {
      productId: 'p1',
      quantity: 3,
      expectedVersion: 0,
      idempotencyKey: 'cart-read-owner-001',
    });

    const otherCustomerCart = await cartService.getCart('customer-2');

    assert.equal(otherCustomerCart.id, null);
    assert.deepEqual(otherCustomerCart.items, []);
    assert.equal(otherCustomerCart.totalAmount, 0);
  });

  it('rejects updating a cart item outside the customer active cart', async () => {
    const cartRepository = createCartRepository();
    const otherCart = await cartRepository.createCart('customer-2');
    const otherItem = await cartRepository.addItem({
      cartId: otherCart._id,
      productId: 'p1',
      productName: 'Green Pan',
      quantity: 1,
      unitPrice: 25,
    });
    cartService = createCartService({
      productRepository: createProductRepository(),
      cartRepository,
    });

    await assert.rejects(
      () => cartService.updateItem('customer-1', otherItem._id, {
        quantity: 2,
        expectedVersion: 0,
        idempotencyKey: 'cart-update-foreign-001',
      }),
      (error) => error.statusCode === 404 && error.errorCode === 'CART_ITEM_NOT_FOUND',
    );
    assert.equal((await cartService.getCart('customer-2')).items[0].quantity, 1);
  });

  it('rejects removing a cart item outside the customer active cart', async () => {
    const cartRepository = createCartRepository();
    const customerCart = await cartRepository.createCart('customer-1');
    const otherCart = await cartRepository.createCart('customer-2');
    await cartRepository.addItem({
      cartId: customerCart._id,
      productId: 'p1',
      productName: 'Green Pan',
      quantity: 1,
      unitPrice: 25,
    });
    const otherItem = await cartRepository.addItem({
      cartId: otherCart._id,
      productId: 'p1',
      productName: 'Green Pan',
      quantity: 1,
      unitPrice: 25,
    });
    cartService = createCartService({
      productRepository: createProductRepository(),
      cartRepository,
    });

    await assert.rejects(
      () => cartService.removeItem('customer-1', otherItem._id, {
        expectedVersion: 0,
        idempotencyKey: 'cart-remove-001',
      }),
      /Cart item not found/
    );
  });

  it('returns the current cart after an active-cart unique conflict', async () => {
    const cartRepository = createCartRepository();
    const originalCreate = cartRepository.createCart.bind(cartRepository);
    let firstCreate = true;
    cartRepository.createCart = async (customerId) => {
      if (firstCreate) {
        firstCreate = false;
        await originalCreate(customerId);
        const error = new Error('duplicate active cart');
        error.code = 11000;
        throw error;
      }
      return originalCreate(customerId);
    };
    cartService = createCartService({ productRepository: createProductRepository(), cartRepository });

    await assert.rejects(
      () => cartService.addItem('customer-1', {
        productId: 'p1',
        quantity: 1,
        expectedVersion: 0,
        idempotencyKey: 'cart-concurrent-001',
      }),
      (error) => {
        assert.equal(error.errorCode, 'CART_VERSION_CONFLICT');
        assert.equal(error.data.cart.id, 'cart-1');
        return true;
      },
    );
    assert.equal(cartRepository.carts.length, 1);
  });
});
