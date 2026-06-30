const mongoose = require('mongoose');

const replenishmentRequestSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Received'],
      default: 'Pending',
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    adminNote: {
      type: String,
      default: '',
      trim: true,
    },
    receivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

replenishmentRequestSchema.index({ status: 1, createdAt: -1 });
replenishmentRequestSchema.index({ productId: 1, status: 1 });

module.exports = mongoose.model('ReplenishmentRequest', replenishmentRequestSchema);
