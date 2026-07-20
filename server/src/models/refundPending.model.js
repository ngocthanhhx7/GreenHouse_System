const mongoose = require('mongoose');

// A narrow hand-off record: Nhat's return/refund workflow owns the later decision and execution.
const refundPendingSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    paymentAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'VND', trim: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['RefundPending', 'HandedOff', 'Refunded'], default: 'RefundPending' },
  },
  { timestamps: true }
);

refundPendingSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('RefundPending', refundPendingSchema);
