const mongoose = require('mongoose');

const STATUSES = [
  'AwaitingCODReconciliation',
  'CODRecoveryInProgress',
  'ClosedByCODRecovery',
  'Submitted',
  'AwaitingExactStockChoice',
  'WaitingForExactStock',
  'ApprovedAwaitingShipment',
  'CustomerShipped',
  'WarehouseInspecting',
  'OutboundFulfillment',
  'ReplacementShipped',
  'DeliveryIncident',
  'Rejected',
  'Cancelled',
  'Expired',
  'ClosedNoExchange',
  'ConvertedToReturnRefund',
  'Completed',
];

const exchangeCaseSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    requestCode: { type: String, required: true, trim: true, immutable: true },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    requestFingerprint: { type: String, required: true, trim: true, maxlength: 64, immutable: true },
    status: { type: String, enum: STATUSES, default: 'Submitted', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 2000, immutable: true },
    evidenceImages: { type: [String], default: [], immutable: true },
    requestedAt: { type: Date, required: true, default: Date.now, immutable: true },
    deadlineAt: { type: Date, required: true, immutable: true },
    sourceTimelyRequestedAt: { type: Date, required: true, immutable: true },
    sourceCycle: { type: Number, default: 0, min: 0, immutable: true },
    holdReason: { type: String, default: '', trim: true, maxlength: 1000 },
    decisionReason: { type: String, default: '', trim: true, maxlength: 2000 },
    decisionIdempotencyKey: { type: String, default: '', trim: true, maxlength: 160 },
    decisionFingerprint: { type: String, default: '', trim: true, maxlength: 64 },
    responsibility: {
      type: String,
      enum: ['', 'SHOP_FAULT', 'CUSTOMER_PREFERENCE'],
      default: '',
    },
    shippingPayer: { type: String, enum: ['', 'SHOP', 'CUSTOMER'], default: '' },
    payerRationale: { type: String, default: '', trim: true, maxlength: 1000 },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    shipByAt: { type: Date, default: null },
    handoffAt: { type: Date, default: null },
    handoffProofReference: { type: String, default: '', trim: true, maxlength: 256 },
    handoffIdempotencyKey: { type: String, default: '', trim: true, maxlength: 160 },
    warehouseReceivedAt: { type: Date, default: null },
    warehouseReceiptReference: { type: String, default: '', trim: true, maxlength: 256 },
    warehouseReceiptIdempotencyKey: { type: String, default: '', trim: true, maxlength: 160 },
    inspectionIdempotencyKey: { type: String, default: '', trim: true, maxlength: 160 },
    stockChoiceIdempotencyKey: { type: String, default: '', trim: true, maxlength: 160 },
    stockChoice: {
      type: String,
      enum: ['', 'WAIT', 'CONVERT_TO_RETURN'],
      default: '',
    },
    cancellationIdempotencyKey: { type: String, default: '', trim: true, maxlength: 160 },
    stockFailureReason: { type: String, default: '', trim: true, maxlength: 1000 },
    waitingFor: {
      type: String,
      enum: ['', 'INITIAL_APPROVAL', 'INCIDENT_RESEND'],
      default: '',
    },
    incidentShipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExchangeShipment',
      default: null,
    },
    incidentReason: { type: String, default: '', trim: true, maxlength: 1000 },
    convertedReturnRefundRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReturnRefundRequest',
      default: null,
    },
    completedAt: { type: Date, default: null },
    terminalAt: { type: Date, default: null },
  },
  { timestamps: true }
);

exchangeCaseSchema.index({ requestCode: 1 }, { unique: true, name: 'exchange_request_code_unique' });
exchangeCaseSchema.index(
  { customerId: 1, idempotencyKey: 1 },
  { unique: true, name: 'exchange_customer_idempotency_unique' }
);
exchangeCaseSchema.index({ customerId: 1, createdAt: -1 });
exchangeCaseSchema.index({ status: 1, createdAt: -1 });
exchangeCaseSchema.index({ orderId: 1, createdAt: -1 });

module.exports = mongoose.model('ExchangeCase', exchangeCaseSchema);
module.exports.STATUSES = STATUSES;
