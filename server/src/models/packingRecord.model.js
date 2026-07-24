const mongoose = require('mongoose');

const packingItemSchema = new mongoose.Schema(
  {
    orderDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderDetail', required: true, immutable: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
    expectedQuantity: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: { validator: Number.isInteger, message: 'expectedQuantity must be a positive integer' },
    },
    checkedQuantity: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
      validate: { validator: Number.isInteger, message: 'checkedQuantity must be a non-negative integer' },
    },
    checked: { type: Boolean, required: true, immutable: true },
    discrepancyReason: { type: String, default: '', trim: true, maxlength: 500, immutable: true },
  },
  { _id: false },
);

const packingRecordSchema = new mongoose.Schema(
  {
    commandKey: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentCycle', required: true, immutable: true },
    stockExportRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockExportRequest',
      required: true,
      immutable: true,
    },
    status: { type: String, enum: ['Completed', 'Discrepancy'], required: true, immutable: true },
    items: { type: [packingItemSchema], required: true, immutable: true },
    packedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    packedAt: { type: Date, required: true, immutable: true },
    note: { type: String, default: '', trim: true, maxlength: 1000, immutable: true },
    evidenceReferences: { type: [String], default: [], immutable: true },
  },
  { timestamps: true },
);

packingRecordSchema.index(
  { commandKey: 1 },
  { unique: true, name: 'packing_record_command_key_unique' },
);
packingRecordSchema.index(
  { cycleId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Completed' },
    name: 'packing_record_one_completed_cycle',
  },
);
packingRecordSchema.index({ orderId: 1, createdAt: 1 });

module.exports = mongoose.model('PackingRecord', packingRecordSchema);
