const mongoose = require('mongoose');

const stockReservationSchema = new mongoose.Schema(
  {
    reservationKey: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
    exchangeCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeCase', required: true, immutable: true },
    exchangeLineId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeLine', required: true, immutable: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'quantity must be a positive integer' },
    },
    status: { type: String, enum: ['Reserved', 'Released', 'Consumed'], default: 'Reserved' },
    reservedAt: { type: Date, required: true, default: Date.now },
    releasedAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null },
    releaseReason: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

stockReservationSchema.index(
  { reservationKey: 1 },
  { unique: true, name: 'exchange_reservation_key_unique' }
);
stockReservationSchema.index({ exchangeCaseId: 1, status: 1 });

module.exports = mongoose.model('StockReservation', stockReservationSchema);
