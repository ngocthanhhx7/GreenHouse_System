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
      stockQuantity: 5,
      availableQuantity: 5,
      updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    },
    { _id: 'p2', name: 'Hidden Plate', price: 10, status: 'Inactive', stockQuantity: 5, availableQuantity: 5 },
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
      const cart = { _id: `cart-${carts.length + 1}`, customerId, status: 'Active' };
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
    const result = await cartService.addItem('customer-1', { productId: 'p1', quantity: 2 });

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
    await cartService.addItem('customer-1', { productId: 'p1', quantity: 2 });
    const result = await cartService.addItem('customer-1', { productId: 'p1', quantity: 1 });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].quantity, 3);
    assert.equal(result.totalAmount, 75);
  });

  it('rejects quantity greater than stock', async () => {
    await assert.rejects(
      () => cartService.addItem('customer-1', { productId: 'p1', quantity: 6 }),
      /exceeds available stock/
    );
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
      () => cartService.removeItem('customer-1', otherItem._id),
      /Cart item not found/
    );
  });

  it('reuses the cart created by a concurrent request after an active-cart unique conflict', async () => {
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

    const result = await cartService.getCart('customer-1');
    assert.equal(result.id, 'cart-1');
    assert.equal(cartRepository.carts.length, 1);
  });
});
