const mongoose = require('mongoose');

// Customer acknowledgement is distinct from the Carrier/Staff physical delivery evidence.
// Each decision is append-only so a later terminal receipt can retain its dispute history.
const customerDeliveryReceiptSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true, immutable: true },
    deliveryEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShipmentEvent', required: true, immutable: true },
    outcome: { type: String, enum: ['RECEIVED', 'NOT_RECEIVED'], required: true, immutable: true },
    reason: { type: String, default: '', trim: true, maxlength: 500, immutable: true },
    supersedesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerDeliveryReceipt',
      default: null,
      immutable: true,
    },
    respondedAt: { type: Date, required: true, immutable: true },
    exchangeDeadlineAt: { type: Date, default: null, immutable: true },
    returnDeadlineAt: { type: Date, default: null, immutable: true },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    requestHash: { type: String, required: true, match: /^[0-9a-f]{64}$/i, immutable: true },
  },
  { timestamps: true, strict: true },
);

customerDeliveryReceiptSchema.index(
  { customerId: 1, idempotencyKey: 1 },
  { unique: true, name: 'customer_receipt_command_unique' },
);
customerDeliveryReceiptSchema.index(
  { orderId: 1, outcome: 1 },
  {
    unique: true,
    partialFilterExpression: { outcome: 'RECEIVED' },
    name: 'customer_receipt_terminal_unique',
  },
);
customerDeliveryReceiptSchema.index({ customerId: 1, respondedAt: -1 }, { name: 'customer_receipt_history' });
customerDeliveryReceiptSchema.index({ orderId: 1, outcome: 1, respondedAt: -1 }, { name: 'customer_receipt_dispute_history' });

module.exports = mongoose.model('CustomerDeliveryReceipt', customerDeliveryReceiptSchema);
