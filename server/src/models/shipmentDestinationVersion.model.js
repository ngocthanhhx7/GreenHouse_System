const mongoose = require('mongoose');

const shipmentDestinationVersionSchema = new mongoose.Schema(
  {
    versionKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentCycle', required: true, immutable: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', default: null, immutable: true },
    version: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: { validator: Number.isInteger, message: 'version must be a positive integer' },
    },
    receiverName: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    receiverPhone: { type: String, required: true, trim: true, maxlength: 20, immutable: true },
    shippingAddress: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
    confirmationSource: {
      type: String,
      enum: ['CHECKOUT_SNAPSHOT', 'CUSTOMER_CONFIRMED', 'CARRIER_ACCEPTED'],
      required: true,
      immutable: true,
    },
    confirmationReference: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
      immutable: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
  },
  { timestamps: true },
);

shipmentDestinationVersionSchema.index(
  { cycleId: 1, version: 1 },
  { unique: true, name: 'shipment_destination_version_unique' },
);
shipmentDestinationVersionSchema.index(
  { versionKey: 1 },
  { unique: true, name: 'shipment_destination_key_unique' },
);
shipmentDestinationVersionSchema.index({ orderId: 1, createdAt: 1 });

module.exports = mongoose.model('ShipmentDestinationVersion', shipmentDestinationVersionSchema);
