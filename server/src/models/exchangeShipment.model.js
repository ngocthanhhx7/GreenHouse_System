const mongoose = require('mongoose');

const exchangeShipmentSchema = new mongoose.Schema(
  {
    shipmentKey: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
    obligationKey: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
    exchangeCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeCase', required: true, immutable: true },
    exchangeLineId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeLine', required: true, immutable: true },
    direction: {
      type: String,
      enum: ['CUSTOMER_TO_WAREHOUSE', 'REPLACEMENT_TO_CUSTOMER', 'REJECTED_ORIGINAL_TO_CUSTOMER'],
      required: true,
      immutable: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'quantity must be a positive integer' },
      immutable: true,
    },
    carrierName: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    trackingCode: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    status: { type: String, enum: ['InTransit', 'Delivered', 'Incident'], default: 'InTransit' },
    shippedAt: { type: Date, required: true, default: Date.now, immutable: true },
    deliveredAt: { type: Date, default: null },
    incidentAt: { type: Date, default: null },
    incidentReason: { type: String, default: '', trim: true, maxlength: 1000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    resendOfShipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExchangeShipment',
      default: null,
      immutable: true,
    },
  },
  { timestamps: true }
);

exchangeShipmentSchema.index(
  { shipmentKey: 1 },
  { unique: true, name: 'exchange_shipment_key_unique' }
);
exchangeShipmentSchema.index(
  { obligationKey: 1 },
  { unique: true, name: 'exchange_shipment_obligation_unique' }
);
exchangeShipmentSchema.index({ exchangeCaseId: 1, status: 1 });
exchangeShipmentSchema.index({ trackingCode: 1 });

module.exports = mongoose.model('ExchangeShipment', exchangeShipmentSchema);
