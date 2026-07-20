const ApiError = require('../utils/apiError');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const { logAudit } = require('../utils/auditLogger');

const DEFAULT_CURRENCY = 'VND';

function normalizeCurrency(currency) {
  const normalized = String(currency ?? DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY;
  if (normalized !== DEFAULT_CURRENCY) throw new ApiError(400, 'Product currency must be VND');
  return normalized;
}

function normalizeSku(sku) {
  return sku === undefined || sku === null ? '' : String(sku).trim();
}

function isDuplicateSkuError(error) {
  return Boolean(
    error?.code === 11000 &&
      (error.keyPattern?.sku || error.keyValue?.sku !== undefined || /(?:^|[._])sku(?:_|$)/i.test(error.message || ''))
  );
}

function rethrowProductRepositoryError(error) {
  if (isDuplicateSkuError(error)) throw new ApiError(400, 'Product SKU already exists');
  throw error;
}

function currencyForOutput(currency) {
  try {
    return normalizeCurrency(currency);
  } catch {
    return DEFAULT_CURRENCY;
  }
}

function getCategoryId(category) {
  return category && category._id ? category._id : category;
}

function hasActivePopulatedCategory(product) {
  return Boolean(product.categoryId && typeof product.categoryId === 'object' && product.categoryId.status === 'Active');
}

function toPlainProduct(product) {
  return {
    id: String(product._id),
    name: product.name,
    sku: normalizeSku(product.sku),
    currency: currencyForOutput(product.currency),
    description: product.description || '',
    imageUrls: product.imageUrls || [],
    price: product.price,
    stockQuantity: product.stockQuantity || 0,
    unit: product.unit,
    categoryId: product.categoryId && product.categoryId._id ? String(product.categoryId._id) : product.categoryId ? String(product.categoryId) : undefined,
    category: product.categoryId && product.categoryId.name ? { id: String(product.categoryId._id), name: product.categoryId.name } : undefined,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function matchesKeyword(product, keyword) {
  if (!keyword) return true;
  const haystack = `${product.name || ''} ${product.description || ''}`.toLowerCase();
  return haystack.includes(String(keyword).trim().toLowerCase());
}

function matchesPrice(product, minPrice, maxPrice) {
  if (minPrice !== undefined && minPrice !== '' && product.price < Number(minPrice)) return false;
  if (maxPrice !== undefined && maxPrice !== '' && product.price > Number(maxPrice)) return false;
  return true;
}

function createModelProductRepository() {
  return {
    async list() {
      return Product.find({}).populate('categoryId').sort({ createdAt: -1 }).lean();
    },
    async create(data) {
      const created = await Product.create(data);
      return Product.findById(created._id).populate('categoryId').lean();
    },
    async findById(id) {
      return Product.findById(id).populate('categoryId').lean();
    },
    async updateById(id, data) {
      return Product.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('categoryId').lean();
    },
    async findPublicById(id) {
      return Product.findOne({ _id: id, status: 'Active' }).populate('categoryId').lean();
    },
  };
}

function createModelCategoryRepository() {
  return {
    async findById(id) {
      return Category.findById(id).lean();
    },
  };
}

function validateProductInput(input) {
  if (!String(input.name || '').trim()) throw new ApiError(400, 'Product name is required');
  if (!input.categoryId) throw new ApiError(400, 'Product category is required');
  if (!input.unit || !String(input.unit).trim()) throw new ApiError(400, 'Product unit is required');
  if (Number(input.price) <= 0) throw new ApiError(400, 'Product price must be greater than 0');
  if (input.stockQuantity !== undefined && Number(input.stockQuantity) < 0) throw new ApiError(400, 'Product stock quantity cannot be negative');
}

function createProductService({
  productRepository = createModelProductRepository(),
  categoryRepository = createModelCategoryRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  async function ensureActiveCategory(categoryId) {
    const category = await categoryRepository.findById(categoryId);
    if (!category) throw new ApiError(400, 'Product category does not exist');
    if (category.status !== 'Active') throw new ApiError(400, 'Product category must be active');
    return category;
  }

  return {
    async listPublicProducts(query = {}) {
      const products = await productRepository.list();
      const items = products
        .filter((product) => product.status === 'Active' && hasActivePopulatedCategory(product))
        .filter((product) => !query.categoryId || String(product.categoryId && product.categoryId._id ? product.categoryId._id : product.categoryId) === String(query.categoryId))
        .filter((product) => matchesKeyword(product, query.keyword))
        .filter((product) => matchesPrice(product, query.minPrice, query.maxPrice))
        .map(toPlainProduct);

      return {
        items,
        total: items.length,
      };
    },

    async getPublicProductById(id) {
      const product = await productRepository.findPublicById(id);
      if (!product || !hasActivePopulatedCategory(product)) throw new ApiError(404, 'Product not found');
      return toPlainProduct(product);
    },

    async listAdminProducts() {
      const products = await productRepository.list();
      return products.map(toPlainProduct);
    },

    async createProduct(input, actor = {}) {
      validateProductInput(input);
      await ensureActiveCategory(input.categoryId);

      let product;
      try {
        product = await productRepository.create({
          name: String(input.name).trim(),
          sku: normalizeSku(input.sku),
          currency: normalizeCurrency(input.currency),
          description: String(input.description || '').trim(),
          imageUrls: Array.isArray(input.imageUrls) ? input.imageUrls : [],
          price: Number(input.price),
          stockQuantity: input.stockQuantity !== undefined ? Number(input.stockQuantity) : 0,
          unit: String(input.unit).trim(),
          categoryId: input.categoryId,
          status: input.status || 'Active',
        });
      } catch (error) {
        rethrowProductRepositoryError(error);
      }

      await auditLogger.log({
        userId: actor.id,
        action: 'PRODUCT_CREATE',
        targetEntity: 'Product',
        targetId: String(product._id),
        description: `Product created: ${product.name}`,
      });

      return toPlainProduct(product);
    },

    async updateProduct(id, input, actor = {}) {
      if (input.price !== undefined && Number(input.price) <= 0) {
        throw new ApiError(400, 'Product price must be greater than 0');
      }
      if (input.stockQuantity !== undefined && Number(input.stockQuantity) < 0) {
        throw new ApiError(400, 'Product stock quantity cannot be negative');
      }

      const existing = await productRepository.findById(id);
      if (!existing) throw new ApiError(404, 'Product not found');

      const effectiveStatus = input.status !== undefined
        ? (typeof input.status === 'string' ? input.status.trim() : input.status)
        : existing.status;
      if (input.categoryId) {
        await ensureActiveCategory(input.categoryId);
      } else if (effectiveStatus === 'Active') {
        await ensureActiveCategory(getCategoryId(existing.categoryId));
      }

      const data = {};
      for (const field of ['name', 'description', 'unit', 'categoryId', 'status']) {
        if (input[field] !== undefined) data[field] = typeof input[field] === 'string' ? input[field].trim() : input[field];
      }
      if (input.sku !== undefined) data.sku = normalizeSku(input.sku);
      if (input.currency !== undefined) data.currency = normalizeCurrency(input.currency);
      if (input.price !== undefined) data.price = Number(input.price);
      if (input.stockQuantity !== undefined) data.stockQuantity = Number(input.stockQuantity);
      if (input.imageUrls !== undefined) data.imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls : [];

      let product;
      try {
        product = await productRepository.updateById(id, data);
      } catch (error) {
        rethrowProductRepositoryError(error);
      }
      if (!product) throw new ApiError(404, 'Product not found');

      await auditLogger.log({
        userId: actor.id,
        action: 'PRODUCT_UPDATE',
        targetEntity: 'Product',
        targetId: String(id),
        description: `Product updated: ${product.name}`,
      });

      return toPlainProduct(product);
    },
  };
}

module.exports = {
  createProductService,
  productService: createProductService(),
};
