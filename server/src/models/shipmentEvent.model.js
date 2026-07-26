const mongoose = require('mongoose');

const shipmentEventSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentCycle', required: true, immutable: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true, immutable: true },
    eventType: {
      type: String,
      enum: [
        'HANDOFF', 'ATTEMPT_FAILED', 'RESCHEDULED', 'DELIVERED', 'RETURNED_TO_SHOP',
        'LOST', 'DAMAGED', 'DISPUTED', 'CORRECTION', 'DESTINATION_CHANGED',
      ],
      required: true,
      immutable: true,
    },
    source: {
      type: String,
      enum: [
        'CARRIER',
        'STAFF_RECORDED_CARRIER_EVIDENCE',
        'STAFF_EVIDENCE',
        'CUSTOMER_DISPUTE',
        'WAREHOUSE',
      ],
      required: true,
      immutable: true,
    },
    occurredAt: { type: Date, required: true, immutable: true },
    recordedAt: { type: Date, required: true, default: Date.now, immutable: true },
    evidenceReference: { type: String, required: true, trim: true, maxlength: 256, immutable: true },
    evidenceReferences: {
      type: [String],
      default: [],
      immutable: true,
      validate: {
        validator(value) { return Array.isArray(value) && value.length <= 5; },
        message: 'A maximum of 5 operational evidence images is allowed',
      },
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
    replacesEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShipmentEvent', default: null, immutable: true },
    reason: { type: String, default: '', trim: true, maxlength: 1000, immutable: true },
  },
  { timestamps: true },
);

shipmentEventSchema.index({ eventKey: 1 }, { unique: true, name: 'shipment_event_key_unique' });
shipmentEventSchema.index({ shipmentId: 1, occurredAt: 1, _id: 1 });
shipmentEventSchema.index({ orderId: 1, eventType: 1 });

module.exports = mongoose.model('ShipmentEvent', shipmentEventSchema);
