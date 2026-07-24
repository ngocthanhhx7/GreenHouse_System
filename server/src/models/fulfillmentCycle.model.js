const mongoose = require('mongoose');

const fulfillmentCycleSchema = new mongoose.Schema(
  {
    cycleKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    cycleNumber: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: { validator: Number.isInteger, message: 'cycleNumber must be a positive integer' },
    },
    cycleType: { type: String, enum: ['Initial', 'Resend'], required: true, immutable: true },
    status: {
      type: String,
      enum: ['AwaitingExport', 'Exported', 'Packed', 'HandedOff', 'Delivered', 'Incident', 'Closed'],
      default: 'AwaitingExport',
    },
    resendOfCycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FulfillmentCycle',
      default: null,
      immutable: true,
    },
    sourceIncidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryIncident',
      default: null,
      immutable: true,
    },
    customerChoice: {
      type: String,
      enum: ['', 'Resend', 'Wait', 'TerminalRefund'],
      default: '',
    },
    commandKey: { type: String, default: '', trim: true, maxlength: 160, immutable: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
  },
  { timestamps: true },
);

fulfillmentCycleSchema.index(
  { cycleKey: 1 },
  { unique: true, name: 'fulfillment_cycle_key_unique' },
);
fulfillmentCycleSchema.index(
  { orderId: 1, cycleNumber: 1 },
  { unique: true, name: 'fulfillment_cycle_order_number_unique' },
);
fulfillmentCycleSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('FulfillmentCycle', fulfillmentCycleSchema);
