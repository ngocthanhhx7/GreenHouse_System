const mongoose = require('mongoose');
const { canonicalizeSku } = require('../utils/sku');
const { buildProductSearchText } = require('../utils/catalogNormalization');

const MANAGED_PRODUCT_IMAGE = /^\/uploads\/products\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

const skuHistorySchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, set: canonicalizeSku, immutable: true },
    reason: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
    changedAt: { type: Date, required: true, immutable: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
  },
  { _id: false },
);

const priceHistorySchema = new mongoose.Schema(
  {
    oldPrice: { type: Number, required: true, min: 1, immutable: true },
    newPrice: { type: Number, required: true, min: 1, immutable: true },
    version: { type: Date, required: true, immutable: true },
    changedAt: { type: Date, required: true, immutable: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      set: canonicalizeSku,
      validate: {
        validator(value) {
          return Boolean(canonicalizeSku(value));
        },
        message: 'Product SKU is required',
      },
    },
    skuAliases: {
      type: [String],
      default: [],
      set(values) {
        return [...new Set((values || []).map(canonicalizeSku).filter(Boolean))];
      },
    },
    skuHistory: { type: [skuHistorySchema], default: [] },
    currency: {
      type: String,
      enum: ['VND'],
      default: 'VND',
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          return Boolean(String(value || '').trim());
        },
        message: 'Product description is required',
      },
    },
    imageUrls: {
      type: [String],
      default: [],
      validate: [
        {
          validator(values) {
            return Array.isArray(values) && values.length >= 1 && values.length <= 5;
          },
          message: 'Product must have between 1 and 5 images',
        },
        {
          validator(values) {
            return (values || []).every((url) => MANAGED_PRODUCT_IMAGE.test(String(url)));
          },
          message: 'Product images must be managed uploads',
        },
      ],
    },
    price: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Product price must be a positive integer VND amount',
      },
    },
    priceVersion: { type: Date, required: true, default: Date.now },
    priceHistory: { type: [priceHistorySchema], default: [] },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Inactive',
    },
    searchTextNormalized: { type: String, default: '', select: false },
  },
  {
    timestamps: true,
    // Run npm run migrate:product-sku-index before rollout to create/canonicalize indexes.
    autoIndex: false,
  }
);

productSchema.index({ name: 'text', description: 'text' });
productSchema.index(
  { sku: 1 },
  {
    unique: true,
    partialFilterExpression: { sku: { $type: 'string', $gt: '' } },
    name: 'product_sku_unique_v2',
  }
);
productSchema.index(
  { skuAliases: 1 },
  {
    unique: true,
    partialFilterExpression: { skuAliases: { $type: 'string' } },
    name: 'product_sku_alias_unique',
  },
);
productSchema.index({ categoryId: 1, status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ status: 1, categoryId: 1, createdAt: -1, _id: 1 });
productSchema.index({ searchTextNormalized: 1, status: 1 });

productSchema.pre('validate', function normalizeProductIdentity(next) {
  this.sku = canonicalizeSku(this.sku);
  if (this.sku && !this.skuAliases.includes(this.sku)) {
    this.skuAliases = [...this.skuAliases, this.sku];
  }
  this.searchTextNormalized = buildProductSearchText(this);
  next();
});

module.exports = mongoose.model('Product', productSchema);
module.exports.MANAGED_PRODUCT_IMAGE = MANAGED_PRODUCT_IMAGE;
