const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema(
  {
    commandKey: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    shipmentKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentCycle', required: true, immutable: true },
    packingRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'PackingRecord', required: true, immutable: true },
    carrierName: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    trackingReference: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    handedOffAt: { type: Date, required: true, immutable: true },
    handoffEvidenceReference: { type: String, required: true, trim: true, maxlength: 256, immutable: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    currentDestinationVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShipmentDestinationVersion',
      default: null,
    },
    status: {
      type: String,
      enum: ['HandedOff', 'AttemptFailed', 'Delivered', 'ReturnedToShop', 'Lost', 'Damaged'],
      default: 'HandedOff',
    },
    deliveredAt: { type: Date, default: null },
    terminalEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShipmentEvent', default: null },
  },
  { timestamps: true },
);

shipmentSchema.index({ commandKey: 1 }, { unique: true, name: 'shipment_command_key_unique' });
shipmentSchema.index({ cycleId: 1 }, { unique: true, name: 'shipment_one_per_cycle' });
shipmentSchema.index({ shipmentKey: 1 }, { unique: true, name: 'shipment_key_unique' });
shipmentSchema.index(
  { trackingReference: 1 },
  { unique: true, name: 'shipment_tracking_reference_unique' },
);
shipmentSchema.index({ orderId: 1, createdAt: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);
