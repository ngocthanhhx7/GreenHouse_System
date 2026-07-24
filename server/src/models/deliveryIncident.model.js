const mongoose = require('mongoose');

const deliveryIncidentSchema = new mongoose.Schema(
  {
    incidentKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentCycle', required: true, immutable: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true, immutable: true },
    sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShipmentEvent', required: true, immutable: true },
    incidentType: {
      type: String,
      enum: ['ReturnedToShop', 'Lost', 'Damaged'],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: [
        'AwaitingWarehouseReceipt',
        'AwaitingCustomerChoice',
        'WaitingForStock',
        'ResendCreated',
        'TerminalRequested',
        'Resolved',
      ],
      default: 'AwaitingCustomerChoice',
    },
    irrecoverable: { type: Boolean, default: false, immutable: true },
    customerChoice: { type: String, enum: ['', 'Resend', 'Wait', 'TerminalRefund'], default: '' },
    customerChoiceAt: { type: Date, default: null },
    chosenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    choiceCommandKey: { type: String, default: '', trim: true, maxlength: 160 },
    waitChosenAt: { type: Date, default: null },
    waitCommandKey: { type: String, default: '', trim: true, maxlength: 160 },
    resendCycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentCycle', default: null },
    resolutionCommandKey: { type: String, default: '', trim: true, maxlength: 160 },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

deliveryIncidentSchema.index(
  { sourceEventId: 1 },
  { unique: true, name: 'delivery_incident_source_event_unique' },
);
deliveryIncidentSchema.index(
  { incidentKey: 1 },
  { unique: true, name: 'delivery_incident_key_unique' },
);
deliveryIncidentSchema.index({ orderId: 1, status: 1 });
deliveryIncidentSchema.index(
  { choiceCommandKey: 1 },
  {
    unique: true,
    partialFilterExpression: { choiceCommandKey: { $type: 'string', $gt: '' } },
    name: 'delivery_incident_choice_command_unique',
  },
);
deliveryIncidentSchema.index(
  { waitCommandKey: 1 },
  {
    unique: true,
    partialFilterExpression: { waitCommandKey: { $type: 'string', $gt: '' } },
    name: 'delivery_incident_wait_command_unique',
  },
);
deliveryIncidentSchema.index(
  { resolutionCommandKey: 1 },
  {
    unique: true,
    partialFilterExpression: { resolutionCommandKey: { $type: 'string', $gt: '' } },
    name: 'delivery_incident_resolution_command_unique',
  },
);

module.exports = mongoose.model('DeliveryIncident', deliveryIncidentSchema);
