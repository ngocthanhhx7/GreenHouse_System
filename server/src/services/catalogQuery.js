const ApiError = require('../utils/apiError');
const { canonicalizeSku } = require('../utils/sku');
const {
  buildProductSearchText,
  normalizeSearchText,
} = require('../utils/catalogNormalization');
const { availabilityStatusOf } = require('./inventoryAvailability');

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

function normalizeIsoVersion(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function getCategoryId(category) {
  return category && category._id ? category._id : category;
}

function hasActivePopulatedCategory(product) {
  return Boolean(
    product.categoryId
      && typeof product.categoryId === 'object'
      && product.categoryId.status === 'Active',
  );
}

function categoryProjection(category) {
  if (!category) return undefined;
  return {
    id: String(category._id || category),
    name: category.name || '',
  };
}

function commonProductProjection(product) {
  return {
    id: String(product._id),
    name: product.name,
    sku: canonicalizeSku(product.sku),
    currency: 'VND',
    description: product.description || '',
    imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls : [],
    price: Number(product.price),
    priceVersion: normalizeIsoVersion(product.priceVersion || product.updatedAt),
    unit: product.unit,
    categoryId: product.categoryId
      ? String(product.categoryId._id || product.categoryId)
      : undefined,
    category: categoryProjection(product.categoryId),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function toPublicProduct(product, inventory = null, reviews = undefined) {
  return {
    ...commonProductProjection(product),
    availabilityStatus: availabilityStatusOf(inventory),
    ...(reviews !== undefined
      ? {
        reviews: (reviews || []).map((review) => ({
          id: String(review._id || review.id),
          rating: Number(review.rating),
          comment: review.comment || review.content || '',
          createdAt: review.createdAt,
        })),
      }
      : {}),
  };
}

function toAdminProduct(product, inventory = null) {
  return {
    ...commonProductProjection(product),
    status: product.status,
    availabilityStatus: availabilityStatusOf(inventory),
    inventoryInitialized: Boolean(inventory),
    skuHistory: (product.skuHistory || []).map((entry) => ({
      sku: entry.sku,
      reason: entry.reason,
      changedAt: entry.changedAt,
      changedBy: entry.changedBy ? String(entry.changedBy) : null,
    })),
    priceHistory: (product.priceHistory || []).map((entry) => ({
      oldPrice: Number(entry.oldPrice),
      newPrice: Number(entry.newPrice),
      version: normalizeIsoVersion(entry.version),
      changedAt: entry.changedAt,
      changedBy: entry.changedBy ? String(entry.changedBy) : null,
    })),
  };
}

function normalizePositiveInteger(value, field, { defaultValue, max } = {}) {
  if ((value === undefined || value === '') && defaultValue !== undefined) return defaultValue;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || (max && number > max)) {
    throw new ApiError(
      400,
      'Catalog filters are invalid',
      [{
        field,
        message: max
          ? `${field} must be a positive integer no greater than ${max}`
          : `${field} must be a positive integer`,
      }],
      'CATALOG_FILTER_INVALID',
    );
  }
  return number;
}

function normalizeOptionalPrice(value, field) {
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new ApiError(
      400,
      'Catalog filters are invalid',
      [{ field, message: `${field} must be a non-negative integer VND amount` }],
      'CATALOG_FILTER_INVALID',
    );
  }
  return number;
}

function normalizeCatalogQuery(query = {}) {
  const minPrice = normalizeOptionalPrice(query.minPrice, 'minPrice');
  const maxPrice = normalizeOptionalPrice(query.maxPrice, 'maxPrice');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new ApiError(
      400,
      'Catalog filters are invalid',
      [
        { field: 'minPrice', message: 'Minimum price must not exceed maximum price' },
        { field: 'maxPrice', message: 'Maximum price must not be below minimum price' },
      ],
      'CATALOG_FILTER_INVALID',
    );
  }
  const availability = String(query.availability || '').trim();
  if (availability && !['InStock', 'OutOfStock'].includes(availability)) {
    throw new ApiError(
      400,
      'Catalog filters are invalid',
      [{ field: 'availability', message: 'Availability must be InStock or OutOfStock' }],
      'CATALOG_FILTER_INVALID',
    );
  }
  const sort = String(query.sort || 'newest').trim();
  if (!['newest', 'name', 'priceAsc', 'priceDesc'].includes(sort)) {
    throw new ApiError(
      400,
      'Catalog filters are invalid',
      [{ field: 'sort', message: 'Unsupported catalog sort' }],
      'CATALOG_FILTER_INVALID',
    );
  }
  return {
    keyword: normalizeSearchText(query.keyword),
    categoryId: String(query.categoryId || '').trim(),
    minPrice,
    maxPrice,
    availability,
    page: normalizePositiveInteger(query.page, 'page', { defaultValue: 1 }),
    pageSize: normalizePositiveInteger(query.pageSize ?? query.limit, 'pageSize', {
      defaultValue: DEFAULT_PAGE_SIZE,
      max: MAX_PAGE_SIZE,
    }),
    sort,
  };
}

function compareProducts(sort) {
  return (left, right) => {
    let comparison = 0;
    if (sort === 'name') {
      comparison = String(left.name || '').localeCompare(String(right.name || ''), 'vi');
    } else if (sort === 'priceAsc') {
      comparison = Number(left.price) - Number(right.price);
    } else if (sort === 'priceDesc') {
      comparison = Number(right.price) - Number(left.price);
    } else {
      comparison = new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    }
    return comparison || String(left._id).localeCompare(String(right._id));
  };
}

function matchesNormalizedKeyword(product, keyword) {
  if (!keyword) return true;
  const searchable = buildProductSearchText(product);
  return keyword.split(' ').filter(Boolean).every((token) => searchable.includes(token));
}

module.exports = {
  availabilityStatusOf,
  compareProducts,
  getCategoryId,
  hasActivePopulatedCategory,
  matchesNormalizedKeyword,
  normalizeCatalogQuery,
  normalizeIsoVersion,
  normalizePositiveInteger,
  toAdminProduct,
  toPublicProduct,
};
