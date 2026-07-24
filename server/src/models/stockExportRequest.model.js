const mongoose = require('mongoose');

const stockExportRequestSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    cycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FulfillmentCycle',
      default: null,
      immutable: true,
    },
    requestKind: {
      type: String,
      enum: ['Initial', 'Resend'],
      default: 'Initial',
      immutable: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled'],
      default: 'Pending',
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    processingCommandKey: {
      type: String,
      default: '',
      trim: true,
      maxlength: 160,
    },
    completedCommandKey: {
      type: String,
      default: '',
      trim: true,
      maxlength: 160,
    },
    failureCode: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    failureReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Read-compatible timestamp during the SL-004 migration window.
    exportedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

stockExportRequestSchema.index({ orderId: 1, status: 1 });
stockExportRequestSchema.index(
  { orderId: 1, requestKind: 1 },
  {
    unique: true,
    partialFilterExpression: { requestKind: 'Initial' },
    name: 'stock_export_one_initial_per_order',
  }
);
stockExportRequestSchema.index(
  { cycleId: 1 },
  {
    unique: true,
    partialFilterExpression: { cycleId: { $type: 'objectId' } },
    name: 'stock_export_one_request_per_cycle',
  }
);
stockExportRequestSchema.index(
  { processingCommandKey: 1 },
  {
    unique: true,
    partialFilterExpression: { processingCommandKey: { $type: 'string', $gt: '' } },
    name: 'stock_export_processing_command_key_unique',
  }
);

module.exports = mongoose.model('StockExportRequest', stockExportRequestSchema);
