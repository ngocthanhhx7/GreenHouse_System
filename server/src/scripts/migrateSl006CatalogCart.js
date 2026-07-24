const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Inventory = require('../models/inventory.model');
const Cart = require('../models/cart.model');
const CartItem = require('../models/cartItem.model');
const CartCommand = require('../models/cartCommand.model');
const ProductMediaAsset = require('../models/productMediaAsset.model');
const ProductCommand = require('../models/productCommand.model');
const { canonicalizeSku } = require('../utils/sku');
const {
  buildProductSearchText,
  collapseWhitespace,
  normalizeCategoryIdentity,
} = require('../utils/catalogNormalization');

const MANAGED_PRODUCT_IMAGE = /^\/uploads\/products\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
const SL006_INDEX_MODELS = Object.freeze([
  Product,
  Category,
  ProductMediaAsset,
  Cart,
  CartItem,
  CartCommand,
  ProductCommand,
]);

function normalizeLegacyCategory(category) {
  const name = collapseWhitespace(category.name);
  return {
    name,
    normalizedName: normalizeCategoryIdentity(name),
    status: ['Active', 'Inactive'].includes(category.status)
      ? category.status
      : 'Inactive',
    catalogVersion: Number.isSafeInteger(Number(category.catalogVersion))
      && Number(category.catalogVersion) >= 0
      ? Number(category.catalogVersion)
      : 0,
  };
}

function normalizeLegacyProduct(product, {
  inventoryCount,
  categoryActive,
} = {}) {
  const sku = canonicalizeSku(product.sku);
  const imageUrls = Array.isArray(product.imageUrls)
    ? [...new Set(product.imageUrls.map((url) => String(url || '').trim()).filter(Boolean))]
    : [];
  const price = Number(product.price);
  const priceVersion = new Date(
    product.priceVersion
      || product.updatedAt
      || product.createdAt
      || 0,
  );
  const publicationGuardsPass = Boolean(
    collapseWhitespace(product.name)
      && sku
      && String(product.description || '').trim()
      && collapseWhitespace(product.unit)
      && Number.isInteger(price)
      && price > 0
      && imageUrls.length >= 1
      && imageUrls.length <= 5
      && imageUrls.every((url) => MANAGED_PRODUCT_IMAGE.test(url))
      && categoryActive
      && inventoryCount === 1,
  );
  return {
    name: collapseWhitespace(product.name),
    sku,
    skuAliases: [...new Set([
      ...(product.skuAliases || []),
      ...(product.skuHistory || []).map((entry) => entry.sku),
      sku,
    ].map(canonicalizeSku).filter(Boolean))],
    description: String(product.description || '').trim(),
    imageUrls,
    price,
    priceVersion,
    priceHistory: Array.isArray(product.priceHistory) ? product.priceHistory : [],
    unit: collapseWhitespace(product.unit),
    categoryId: product.categoryId,
    currency: 'VND',
    status: product.status === 'Active' && publicationGuardsPass ? 'Active' : 'Inactive',
    searchTextNormalized: buildProductSearchText(product),
  };
}

function sameValue(left, right) {
  if (left instanceof Date || right instanceof Date) {
    return new Date(left || 0).getTime() === new Date(right || 0).getTime();
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedFields(source, normalized) {
  return Object.fromEntries(
    Object.entries(normalized).filter(([key, value]) => !sameValue(source[key], value)),
  );
}

function createMigrationRepository() {
  return {
    async preflight() {
      const [categories, products, activeCarts, cartItems, inventories] = await Promise.all([
        Category.find({}).lean(),
        Product.find({}).select('+searchTextNormalized').lean(),
        Cart.find({ status: 'Active' }).lean(),
        CartItem.find({}).lean(),
        Inventory.find({}).select('productId').lean(),
      ]);
      const conflicts = [];

      const categoryNames = new Map();
      for (const category of categories) {
        const identity = normalizeCategoryIdentity(category.name);
        const ids = categoryNames.get(identity) || [];
        ids.push(String(category._id));
        categoryNames.set(identity, ids);
      }
      for (const [identity, ids] of categoryNames) {
        if (ids.length > 1) conflicts.push(`Category:${identity}=[${ids.join(',')}]`);
      }

      const skuOwners = new Map();
      for (const product of products) {
        const identities = new Set([
          product.sku,
          ...(product.skuAliases || []),
          ...(product.skuHistory || []).map((entry) => entry.sku),
        ].map(canonicalizeSku).filter(Boolean));
        for (const identity of identities) {
          const ids = skuOwners.get(identity) || [];
          ids.push(String(product._id));
          skuOwners.set(identity, ids);
        }
      }
      for (const [identity, ids] of skuOwners) {
        if (new Set(ids).size > 1) conflicts.push(`ProductSKU:${identity}=[${ids.join(',')}]`);
      }

      const inventoryCounts = new Map();
      for (const inventory of inventories) {
        const id = String(inventory.productId);
        inventoryCounts.set(id, Number(inventoryCounts.get(id) || 0) + 1);
      }
      for (const product of products) {
        const count = Number(inventoryCounts.get(String(product._id)) || 0);
        if (count !== 1) conflicts.push(`ProductInventory:${String(product._id)}=${count}`);
      }

      const activeCartOwners = new Map();
      for (const cart of activeCarts) {
        const owner = String(cart.customerId);
        const ids = activeCartOwners.get(owner) || [];
        ids.push(String(cart._id));
        activeCartOwners.set(owner, ids);
      }
      for (const [owner, ids] of activeCartOwners) {
        if (ids.length > 1) conflicts.push(`ActiveCart:${owner}=[${ids.join(',')}]`);
      }

      const lineIdentities = new Map();
      for (const item of cartItems) {
        const identity = `${String(item.cartId)}:${String(item.productId)}`;
        const ids = lineIdentities.get(identity) || [];
        ids.push(String(item._id));
        lineIdentities.set(identity, ids);
      }
      for (const [identity, ids] of lineIdentities) {
        if (ids.length > 1) conflicts.push(`CartLine:${identity}=[${ids.join(',')}]`);
      }

      if (conflicts.length) {
        throw new Error(`SL-006 migration preflight failed: ${conflicts.join('; ')}`);
      }
    },

    async backfillCategories() {
      const categories = await Category.find({}).lean();
      let modified = 0;
      for (const category of categories) {
        const changes = changedFields(category, normalizeLegacyCategory(category));
        if (!Object.keys(changes).length) continue;
        const result = await Category.updateOne(
          { _id: category._id },
          { $set: changes },
          { timestamps: false },
        );
        modified += Number(result.modifiedCount || 0);
      }
      return modified;
    },

    async backfillProducts() {
      const [products, categories, inventories] = await Promise.all([
        Product.find({}).select('+searchTextNormalized').lean(),
        Category.find({}).lean(),
        Inventory.find({}).select('productId').lean(),
      ]);
      const activeCategories = new Set(
        categories.filter((category) => category.status === 'Active').map(
          (category) => String(category._id),
        ),
      );
      const inventoryCounts = inventories.reduce((map, inventory) => {
        const id = String(inventory.productId);
        map.set(id, Number(map.get(id) || 0) + 1);
        return map;
      }, new Map());
      let modified = 0;
      for (const product of products) {
        const normalized = normalizeLegacyProduct(product, {
          inventoryCount: Number(inventoryCounts.get(String(product._id)) || 0),
          categoryActive: activeCategories.has(String(product.categoryId)),
        });
        const changes = changedFields(product, normalized);
        const update = {};
        const hasLegacyStockQuantity = Object.hasOwn(product, 'stockQuantity');
        if (Object.keys(changes).length) update.$set = changes;
        if (hasLegacyStockQuantity) update.$unset = { stockQuantity: 1 };
        if (!Object.keys(update).length) continue;
        const result = await Product.updateOne(
          { _id: product._id },
          update,
          {
            timestamps: false,
            runValidators: false,
            ...(hasLegacyStockQuantity ? { strict: false } : {}),
          },
        );
        modified += Number(result.modifiedCount || 0);
      }
      return modified;
    },

    async backfillMediaAssets() {
      const products = await Product.find({}).select('_id imageUrls createdAt updatedAt').lean();
      let created = 0;
      for (const product of products) {
        for (const url of product.imageUrls || []) {
          if (!MANAGED_PRODUCT_IMAGE.test(url)) continue;
          const extension = url.split('.').at(-1);
          const mimeType = extension === 'png'
            ? 'image/png'
            : extension === 'webp'
              ? 'image/webp'
              : 'image/jpeg';
          const result = await ProductMediaAsset.updateOne(
            { url },
            {
              $setOnInsert: {
                url,
                ownerId: null,
                originalName: '',
                mimeType,
                size: 0,
                status: 'Retained',
                productId: product._id,
                expiresAt: null,
                attachedAt: product.updatedAt || product.createdAt || new Date(0),
              },
            },
            { upsert: true, timestamps: false },
          );
          created += Number(result.upsertedCount || 0);
        }
      }
      return created;
    },

    async backfillCarts() {
      let modified = 0;
      const carts = await Cart.find({}).lean();
      for (const cart of carts) {
        if (Number.isInteger(cart.version) && cart.version >= 0) continue;
        const result = await Cart.updateOne(
          { _id: cart._id },
          { $set: { version: 0 } },
          { timestamps: false },
        );
        modified += Number(result.modifiedCount || 0);
      }
      const items = await CartItem.find({}).lean();
      for (const item of items) {
        if (item.priceVersion) continue;
        const product = await Product.findById(item.productId)
          .select('priceVersion updatedAt createdAt')
          .lean();
        if (!product) continue;
        const result = await CartItem.updateOne(
          { _id: item._id, priceVersion: { $exists: false } },
          { $set: { priceVersion: product.priceVersion || product.updatedAt || product.createdAt || new Date(0) } },
          { timestamps: false },
        );
        modified += Number(result.modifiedCount || 0);
      }
      return modified;
    },

    async verifyIndexes() {
      await Promise.all(SL006_INDEX_MODELS.map((model) => model.createIndexes()));
      return SL006_INDEX_MODELS.length;
    },
  };
}

async function migrateSl006CatalogCart({
  repository = createMigrationRepository(),
} = {}) {
  await repository.preflight();
  const categoriesBackfilled = await repository.backfillCategories();
  const productsBackfilled = await repository.backfillProducts();
  const mediaAssetsBackfilled = await repository.backfillMediaAssets();
  const cartsBackfilled = await repository.backfillCarts();
  const indexesVerified = await repository.verifyIndexes();
  return {
    categoriesBackfilled,
    productsBackfilled,
    mediaAssetsBackfilled,
    cartsBackfilled,
    businessWrites: categoriesBackfilled
      + productsBackfilled
      + mediaAssetsBackfilled
      + cartsBackfilled,
    indexesVerified,
  };
}

async function runCli({
  loadEnv = () => require('dotenv').config(),
  mongooseClient = mongoose,
  connect = connectDatabase,
  migrate = migrateSl006CatalogCart,
  logger = console,
} = {}) {
  loadEnv();
  mongooseClient.set('autoIndex', false);
  await connect();
  try {
    const result = await migrate();
    logger.log('SL-006 Catalog/Cart migration completed.');
    logger.table([result]);
  } finally {
    await mongooseClient.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('SL-006 Catalog/Cart migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  SL006_INDEX_MODELS,
  createMigrationRepository,
  migrateSl006CatalogCart,
  normalizeLegacyCategory,
  normalizeLegacyProduct,
  runCli,
};
