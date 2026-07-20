const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema(
  {
    returnRefundRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRefundRequest', required: true },
    orderDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderDetail', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    requestedQuantity: { type: Number, required: true, min: 1 },
    receivedQuantity: { type: Number, required: true, min: 0 },
    sellableQuantity: { type: Number, required: true, min: 0 },
    damagedQuantity: { type: Number, required: true, min: 0 },
    evidenceImages: { type: [String], default: [] },
    warehouseNote: { type: String, default: '', trim: true },
    inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    inspectedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

returnItemSchema.index({ returnRefundRequestId: 1, orderDetailId: 1 }, { unique: true });

module.exports = mongoose.model('ReturnItem', returnItemSchema);
