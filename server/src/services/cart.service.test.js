const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createCartService } = require('./cart.service');

function createProductRepository() {
  const products = [
    { _id: 'p1', name: 'Green Pan', price: 25, status: 'Active', stockQuantity: 5 },
    { _id: 'p2', name: 'Hidden Plate', price: 10, status: 'Inactive', stockQuantity: 5 },
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
});
