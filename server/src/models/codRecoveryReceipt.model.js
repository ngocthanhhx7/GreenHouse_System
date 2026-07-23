const mongoose = require('mongoose');

const recoveryItemSchema = new mongoose.Schema(
  {
    orderDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderDetail', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    expectedQuantity: { type: Number, required: true, min: 1 },
    receivedQuantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const codRecoveryReceiptSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    receiptId: { type: String, required: true, trim: true, maxlength: 160 },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [recoveryItemSchema], required: true },
    evidenceReference: { type: String, required: true, trim: true, maxlength: 256 },
    receivedAt: { type: Date, required: true },
    status: { type: String, enum: ['Complete'], default: 'Complete', required: true },
  },
  { timestamps: true, strict: true }
);

codRecoveryReceiptSchema.index({ orderId: 1 }, { unique: true, name: 'cod_recovery_one_receipt_per_order' });
codRecoveryReceiptSchema.index({ receiptId: 1 }, { unique: true, name: 'cod_recovery_receipt_id' });

module.exports = mongoose.model('CodRecoveryReceipt', codRecoveryReceiptSchema);
