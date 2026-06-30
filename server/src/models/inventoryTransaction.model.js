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
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    transactionType: {
      type: String,
      enum: ['ADJUSTMENT', 'STOCK_EXPORT', 'REPLENISHMENT_RECEIVE'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    beforeQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    afterQuantity: {
      type: Number,
      required: true,
      min: 0,
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

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
