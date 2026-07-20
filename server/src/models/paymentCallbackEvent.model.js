const mongoose = require('mongoose');

const paymentCallbackEventSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    paymentAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt', default: null },
    paymentProvider: { type: String, required: true, trim: true },
    providerMessageId: { type: String, required: true, trim: true },
    eventStatus: { type: String, enum: ['Received', 'Processing', 'Processed'], default: 'Received' },
    processingStartedAt: { type: Date, default: null },
    rawPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    processingResult: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

paymentCallbackEventSchema.index(
  { paymentProvider: 1, providerMessageId: 1 },
  { unique: true, name: 'payment_callback_provider_message' }
);

module.exports = mongoose.model('PaymentCallbackEvent', paymentCallbackEventSchema);
