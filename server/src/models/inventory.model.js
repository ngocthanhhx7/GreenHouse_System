const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      unique: true,
    },
    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: { validator: Number.isInteger, message: 'stockQuantity must be a non-negative integer' },
    },
    // `stockQuantity` is retained as a read-compatible alias for older slices.
    // New writes should use sellableQuantity; the service keeps both values in sync.
    sellableQuantity: {
      type: Number,
      required: true,
      min: 0,
      default() { return Number(this.stockQuantity || 0); },
      validate: { validator: Number.isInteger, message: 'sellableQuantity must be a non-negative integer' },
    },
    reservedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator(value) {
          return Number.isInteger(value)
            && (this.inventoryHealth === 'ReconciliationRequired' || value <= Number(this.sellableQuantity || this.stockQuantity));
        },
        message: 'reservedQuantity cannot exceed stockQuantity and must be a non-negative integer',
      },
    },
    damagedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: { validator: Number.isInteger, message: 'damagedQuantity must be a non-negative integer' },
    },
    quarantinedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: { validator: Number.isInteger, message: 'quarantinedQuantity must be a non-negative integer' },
    },
    inventoryHealth: {
      type: String,
      enum: ['Normal', 'ReconciliationRequired'],
      default: 'Normal',
      index: true,
    },
    affectedOrderIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Order',
      default: [],
    },
    lowStockThresholdOverride: {
      type: Number,
      min: 0,
      default: null,
      validate: { validator(value) { return value === null || (Number.isInteger(value) && value >= 0); }, message: 'lowStockThresholdOverride must be a non-negative integer or null' },
    },
    lowStockThreshold: {
      type: Number,
      required: true,
      min: 0,
      default: 5,
      validate: { validator: Number.isInteger, message: 'lowStockThreshold must be a non-negative integer' },
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

inventorySchema.index({ stockQuantity: 1, lowStockThreshold: 1 });

inventorySchema.virtual('onHandQuantity').get(function onHandQuantity() {
  return Number(this.sellableQuantity ?? this.stockQuantity ?? 0)
    + Number(this.quarantinedQuantity || 0)
    + Number(this.damagedQuantity || 0);
});
inventorySchema.virtual('availableQuantity').get(function availableQuantity() {
  if (this.inventoryHealth === 'ReconciliationRequired') return 0;
  return Math.max(0, Number(this.sellableQuantity ?? this.stockQuantity ?? 0) - Number(this.reservedQuantity || 0));
});
inventorySchema.virtual('effectiveThreshold').get(function effectiveThreshold() {
  return this.lowStockThresholdOverride === null || this.lowStockThresholdOverride === undefined
    ? Number(this.lowStockThreshold || 0)
    : Number(this.lowStockThresholdOverride);
});

inventorySchema.pre('validate', function validateInventoryInvariant(next) {
  // Legacy records may only have stockQuantity; new records use sellableQuantity.
  if (this.isModified('sellableQuantity') && !this.isModified('stockQuantity')) {
    this.stockQuantity = this.sellableQuantity;
  } else if (this.isModified('stockQuantity') && !this.isModified('sellableQuantity')) {
    this.sellableQuantity = this.stockQuantity;
  } else if (this.sellableQuantity === undefined || this.sellableQuantity === null) {
    this.sellableQuantity = Number(this.stockQuantity || 0);
  } else if (this.stockQuantity === undefined || this.stockQuantity === null) {
    this.stockQuantity = Number(this.sellableQuantity || 0);
  }
  const fields = ['stockQuantity', 'sellableQuantity', 'reservedQuantity', 'quarantinedQuantity', 'damagedQuantity', 'lowStockThreshold'];
  for (const field of fields) {
    if (!Number.isInteger(this[field]) || this[field] < 0) {
      this.invalidate(field, `${field} must be a non-negative integer`);
    }
  }
  if (this.inventoryHealth !== 'ReconciliationRequired' && Number(this.reservedQuantity) > Number(this.sellableQuantity)) {
    this.invalidate('reservedQuantity', 'reservedQuantity cannot exceed stockQuantity');
  }
  next();
});

module.exports = mongoose.model('Inventory', inventorySchema);
