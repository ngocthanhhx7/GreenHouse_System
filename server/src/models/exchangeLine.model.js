const mongoose = require('mongoose');

const integer = {
  type: Number,
  min: 0,
  validate: { validator: Number.isInteger, message: 'quantity must be an integer' },
};

const exchangeLineSchema = new mongoose.Schema(
  {
    exchangeCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeCase', required: true, immutable: true },
    orderDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderDetail', required: true, immutable: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
    productNameSnapshot: { type: String, required: true, trim: true, immutable: true },
    productSkuSnapshot: { type: String, required: true, trim: true, immutable: true },
    productImageSnapshot: { type: String, default: '', trim: true, immutable: true },
    unitSnapshot: { type: String, default: '', trim: true, immutable: true },
    purchasedQuantity: { ...integer, required: true, min: 1, immutable: true },
    requestedQuantity: { ...integer, required: true, min: 1, immutable: true },
    receivedQuantity: { ...integer, default: 0 },
    acceptedSellableQuantity: { ...integer, default: 0 },
    acceptedDamagedQuantity: { ...integer, default: 0 },
    rejectedQuantity: { ...integer, default: 0 },
    inspectionReason: { type: String, default: '', trim: true, maxlength: 1000 },
    rejectionReason: { type: String, default: '', trim: true, maxlength: 1000 },
    rejectionEvidenceImages: { type: [String], default: [] },
  },
  { timestamps: true }
);

exchangeLineSchema.index(
  { exchangeCaseId: 1, orderDetailId: 1 },
  { unique: true, name: 'exchange_line_case_order_detail_unique' }
);

module.exports = mongoose.model('ExchangeLine', exchangeLineSchema);
