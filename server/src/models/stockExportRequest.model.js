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
  },
  { timestamps: true }
);

stockExportRequestSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('StockExportRequest', stockExportRequestSchema);
