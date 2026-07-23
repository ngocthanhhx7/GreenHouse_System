const mongoose = require('mongoose');

const orderReservationSchema = new mongoose.Schema(
  {
    reservationKey: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    orderDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderDetail', required: true, immutable: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
    quantity: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger } },
    status: { type: String, enum: ['Reserved', 'Released', 'Consumed'], default: 'Reserved' },
    reservedAt: { type: Date, default: Date.now, immutable: true },
    releasedAt: { type: Date, default: null },
    releaseReason: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

orderReservationSchema.index({ reservationKey: 1 }, { unique: true, name: 'order_reservation_key_unique' });
orderReservationSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('OrderReservation', orderReservationSchema);
