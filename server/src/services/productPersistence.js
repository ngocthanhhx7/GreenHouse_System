const mongoose = require('mongoose');

const ApiError = require('../utils/apiError');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const OrderDetail = require('../models/orderDetail.model');
const ProductReview = require('../models/productReview.model');
const ProductMediaAsset = require('../models/productMediaAsset.model');
const ProductCommand = require('../models/productCommand.model');

function createModelProductRepository() {
  return {
    isPersistent: true,
    isModelRepository: true,
    async list() {
      return Product.find({}).populate('categoryId').sort({ createdAt: -1, _id: 1 }).lean();
    },
    async listPublicCandidates(filters) {
      const activeCategories = await Category.find({ status: 'Active' }).select('_id').lean();
      const activeCategoryIds = activeCategories.map((category) => category._id);
      const mongoQuery = {
        status: 'Active',
        categoryId: filters.categoryId
          ? filters.categoryId
          : { $in: activeCategoryIds },
      };
      if (filters.categoryId && !activeCategoryIds.some(
        (id) => String(id) === String(filters.categoryId),
      )) {
        return [];
      }
      if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        mongoQuery.price = {};
        if (filters.minPrice !== undefined) mongoQuery.price.$gte = filters.minPrice;
        if (filters.maxPrice !== undefined) mongoQuery.price.$lte = filters.maxPrice;
      }
      if (filters.keyword) {
        mongoQuery.$and = filters.keyword.split(' ').filter(Boolean).map((token) => ({
          searchTextNormalized: {
            $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          },
        }));
      }
      const sort = filters.sort === 'name'
        ? { name: 1, _id: 1 }
        : filters.sort === 'priceAsc'
          ? { price: 1, _id: 1 }
          : filters.sort === 'priceDesc'
            ? { price: -1, _id: 1 }
            : { createdAt: -1, _id: 1 };
      return Product.find(mongoQuery).populate('categoryId').sort(sort).lean();
    },
    async create(data, session) {
      const [created] = await Product.create([data], session ? { session } : undefined);
      const query = Product.findById(created._id).populate('categoryId');
      if (session) query.session(session);
      return query.lean();
    },
    async deleteById(id, session) {
      return Product.deleteOne({ _id: id }, session ? { session } : undefined);
    },
    async findById(id, session) {
      const query = Product.findById(id).populate('categoryId');
      if (session) query.session(session);
      return query.lean();
    },
    async findBySkuAlias(sku, excludeId, session) {
      const query = Product.findOne({
        _id: { $ne: excludeId },
        $or: [{ sku }, { skuAliases: sku }],
      }).select('_id sku');
      if (session) query.session(session);
      return query.lean();
    },
    async updateById(id, data, session) {
      const query = Product.findByIdAndUpdate(
        id,
        data,
        { new: true, runValidators: true },
      ).populate('categoryId');
      if (session) query.session(session);
      return query.lean();
    },
    async findPublicById(id) {
      return Product.findOne({ _id: id, status: 'Active' }).populate('categoryId').lean();
    },
    async findPublicByIds(ids) {
      return Product.find({ _id: { $in: ids }, status: 'Active' }).populate('categoryId').lean();
    },
    async listNewestPublic(limit) {
      const activeCategoryIds = await Category.find({ status: 'Active' }).distinct('_id');
      return Product.find({
        status: 'Active',
        categoryId: { $in: activeCategoryIds },
      }).populate('categoryId').sort({ createdAt: -1, _id: 1 }).limit(limit).lean();
    },
  };
}

function createModelProductCommandRepository() {
  return {
    async findByAdminAndKey(adminId, idempotencyKey, session) {
      const query = ProductCommand.findOne({ adminId, idempotencyKey });
      if (session) query.session(session);
      return query.lean();
    },
    async create(data, session) {
      const [command] = await ProductCommand.create(
        [data],
        session ? { session } : undefined,
      );
      return command.toObject();
    },
  };
}

function createModelCategoryRepository() {
  function versionFilter(expectedVersion) {
    const version = Number(expectedVersion || 0);
    return version === 0
      ? { $or: [{ catalogVersion: 0 }, { catalogVersion: { $exists: false } }] }
      : { catalogVersion: version };
  }

  return {
    async findById(id, session) {
      const query = Category.findById(id);
      if (session) query.session(session);
      return query.lean();
    },
    async claimActiveByVersion(id, expectedVersion, session) {
      const query = Category.findOneAndUpdate(
        { _id: id, status: 'Active', ...versionFilter(expectedVersion) },
        { $inc: { catalogVersion: 1 } },
        { new: true, runValidators: true },
      );
      if (session) query.session(session);
      return query.lean();
    },
  };
}

function createModelInventoryRepository() {
  return {
    async create(data, session) {
      const [created] = await Inventory.create([data], session ? { session } : undefined);
      return created;
    },
    async deleteByProductId(productId) {
      return Inventory.deleteOne({ productId });
    },
    async findByProductId(productId, session) {
      const query = Inventory.findOne({ productId });
      if (session) query.session(session);
      return query.lean();
    },
    async findByProductIds(productIds) {
      return Inventory.find({ productId: { $in: productIds } }).lean();
    },
    async countByProductId(productId, session) {
      const query = Inventory.countDocuments({ productId });
      if (session) query.session(session);
      return query;
    },
  };
}

function createModelMediaRepository() {
  return {
    async assertOwnedForAttachment(urls, ownerId, productId = null, session = null) {
      const query = ProductMediaAsset.find({
        url: { $in: urls },
        $or: [
          { status: 'Temporary', ownerId, expiresAt: { $gt: new Date() } },
          ...(productId ? [{ status: { $in: ['Attached', 'Retained'] }, productId }] : []),
        ],
      });
      if (session) query.session(session);
      const assets = await query.lean();
      if (assets.length !== urls.length) {
        throw new ApiError(
          400,
          'Product media is invalid, expired, or belongs to another Admin',
          [{ field: 'imageUrls', message: 'Upload fresh managed images under the current Admin account' }],
          'PRODUCT_MEDIA_INVALID',
        );
      }
      return assets;
    },
    async attach(urls, ownerId, productId, session) {
      await ProductMediaAsset.updateMany(
        { url: { $in: urls }, ownerId, status: 'Temporary', expiresAt: { $gt: new Date() } },
        {
          $set: {
            status: 'Attached',
            productId,
            attachedAt: new Date(),
            expiresAt: null,
          },
        },
        session ? { session } : undefined,
      );
      const countQuery = ProductMediaAsset.countDocuments({
        url: { $in: urls },
        productId,
        status: { $in: ['Attached', 'Retained'] },
      });
      if (session) countQuery.session(session);
      if (Number(await countQuery) !== urls.length) {
        throw new ApiError(
          409,
          'Product media attachment changed concurrently',
          [{ field: 'imageUrls', message: 'Refresh the media list and retry' }],
          'PRODUCT_MEDIA_CONFLICT',
        );
      }
    },
  };
}

function createModelDependencyRepository() {
  return {
    async hasUnitUsage(productId) {
      const [inventoryTransaction, orderDetail] = await Promise.all([
        InventoryTransaction.exists({ productId }),
        OrderDetail.exists({ productId }),
      ]);
      return Boolean(inventoryTransaction || orderDetail);
    },
  };
}

function createModelReviewRepository() {
  return {
    async listActiveByProduct(productId) {
      return ProductReview.find({ productId, status: 'Visible' })
        .select('_id rating content createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .lean();
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
  createModelCategoryRepository,
  createModelDependencyRepository,
  createModelInventoryRepository,
  createModelMediaRepository,
  createModelProductCommandRepository,
  createModelProductRepository,
  createModelReviewRepository,
  createModelTransactionManager,
};
