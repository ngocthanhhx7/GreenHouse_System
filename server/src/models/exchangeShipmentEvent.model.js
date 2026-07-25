const mongoose = require('mongoose');

const exchangeShipmentEventSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
    exchangeCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeCase', required: true, immutable: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeShipment', required: true, immutable: true },
    eventType: { type: String, enum: ['DELIVERED', 'LOST', 'DAMAGED', 'DISPUTED', 'CORRECTION'], required: true, immutable: true },
    source: {
      type: String,
      enum: [
        'CARRIER',
        'STAFF_RECORDED_CARRIER_EVIDENCE',
        'STAFF_EVIDENCE',
        'CUSTOMER_DISPUTE',
      ],
      required: true,
      immutable: true,
    },
    occurredAt: { type: Date, required: true, immutable: true },
    evidenceReference: { type: String, required: true, trim: true, maxlength: 256, immutable: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
    replacesEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeShipmentEvent', default: null, immutable: true },
    note: { type: String, default: '', trim: true, maxlength: 1000, immutable: true },
  },
  { timestamps: true }
);

exchangeShipmentEventSchema.index(
  { eventKey: 1 },
  { unique: true, name: 'exchange_shipment_event_key_unique' }
);
exchangeShipmentEventSchema.index({ shipmentId: 1, occurredAt: 1 });

module.exports = mongoose.model('ExchangeShipmentEvent', exchangeShipmentEventSchema);
