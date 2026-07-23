const ApiError = require('../utils/apiError');
const Product = require('../models/product.model');
const Cart = require('../models/cart.model');
const CartItem = require('../models/cartItem.model');

function toCartResponse(cart, items) {
  const mappedItems = items.map((item) => ({
    id: String(item._id),
    productId: String(item.productId && item.productId._id ? item.productId._id : item.productId),
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    priceVersion: item.priceVersion ? new Date(item.priceVersion).toISOString() : '',
    subtotal: item.quantity * item.unitPrice,
  }));
  return {
    id: String(cart._id),
    customerId: String(cart.customerId),
    status: cart.status,
    items: mappedItems,
    totalAmount: mappedItems.reduce((sum, item) => sum + item.subtotal, 0),
  };
}

function createModelProductRepository() {
  return {
    async findSellableById(id) {
      return Product.findOne({ _id: id, status: 'Active' }).lean();
    },
  };
}

function createModelCartRepository() {
  return {
    async findActiveByCustomer(customerId) {
      return Cart.findOne({ customerId, status: 'Active' }).lean();
    },
    async createCart(customerId) {
      return Cart.create({ customerId, status: 'Active' });
    },
    async findItem(cartId, productId) {
      return CartItem.findOne({ cartId, productId }).lean();
    },
    async addItem(data) {
      return CartItem.create(data);
    },
    async updateItem(id, data) {
      return CartItem.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
    async removeItem(id) {
      return CartItem.findByIdAndDelete(id).lean();
    },
    async listItems(cartId) {
      return CartItem.find({ cartId }).lean();
    },
  };
}

function createCartService({
  productRepository = createModelProductRepository(),
  cartRepository = createModelCartRepository(),
} = {}) {
  async function getOrCreateCart(customerId) {
    const existing = await cartRepository.findActiveByCustomer(customerId);
    if (existing) return existing;
    try {
      return await cartRepository.createCart(customerId);
    } catch (error) {
      // The partial unique index is the final concurrency guard for active carts.
      if (error && error.code === 11000) {
        const concurrentCart = await cartRepository.findActiveByCustomer(customerId);
        if (concurrentCart) return concurrentCart;
      }
      throw error;
    }
  }

  async function assertQuantity(product, quantity) {
    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
      throw new ApiError(400, 'Quantity must be a positive integer');
    }
    if (product.stockQuantity !== undefined && Number(quantity) > Number(product.stockQuantity)) {
      throw new ApiError(400, 'Requested quantity exceeds available stock');
    }
  }

  async function refreshPriceEvidence(items) {
    const refreshed = [];
    for (const item of items) {
      const product = await productRepository.findSellableById(item.productId);
      if (!product) {
        refreshed.push(item);
        continue;
      }
      const priceVersion = product.updatedAt ? new Date(product.updatedAt) : null;
      const currentVersion = item.priceVersion ? new Date(item.priceVersion).toISOString() : '';
      const nextVersion = priceVersion ? priceVersion.toISOString() : '';
      const priceChanged = Number(item.unitPrice) !== Number(product.price);
      const nameChanged = item.productName !== product.name;
      const versionChanged = currentVersion !== nextVersion;
      if (priceChanged || nameChanged || versionChanged) {
        const updated = await cartRepository.updateItem(item._id, {
          productName: product.name,
          unitPrice: product.price,
          priceVersion,
        });
        refreshed.push(updated);
      } else {
        refreshed.push(item);
      }
    }
    return refreshed;
  }

  return {
    async getCart(customerId) {
      const cart = await getOrCreateCart(customerId);
      const items = await refreshPriceEvidence(await cartRepository.listItems(cart._id));
      return toCartResponse(cart, items);
    },

    async addItem(customerId, input) {
      const quantity = Number(input.quantity);
      const product = await productRepository.findSellableById(input.productId);
      if (!product) throw new ApiError(404, 'Product not found or inactive');
      await assertQuantity(product, quantity);

      const cart = await getOrCreateCart(customerId);
      const existing = await cartRepository.findItem(cart._id, input.productId);
      if (existing) {
        const nextQuantity = Number(existing.quantity) + quantity;
        await assertQuantity(product, nextQuantity);
        await cartRepository.updateItem(existing._id, {
          quantity: nextQuantity,
          unitPrice: product.price,
          productName: product.name,
          priceVersion: product.updatedAt,
        });
      } else {
        await cartRepository.addItem({
          cartId: cart._id,
          productId: input.productId,
          productName: product.name,
          quantity,
          unitPrice: product.price,
          priceVersion: product.updatedAt,
        });
      }

      const items = await cartRepository.listItems(cart._id);
      return toCartResponse(cart, items);
    },

    async updateItem(customerId, itemId, input) {
      const cart = await getOrCreateCart(customerId);
      const items = await cartRepository.listItems(cart._id);
      const item = items.find((entry) => String(entry._id) === String(itemId));
      if (!item) throw new ApiError(404, 'Cart item not found');
      const product = await productRepository.findSellableById(item.productId);
      if (!product) throw new ApiError(404, 'Product not found or inactive');
      await assertQuantity(product, Number(input.quantity));
      await cartRepository.updateItem(itemId, {
        quantity: Number(input.quantity),
        unitPrice: product.price,
        productName: product.name,
        priceVersion: product.updatedAt,
      });
      return toCartResponse(cart, await cartRepository.listItems(cart._id));
    },

    async removeItem(customerId, itemId) {
      const cart = await getOrCreateCart(customerId);
      const items = await cartRepository.listItems(cart._id);
      const item = items.find((entry) => String(entry._id) === String(itemId));
      if (!item) throw new ApiError(404, 'Cart item not found');
      await cartRepository.removeItem(itemId);
      return toCartResponse(cart, await cartRepository.listItems(cart._id));
    },
  };
}

module.exports = {
  createCartService,
  cartService: createCartService(),
};
