const mongoose = require('mongoose');

const replenishmentRequestSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'quantity must be a positive integer' },
    },
    requestedQuantity: {
      type: Number,
      min: 1,
      validate: { validator: (value) => value === undefined || (Number.isInteger(value) && value > 0), message: 'requestedQuantity must be a positive integer' },
    },
    approvedQuantity: {
      type: Number,
      min: 1,
      validate: { validator: (value) => value === undefined || value === null || (Number.isInteger(value) && value > 0), message: 'approvedQuantity must be a positive integer' },
    },
    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: 'receivedQuantity must be a non-negative integer' },
    },
    netAcceptedQuantity: {
      type: Number,
      min: 0,
      default: 0,
      validate: { validator: Number.isInteger, message: 'netAcceptedQuantity must be a non-negative integer' },
    },
    evidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    idempotencyKey: { type: String, default: '', trim: true, maxlength: 240 },
    decisionReason: { type: String, default: '', trim: true },
    receipts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    shortClosureReason: { type: String, default: '', trim: true },
    shortClosureEvidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    shortClosureRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    shortClosureDecidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    shortClosureDecisionReason: { type: String, default: '', trim: true },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['PendingApproval', 'Approved', 'Rejected', 'Receiving', 'Received', 'PartiallyReceived', 'Withdrawn', 'ShortClosurePending', 'ClosedShort', 'Completed'],
      default: 'PendingApproval',
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    adminNote: {
      type: String,
      default: '',
      trim: true,
    },
    receivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

replenishmentRequestSchema.index({ status: 1, createdAt: -1 });
replenishmentRequestSchema.index({ productId: 1, status: 1 });
replenishmentRequestSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } }, name: 'replenishment_request_idempotency_unique' });
replenishmentRequestSchema.index(
  { productId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['PendingApproval', 'Approved', 'PartiallyReceived', 'ShortClosurePending'] } },
    name: 'replenishment_active_product_unique',
  },
);

replenishmentRequestSchema.pre('validate', function normalizeReplenishmentFields(next) {
  if (this.requestedQuantity === undefined || this.requestedQuantity === null) this.requestedQuantity = this.quantity;
  if (this.quantity === undefined || this.quantity === null) this.quantity = this.requestedQuantity;
  if (this.approvedQuantity === undefined && this.status === 'Approved') this.approvedQuantity = this.requestedQuantity;
  if (this.receivedQuantity !== undefined && this.netAcceptedQuantity === undefined) this.netAcceptedQuantity = this.receivedQuantity;
  next();
});

module.exports = mongoose.model('ReplenishmentRequest', replenishmentRequestSchema);
