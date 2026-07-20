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
    reservedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: { validator(value) { return Number.isInteger(value) && value <= this.stockQuantity; }, message: 'reservedQuantity cannot exceed stockQuantity and must be a non-negative integer' },
    },
    damagedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: { validator: Number.isInteger, message: 'damagedQuantity must be a non-negative integer' },
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

inventorySchema.pre('validate', function validateInventoryInvariant(next) {
  const fields = ['stockQuantity', 'reservedQuantity', 'damagedQuantity', 'lowStockThreshold'];
  for (const field of fields) {
    if (!Number.isInteger(this[field]) || this[field] < 0) {
      this.invalidate(field, `${field} must be a non-negative integer`);
    }
  }
  if (Number(this.reservedQuantity) > Number(this.stockQuantity)) {
    this.invalidate('reservedQuantity', 'reservedQuantity cannot exceed stockQuantity');
  }
  next();
});

module.exports = mongoose.model('Inventory', inventorySchema);
