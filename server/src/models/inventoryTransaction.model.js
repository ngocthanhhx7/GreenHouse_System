const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    relatedCollection: {
      type: String,
      enum: ['', 'Inventory', 'StockExportRequest', 'ReplenishmentRequest', 'DamageReport'],
      default: '',
      trim: true,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    transactionType: {
      type: String,
      enum: ['ADJUSTMENT', 'STOCK_EXPORT', 'REPLENISHMENT_RECEIVE', 'DAMAGE_CONFIRMED'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: 'quantity must be an integer' },
    },
    beforeQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'beforeQuantity must be a non-negative integer' },
    },
    afterQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'afterQuantity must be a non-negative integer' },
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

inventoryTransactionSchema.index({ productId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ orderId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ relatedCollection: 1, relatedId: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
