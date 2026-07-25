const mongoose = require('mongoose');

const lowStockAlertSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
    status: { type: String, enum: ['Open', 'Resolved'], default: 'Open' },
    availableQuantity: { type: Number, required: true, min: 0 },
    effectiveThreshold: { type: Number, required: true, min: 0 },
    settingVersion: { type: Number, default: null, min: 0 },
    openedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    lastEvaluatedAt: { type: Date, default: Date.now },
    crossingKey: { type: String, default: '', trim: true, maxlength: 240 },
  },
  { timestamps: true },
);

lowStockAlertSchema.index(
  { productId: 1 },
  { unique: true, partialFilterExpression: { status: 'Open' }, name: 'low_stock_alert_one_open_per_product' },
);
lowStockAlertSchema.index({ inventoryId: 1, status: 1 });

module.exports = mongoose.model('LowStockAlert', lowStockAlertSchema);
