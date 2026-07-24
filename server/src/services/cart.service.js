const crypto = require('node:crypto');

const ApiError = require('../utils/apiError');
const {
  availableQuantityOf,
  categoryIsActive,
  emptyCartProjection,
  inventoryHealthOf,
  reconcileCartProjection,
} = require('./cartProjection');
const {
  createModelCartRepository,
  createModelProductRepository,
  createModelTransactionManager,
} = require('./cartPersistence');

function normalizeCommandInput(input = {}, commandType, itemId = '') {
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new ApiError(
      400,
      'A valid Idempotency-Key is required for Cart commands',
      [{ field: 'idempotencyKey', message: 'Use 8-128 safe characters' }],
      idempotencyKey ? 'CART_IDEMPOTENCY_KEY_INVALID' : 'CART_IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new ApiError(
      400,
      'Expected Cart version is required',
      [{ field: 'expectedVersion', message: 'Expected version must be a non-negative integer' }],
      'CART_EXPECTED_VERSION_INVALID',
    );
  }
  const normalized = {
    commandType,
    idempotencyKey,
    expectedVersion,
    itemId: String(itemId || ''),
    productId: String(input.productId || ''),
  };
  if (commandType !== 'RemoveItem') {
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ApiError(
        400,
        'Quantity must be a positive integer',
        [{ field: 'quantity', message: 'Enter a positive whole number' }],
        'CART_QUANTITY_INVALID',
      );
    }
    normalized.quantity = quantity;
  }
  normalized.requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      commandType,
      expectedVersion,
      itemId: normalized.itemId,
      productId: normalized.productId,
      quantity: normalized.quantity,
    }))
    .digest('hex');
  return normalized;
}

function copyResult(result, commandStatus) {
  return {
    ...JSON.parse(JSON.stringify(result)),
    commandStatus,
  };
}

function createCartService({
  productRepository = createModelProductRepository(),
  cartRepository = createModelCartRepository(),
  transactionManager = null,
} = {}) {
  if (!transactionManager && cartRepository?.isModelRepository) {
    transactionManager = createModelTransactionManager();
  }
  const localCommands = new Map();

  async function findCurrentProduct(productId, session) {
    if (productRepository.findCurrentById) {
      return productRepository.findCurrentById(productId, session);
    }
    if (productRepository.findSellableById) {
      return productRepository.findSellableById(productId, session);
    }
    return null;
  }

  async function projectCart(cart, session) {
    if (!cart) return emptyCartProjection();
    const items = await cartRepository.listItems(cart._id, session);
    const productsById = new Map();
    await Promise.all(items.map(async (item) => {
      const product = await findCurrentProduct(item.productId, session);
      productsById.set(String(item.productId), product);
    }));
    return reconcileCartProjection(cart, items, productsById);
  }

  async function findExistingCommand(customerId, command, session) {
    const local = localCommands.get(`${customerId}:${command.idempotencyKey}`);
    const existing = local || (
      cartRepository.findCommand
        ? await cartRepository.findCommand(customerId, command.idempotencyKey, session)
        : null
    );
    if (!existing) return null;
    if (
      existing.commandType !== command.commandType
      || existing.requestHash !== command.requestHash
    ) {
      throw new ApiError(
        409,
        'Cart Idempotency-Key was already used with different command facts',
        [{ field: 'idempotencyKey', message: 'Use a new key for a different Cart command' }],
        'CART_IDEMPOTENCY_KEY_REUSED',
      );
    }
    return copyResult(existing.resultSnapshot, 'AlreadyProcessed');
  }

  async function throwVersionConflict(cart, session) {
    throw new ApiError(
      409,
      'Cart changed before this command',
      [{ field: 'expectedVersion', message: 'Refresh the Cart and retry intentionally' }],
      'CART_VERSION_CONFLICT',
      { cart: await projectCart(cart, session) },
    );
  }

  async function assertVersion(cart, expectedVersion, session) {
    if (!cart && expectedVersion === 0) return;
    if (cart && Number(cart.version || 0) === expectedVersion) return;
    await throwVersionConflict(cart, session);
  }

  function assertProductEligible(product) {
    if (!product || product.status !== 'Active' || !categoryIsActive(product)) {
      throw new ApiError(
        409,
        'Product or Category is no longer available',
        [{ field: 'productId', message: 'Choose a currently public Product' }],
        'CART_PRODUCT_UNAVAILABLE',
      );
    }
    if (inventoryHealthOf(product) !== 'Normal') {
      throw new ApiError(
        409,
        'Product Inventory is being reconciled',
        [{ field: 'productId', message: 'Try again after Inventory reconciliation' }],
        'CART_INVENTORY_RECONCILIATION',
      );
    }
  }

  function assertQuantityAvailable(product, quantity) {
    const maximum = availableQuantityOf(product);
    if (quantity > maximum) {
      throw new ApiError(
        409,
        'Requested quantity exceeds current availability',
        [{ field: 'quantity', message: `Reduce quantity to ${maximum} or less` }],
        'CART_QUANTITY_EXCEEDS_AVAILABLE',
        { maxOrderableQuantity: maximum },
      );
    }
  }

  async function incrementVersion(cart, expectedVersion, session) {
    if (cartRepository.incrementVersion) {
      const updated = await cartRepository.incrementVersion(
        cart._id,
        expectedVersion,
        session,
      );
      if (!updated) {
        const current = await cartRepository.findActiveByCustomer(cart.customerId, session);
        await throwVersionConflict(current, session);
      }
      return updated;
    }
    cart.version = expectedVersion + 1;
    return cart;
  }

  async function persistCommand(customerId, command, cart, result, session) {
    const record = {
      customerId,
      idempotencyKey: command.idempotencyKey,
      commandType: command.commandType,
      requestHash: command.requestHash,
      cartId: cart._id,
      resultingVersion: result.version,
      resultSnapshot: result,
    };
    if (cartRepository.createCommand) {
      await cartRepository.createCommand(record, session);
    } else {
      localCommands.set(`${customerId}:${command.idempotencyKey}`, record);
    }
  }

  async function execute(customerId, command, session) {
    const replay = await findExistingCommand(customerId, command, session);
    if (replay) return replay;

    let cart = await cartRepository.findActiveByCustomer(customerId, session);
    if (command.commandType === 'AddItem') {
      const product = await findCurrentProduct(command.productId, session);
      assertProductEligible(product);
      await assertVersion(cart, command.expectedVersion, session);
      if (!cart) {
        assertQuantityAvailable(product, command.quantity);
        cart = await cartRepository.createCart(customerId, session);
      }
      const existing = await cartRepository.findItem(
        cart._id,
        command.productId,
        session,
      );
      const nextQuantity = Number(existing?.quantity || 0) + command.quantity;
      assertQuantityAvailable(product, nextQuantity);
      if (existing) {
        await cartRepository.updateItem(existing._id, {
          quantity: nextQuantity,
        }, session);
      } else {
        await cartRepository.addItem({
          cartId: cart._id,
          productId: command.productId,
          productName: product.name,
          quantity: nextQuantity,
          unitPrice: Number(product.price),
          priceVersion: product.priceVersion || product.updatedAt,
        }, session);
      }
    } else {
      await assertVersion(cart, command.expectedVersion, session);
      if (!cart) {
        throw new ApiError(404, 'Cart item not found', [], 'CART_ITEM_NOT_FOUND');
      }
      const items = await cartRepository.listItems(cart._id, session);
      const item = items.find((entry) => String(entry._id) === command.itemId);
      if (!item) {
        throw new ApiError(404, 'Cart item not found', [], 'CART_ITEM_NOT_FOUND');
      }
      if (command.commandType === 'UpdateItem') {
        const product = await findCurrentProduct(item.productId, session);
        assertProductEligible(product);
        assertQuantityAvailable(product, command.quantity);
        await cartRepository.updateItem(item._id, { quantity: command.quantity }, session);
      } else {
        await cartRepository.removeItem(item._id, session);
      }
    }

    cart = await incrementVersion(cart, command.expectedVersion, session);
    const result = {
      ...await projectCart(cart, session),
      commandStatus: 'Applied',
    };
    await persistCommand(customerId, command, cart, result, session);
    return result;
  }

  async function runCommand(customerId, input, commandType, itemId = '') {
    const command = normalizeCommandInput(input, commandType, itemId);
    const replay = await findExistingCommand(customerId, command);
    if (replay) return replay;
    try {
      return transactionManager
        ? await transactionManager.withTransaction(
          (session) => execute(customerId, command, session),
        )
        : await execute(customerId, command, null);
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await findExistingCommand(customerId, command);
        if (duplicate) return duplicate;
        const current = await cartRepository.findActiveByCustomer(customerId);
        if (current) await throwVersionConflict(current, null);
      }
      throw error;
    }
  }

  return {
    async getCart(customerId) {
      const cart = await cartRepository.findActiveByCustomer(customerId);
      return projectCart(cart, null);
    },
    async addItem(customerId, input) {
      return runCommand(customerId, input, 'AddItem');
    },
    async updateItem(customerId, itemId, input) {
      return runCommand(customerId, input, 'UpdateItem', itemId);
    },
    async removeItem(customerId, itemId, input = {}) {
      return runCommand(customerId, input, 'RemoveItem', itemId);
    },
  };
}

module.exports = {
  createCartService,
  cartService: createCartService(),
  normalizeCommandInput,
};
