const mongoose = require('mongoose');

const stockExportRequestSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Processing', 'Exported', 'Rejected', 'Cancelled'],
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
    exportedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

stockExportRequestSchema.index({ orderId: 1, status: 1 });
stockExportRequestSchema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['Pending', 'Approved', 'Processing'] } },
    name: 'stock_export_one_open_per_order',
  }
);

module.exports = mongoose.model('StockExportRequest', stockExportRequestSchema);
