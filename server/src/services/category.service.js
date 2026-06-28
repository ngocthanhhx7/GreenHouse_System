const ApiError = require('../utils/apiError');
const Category = require('../models/category.model');
const { logAudit } = require('../utils/auditLogger');

function normalizeStatus(status) {
  return status || 'Active';
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
  return {
    async list() {
      return Category.find({}).sort({ name: 1 }).lean();
    },
    async findByName(name) {
      return Category.findOne({ name: new RegExp(`^${name}$`, 'i') }).lean();
    },
    async findById(id) {
      return Category.findById(id).lean();
    },
    async create(data) {
      return Category.create(data);
    },
    async updateById(id, data) {
      return Category.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
  };
}

function createCategoryService({
  categoryRepository = createModelCategoryRepository(),
  auditLogger = { log: logAudit },
} = {}) {
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
      const name = String(input.name || '').trim();
      if (!name) throw new ApiError(400, 'Category name is required');

      const existing = await categoryRepository.findByName(name);
      if (existing) throw new ApiError(400, 'Category name already exists');

      const category = await categoryRepository.create({
        name,
        description: String(input.description || '').trim(),
        status: normalizeStatus(input.status),
      });

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
      const data = {};
      if (input.name !== undefined) data.name = String(input.name).trim();
      if (input.description !== undefined) data.description = String(input.description).trim();
      if (input.status !== undefined) data.status = input.status;

      const category = await categoryRepository.updateById(id, data);
      if (!category) throw new ApiError(404, 'Category not found');

      await auditLogger.log({
        userId: actor.id,
        action: 'CATEGORY_UPDATE',
        targetEntity: 'Category',
        targetId: String(id),
        description: `Category updated: ${category.name}`,
      });

      return toPlainCategory(category);
    },
  };
}

module.exports = {
  createCategoryService,
  categoryService: createCategoryService(),
};
