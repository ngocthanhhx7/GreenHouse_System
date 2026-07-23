const mongoose = require('mongoose');

const exchangeUnitLineageSchema = new mongoose.Schema(
  {
    unitKey: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
    exclusivePhysicalClaimKey: { type: String, trim: true, maxlength: 240 },
    exchangeCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeCase', required: true },
    exchangeLineId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeLine', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    orderDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderDetail', required: true, immutable: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
    parentUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeUnitLineage', default: null, immutable: true },
    originalUnitOrdinal: { type: Number, required: true, min: 1, immutable: true },
    cycle: { type: Number, required: true, min: 0, immutable: true },
    outcome: {
      type: String,
      enum: ['Pending', 'Accepted', 'Rejected', 'ReplacementShipped', 'ReplacementDelivered'],
      default: 'Pending',
    },
    replacementDeliveredAt: { type: Date, default: null },
    exchangeDeadlineAt: { type: Date, default: null },
    inventoryMovementKeys: { type: [String], default: [] },
  },
  { timestamps: true }
);

exchangeUnitLineageSchema.index({ unitKey: 1 }, { unique: true, name: 'exchange_unit_key_unique' });
exchangeUnitLineageSchema.index(
  { exclusivePhysicalClaimKey: 1 },
  { unique: true, sparse: true, name: 'exchange_physical_claim_unique' }
);
exchangeUnitLineageSchema.index({ orderId: 1, orderDetailId: 1, originalUnitOrdinal: 1, cycle: 1 });
exchangeUnitLineageSchema.index({ exchangeDeadlineAt: 1, outcome: 1 });

module.exports = mongoose.model('ExchangeUnitLineage', exchangeUnitLineageSchema);
