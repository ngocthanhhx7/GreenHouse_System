const ApiError = require('../utils/apiError');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const { createModelTransactionManager } = require('./productPersistence');
const { logAudit } = require('../utils/auditLogger');
const {
  collapseWhitespace,
  normalizeCategoryIdentity,
} = require('../utils/catalogNormalization');

function normalizeStatus(status, { required = false } = {}) {
  const normalized = String(status || '').trim();
  if (required && !normalized) {
    throw new ApiError(
      400,
      'Category status is required',
      [{ field: 'status', message: 'Select Active or Inactive' }],
      'CATEGORY_STATUS_REQUIRED',
    );
  }
  if (!['Active', 'Inactive'].includes(normalized)) {
    throw new ApiError(
      400,
      'Category status is invalid',
      [{ field: 'status', message: 'Status must be Active or Inactive' }],
      'CATEGORY_STATUS_INVALID',
    );
  }
  return normalized;
}

function toPlainCategory(category) {
  return {
    id: String(category._id),
    name: category.name,
    description: category.description || '',
    status: category.status,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
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
    isModelRepository: true,
    async list(session) {
      const query = Category.find({}).sort({ name: 1 });
      if (session) query.session(session);
      return query.lean();
    },
    async findByNormalizedName(normalizedName, session) {
      const query = Category.findOne({ normalizedName });
      if (session) query.session(session);
      return query.lean();
    },
    async findById(id, session) {
      const query = Category.findById(id);
      if (session) query.session(session);
      return query.lean();
    },
    async create(data) {
      return Category.create(data);
    },
    async updateById(id, data, session) {
      const query = Category.findByIdAndUpdate(id, data, { new: true, runValidators: true });
      if (session) query.session(session);
      return query.lean();
    },
    async deactivateIfUnchangedAndEmpty(id, data, expectedVersion, session) {
      const query = Category.findOneAndUpdate(
        { _id: id, status: 'Active', ...versionFilter(expectedVersion) },
        { $set: data, $inc: { catalogVersion: 1 } },
        { new: true, runValidators: true },
      );
      if (session) query.session(session);
      return query.lean();
    },
  };
}

function createModelProductRepository() {
  return {
    async listActiveByCategory(categoryId, session) {
      const query = Product.find({ categoryId, status: 'Active' }).select('_id name sku').sort({ _id: 1 });
      if (session) query.session(session);
      return query.lean();
    },
  };
}

function createCategoryService({
  categoryRepository = createModelCategoryRepository(),
  productRepository = createModelProductRepository(),
  auditLogger = { log: logAudit },
  transactionManager = null,
} = {}) {
  if (!transactionManager && categoryRepository?.isModelRepository) {
    transactionManager = createModelTransactionManager();
  }

  async function listActiveProducts(categoryId, session = null) {
    return productRepository?.listActiveByCategory
      ? productRepository.listActiveByCategory(categoryId, session)
      : [];
  }

  function activeProductsConflict(activeProducts) {
    return new ApiError(
      409,
      'Category cannot be deactivated while Active Products reference it',
      [{ field: 'status', message: 'Reassign or deactivate every Active Product first' }],
      'CATEGORY_ACTIVE_PRODUCTS',
      {
        activeProductIds: activeProducts.map((product) => String(product._id)),
        activeProducts: activeProducts.map((product) => ({
          id: String(product._id),
          name: product.name || '',
          sku: product.sku || '',
        })),
      },
    );
  }

  async function findDuplicate(name, excludeId = null, session = null) {
    const normalizedName = normalizeCategoryIdentity(name);
    let existing;
    if (categoryRepository.findByNormalizedName) {
      existing = await categoryRepository.findByNormalizedName(normalizedName, session);
    } else {
      const categories = categoryRepository.list ? await categoryRepository.list(session) : [];
      existing = categories.find(
        (category) => normalizeCategoryIdentity(category.name) === normalizedName,
      ) || null;
    }
    if (existing && String(existing._id) !== String(excludeId || '')) {
      throw new ApiError(
        409,
        'Category name already exists',
        [{ field: 'name', message: 'Category name conflicts after Unicode, case, and whitespace normalization' }],
        'CATEGORY_NAME_CONFLICT',
      );
    }
    return normalizedName;
  }

  return {
    async listPublicCategories() {
      const categories = await categoryRepository.list();
      return categories.filter((category) => category.status === 'Active').map(toPlainCategory);
    },

    async listAdminCategories() {
      const categories = await categoryRepository.list();
      return categories.map(toPlainCategory);
    },

    async createCategory(input, actor = {}) {
      const name = collapseWhitespace(input.name);
      if (!name) throw new ApiError(400, 'Category name is required');
      const status = normalizeStatus(input.status, { required: true });
      const normalizedName = await findDuplicate(name);

      let category;
      try {
        category = await categoryRepository.create({
          name,
          normalizedName,
          description: collapseWhitespace(input.description),
          status,
        });
      } catch (error) {
        if (error?.code === 11000) {
          throw new ApiError(
            409,
            'Category name already exists',
            [{ field: 'name', message: 'Category name already exists' }],
            'CATEGORY_NAME_CONFLICT',
          );
        }
        throw error;
      }

      await auditLogger.log({
        userId: actor.id,
        action: 'CATEGORY_CREATE',
        targetEntity: 'Category',
        targetId: String(category._id),
        description: `Category created: ${name}`,
      });

      return toPlainCategory(category);
    },

    async updateCategory(id, input, actor = {}) {
      const work = async (session) => {
      const existing = categoryRepository.findById
        ? await categoryRepository.findById(id, session)
        : null;
      if (!existing) throw new ApiError(404, 'Category not found');

      const data = {};
      if (input.name !== undefined) {
        data.name = collapseWhitespace(input.name);
        if (!data.name) {
          throw new ApiError(
            400,
            'Category name is required',
            [{ field: 'name', message: 'Category name is required' }],
            'CATEGORY_NAME_REQUIRED',
          );
        }
        data.normalizedName = await findDuplicate(data.name, id, session);
      }
      if (input.description !== undefined) data.description = collapseWhitespace(input.description);
      if (input.status !== undefined) {
        data.status = normalizeStatus(input.status);
        if (existing.status === 'Active' && data.status === 'Inactive') {
          const activeProducts = await listActiveProducts(id, session);
          if (activeProducts.length) {
            throw activeProductsConflict(activeProducts);
          }
        }
      }

      let category;
      try {
        const deactivating = existing.status === 'Active' && data.status === 'Inactive';
        if (deactivating && categoryRepository.deactivateIfUnchangedAndEmpty) {
          category = await categoryRepository.deactivateIfUnchangedAndEmpty(
            id,
            data,
            existing.catalogVersion,
            session,
          );
          if (!category) {
            const activeProducts = await listActiveProducts(id, session);
            if (activeProducts.length) throw activeProductsConflict(activeProducts);
            throw new ApiError(
              409,
              'Category lifecycle changed concurrently; retry the command',
              [{ field: 'status', message: 'Category lifecycle changed concurrently' }],
              'CATEGORY_LIFECYCLE_CONFLICT',
            );
          }
        } else {
          category = await categoryRepository.updateById(id, data, session);
        }
      } catch (error) {
        if (error?.code === 11000) {
          throw new ApiError(
            409,
            'Category name already exists',
            [{ field: 'name', message: 'Category name already exists' }],
            'CATEGORY_NAME_CONFLICT',
          );
        }
        throw error;
      }
      if (!category) throw new ApiError(404, 'Category not found');

      await auditLogger.log({
        userId: actor.id,
        action: 'CATEGORY_UPDATE',
        targetEntity: 'Category',
        targetId: String(id),
        description: `Category updated: ${category.name}`,
      }, session);

      return toPlainCategory(category);
      };

      return transactionManager
        ? transactionManager.withTransaction(work)
        : work(null);
    },
  };
}

module.exports = {
  createCategoryService,
  categoryService: createCategoryService(),
};
