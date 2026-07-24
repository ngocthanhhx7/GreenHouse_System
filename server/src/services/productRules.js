const ApiError = require('../utils/apiError');
const { canonicalizeSku } = require('../utils/sku');
const {
  buildProductSearchText,
  collapseWhitespace,
} = require('../utils/catalogNormalization');

const MANAGED_PRODUCT_IMAGE = /^\/uploads\/products\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

function normalizeCurrency(currency) {
  const normalized = String(currency ?? 'VND').trim().toUpperCase() || 'VND';
  if (normalized !== 'VND') {
    throw new ApiError(
      400,
      'Product currency must be VND',
      [{ field: 'currency', message: 'Only VND is supported' }],
      'PRODUCT_CURRENCY_INVALID',
    );
  }
  return normalized;
}

function nextPriceVersion(current, now = new Date()) {
  const currentTime = current ? new Date(current).getTime() : 0;
  const nowTime = new Date(now).getTime();
  return new Date(Math.max(Number.isFinite(currentTime) ? currentTime + 1 : 0, nowTime));
}

function isDuplicateSkuError(error) {
  return Boolean(
    error?.code === 11000
      && (
        error.keyPattern?.sku
        || error.keyPattern?.skuAliases
        || error.keyValue?.sku !== undefined
        || error.keyValue?.skuAliases !== undefined
        || /(?:^|[._])sku(?:Aliases)?(?:_|$)/i.test(error.message || '')
      ),
  );
}

function rethrowProductRepositoryError(error) {
  if (isDuplicateSkuError(error)) {
    throw new ApiError(
      409,
      'Product SKU already exists or was previously used',
      [{ field: 'sku', message: 'Current and former SKUs cannot be reused' }],
      'PRODUCT_SKU_CONFLICT',
    );
  }
  throw error;
}

function validateManagedImages(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 1 || imageUrls.length > 5) {
    throw new ApiError(
      400,
      'Product must have between 1 and 5 managed images',
      [{ field: 'imageUrls', message: 'Upload between 1 and 5 images' }],
      'PRODUCT_MEDIA_INVALID',
    );
  }
  const unique = [...new Set(imageUrls.map((url) => String(url || '').trim()))];
  if (unique.length !== imageUrls.length || unique.some((url) => !MANAGED_PRODUCT_IMAGE.test(url))) {
    throw new ApiError(
      400,
      'Product media must use unique system-managed image URLs',
      [{ field: 'imageUrls', message: 'Arbitrary, duplicate, or unmanaged image URLs are not accepted' }],
      'PRODUCT_MEDIA_INVALID',
    );
  }
  return unique;
}

function assertNoProductStockInput(input) {
  const stockFields = [
    'stockQuantity',
    'sellableQuantity',
    'reservedQuantity',
    'quarantinedQuantity',
    'damagedQuantity',
    'availableQuantity',
  ];
  const submittedStockField = stockFields.find((field) => input[field] !== undefined);
  if (submittedStockField) {
    throw new ApiError(
      400,
      'Product stock quantity is managed by Inventory',
      [{ field: submittedStockField, message: 'Use the authorized SL-005 Inventory workflow' }],
      'PRODUCT_STOCK_AUTHORITY_VIOLATION',
    );
  }
}

function validateProductInput(input) {
  assertNoProductStockInput(input);
  const name = collapseWhitespace(input.name);
  const sku = canonicalizeSku(input.sku);
  const description = String(input.description || '').trim();
  const unit = collapseWhitespace(input.unit);
  const price = Number(input.price);
  const errors = [];
  if (!name) errors.push({ field: 'name', message: 'Product name is required' });
  if (!sku) errors.push({ field: 'sku', message: 'Canonical Product SKU is required' });
  if (!description) errors.push({ field: 'description', message: 'Plain-text description is required' });
  if (/<[^>]+>/u.test(description)) {
    errors.push({ field: 'description', message: 'Description must be plain text' });
  }
  if (!unit) errors.push({ field: 'unit', message: 'Product unit is required' });
  if (!input.categoryId) errors.push({ field: 'categoryId', message: 'Product category is required' });
  if (!Number.isInteger(price) || price <= 0) {
    errors.push({ field: 'price', message: 'Price must be a positive integer VND amount' });
  }
  if (errors.length) {
    throw new ApiError(400, 'Product data is invalid', errors, 'PRODUCT_VALIDATION_FAILED');
  }
  return {
    name,
    sku,
    description,
    unit,
    price,
    imageUrls: validateManagedImages(input.imageUrls),
    searchTextNormalized: buildProductSearchText({ name, sku, description }),
  };
}

module.exports = {
  assertNoProductStockInput,
  nextPriceVersion,
  normalizeCurrency,
  rethrowProductRepositoryError,
  validateManagedImages,
  validateProductInput,
};
