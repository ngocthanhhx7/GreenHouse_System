const mongoose = require('mongoose');

const Cart = require('../models/cart.model');
const CartItem = require('../models/cartItem.model');
const CartCommand = require('../models/cartCommand.model');
const Product = require('../models/product.model');
const Inventory = require('../models/inventory.model');

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function cartVersionFilter(cartId, expectedVersion) {
  const filter = { _id: cartId, status: 'Active' };
  if (expectedVersion === 0) {
    return {
      ...filter,
      $or: [
        { version: 0 },
        { version: { $exists: false } },
      ],
    };
  }
  return { ...filter, version: expectedVersion };
}

function createModelProductRepository() {
  return {
    async findCurrentById(id, session) {
      const productQuery = Product.findById(id).populate('categoryId');
      const inventoryQuery = Inventory.findOne({ productId: id });
      const [product, inventory] = await Promise.all([
        withOptionalSession(productQuery, session).lean(),
        withOptionalSession(inventoryQuery, session).lean(),
      ]);
      return product ? { ...product, inventory } : null;
    },
  };
}

function createModelCartRepository() {
  return {
    isModelRepository: true,
    async findActiveByCustomer(customerId, session) {
      return withOptionalSession(
        Cart.findOne({ customerId, status: 'Active' }),
        session,
      ).lean();
    },
    async createCart(customerId, session) {
      const [cart] = await Cart.create(
        [{ customerId, status: 'Active', version: 0 }],
        session ? { session } : undefined,
      );
      return cart.toObject();
    },
    async findItem(cartId, productId, session) {
      return withOptionalSession(CartItem.findOne({ cartId, productId }), session).lean();
    },
    async addItem(data, session) {
      const [item] = await CartItem.create([data], session ? { session } : undefined);
      return item.toObject();
    },
    async updateItem(id, data, session) {
      return withOptionalSession(
        CartItem.findByIdAndUpdate(id, data, { new: true, runValidators: true }),
        session,
      ).lean();
    },
    async removeItem(id, session) {
      return withOptionalSession(CartItem.findByIdAndDelete(id), session).lean();
    },
    async listItems(cartId, session) {
      return withOptionalSession(
        CartItem.find({ cartId }).sort({ createdAt: 1, _id: 1 }),
        session,
      ).lean();
    },
    async incrementVersion(cartId, expectedVersion, session) {
      return withOptionalSession(
        Cart.findOneAndUpdate(
          cartVersionFilter(cartId, expectedVersion),
          { $inc: { version: 1 } },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async findCommand(customerId, idempotencyKey, session) {
      return withOptionalSession(
        CartCommand.findOne({ customerId, idempotencyKey }),
        session,
      ).lean();
    },
    async createCommand(data, session) {
      const [command] = await CartCommand.create(
        [data],
        session ? { session } : undefined,
      );
      return command.toObject();
    },
  };
}

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

module.exports = {
  cartVersionFilter,
  createModelCartRepository,
  createModelProductRepository,
  createModelTransactionManager,
};
