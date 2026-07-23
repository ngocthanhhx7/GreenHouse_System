const mongoose = require('mongoose');

const refundDestinationSchema = new mongoose.Schema(
  {
    returnRefundRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReturnRefundRequest',
      required: true,
      immutable: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    version: { type: Number, required: true, min: 1, immutable: true },
    supersedesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RefundDestination',
      default: null,
      immutable: true,
    },
    bankName: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    bankBin: { type: String, default: '', trim: true, match: /^$|^[0-9]{6}$/, immutable: true },
    accountNumberEncrypted: { type: String, required: true, select: false, immutable: true },
    accountHolderEncrypted: { type: String, required: true, select: false, immutable: true },
    accountNumberLast4: { type: String, required: true, trim: true, maxlength: 4, immutable: true },
    accountHolderMasked: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    destinationFingerprint: { type: String, required: true, select: false, immutable: true },
    confirmationNotice: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
    customerConfirmedAt: { type: Date, required: true, immutable: true },
    status: { type: String, enum: ['Submitted', 'Verified', 'Rejected'], default: 'Submitted' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', trim: true, maxlength: 500 },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
  },
  { timestamps: true, toJSON: { transform(_doc, ret) { delete ret.accountNumberEncrypted; delete ret.accountHolderEncrypted; delete ret.destinationFingerprint; return ret; } } }
);

refundDestinationSchema.index({ returnRefundRequestId: 1, version: 1 }, { unique: true, name: 'refund_destination_version_unique' });
refundDestinationSchema.index({ returnRefundRequestId: 1, idempotencyKey: 1 }, { unique: true, name: 'refund_destination_idempotency_unique' });
refundDestinationSchema.index({ returnRefundRequestId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RefundDestination', refundDestinationSchema);
