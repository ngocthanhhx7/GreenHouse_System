const mongoose = require('mongoose');

const APPEND_ONLY_MUTATION_ERROR = 'CUSTOMER_DELIVERY_RECEIPT_APPEND_ONLY';

function appendOnlyMutationError(operation) {
  const error = new Error(`Customer delivery receipt is append-only and cannot be changed by ${operation}`);
  error.code = APPEND_ONLY_MUTATION_ERROR;
  return error;
}

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
customerDeliveryReceiptSchema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { supersedesId: null },
    name: 'customer_receipt_initial_decision_unique',
  },
);
customerDeliveryReceiptSchema.index({ orderId: 1, createdAt: -1 }, { name: 'customer_receipt_history' });
customerDeliveryReceiptSchema.index(
  { outcome: 1, createdAt: 1 },
  {
    partialFilterExpression: { outcome: 'NOT_RECEIVED' },
    name: 'customer_receipt_not_received_history',
  },
);

customerDeliveryReceiptSchema.pre('save', function rejectPersistedSave() {
  if (!this.isNew) throw appendOnlyMutationError('save');
});
customerDeliveryReceiptSchema.pre(
  [
    'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
    'deleteOne', 'deleteMany', 'findOneAndDelete',
  ],
  function rejectQueryMutation() {
    throw appendOnlyMutationError(this.op);
  },
);
customerDeliveryReceiptSchema.pre('bulkWrite', function rejectBulkMutations(next, operations) {
  try {
    if ((operations || []).some((operation) => !operation.insertOne)) {
      throw appendOnlyMutationError('bulkWrite');
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('CustomerDeliveryReceipt', customerDeliveryReceiptSchema);
