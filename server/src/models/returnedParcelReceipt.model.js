const mongoose = require('mongoose');

const returnedParcelItemSchema = new mongoose.Schema(
  {
    orderDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderDetail', required: true, immutable: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
    expectedQuantity: { type: Number, required: true, min: 1, immutable: true },
    receivedQuantity: { type: Number, required: true, min: 0, immutable: true },
    sellableQuantity: { type: Number, required: true, min: 0, immutable: true },
    damagedQuantity: { type: Number, required: true, min: 0, immutable: true },
  },
  { _id: false },
);

const returnedParcelReceiptSchema = new mongoose.Schema(
  {
    receiptKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentCycle', required: true, immutable: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true, immutable: true },
    items: { type: [returnedParcelItemSchema], required: true, immutable: true },
    evidenceReference: { type: String, required: true, trim: true, maxlength: 256, immutable: true },
    receivedAt: { type: Date, required: true, immutable: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { timestamps: true },
);

returnedParcelReceiptSchema.index(
  { shipmentId: 1 },
  { unique: true, name: 'returned_parcel_one_receipt_per_shipment' },
);
returnedParcelReceiptSchema.index(
  { receiptKey: 1 },
  { unique: true, name: 'returned_parcel_receipt_key_unique' },
);
returnedParcelReceiptSchema.index({ orderId: 1, createdAt: 1 });

module.exports = mongoose.model('ReturnedParcelReceipt', returnedParcelReceiptSchema);
