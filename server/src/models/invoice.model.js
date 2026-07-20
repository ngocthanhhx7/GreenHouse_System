const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema(
  {
    orderDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderDetail', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productNameSnapshot: { type: String, required: true, trim: true },
    productSkuSnapshot: { type: String, default: '', trim: true },
    unitSnapshot: { type: String, default: '', trim: true },
    productImageSnapshot: { type: String, default: '', trim: true },
    priceSnapshot: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    invoiceCode: { type: String, required: true, unique: true, trim: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issuedAt: { type: Date, required: true, default: Date.now },
    currency: { type: String, required: true, default: 'VND', trim: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    receiverName: { type: String, default: '', trim: true },
    receiverPhone: { type: String, default: '', trim: true },
    shippingAddress: { type: String, required: true, trim: true },
    items: { type: [invoiceItemSchema], required: true, default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
