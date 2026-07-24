const mongoose = require('mongoose');

const codDiscrepancySchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true, immutable: true },
    deliveryEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShipmentEvent', required: true, immutable: true },
    expectedAmount: { type: Number, required: true, min: 0, immutable: true },
    customerCollectedAmount: { type: Number, min: 0, default: null },
    carrierSettlementAmount: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: [
        'Open', 'ResolvedCollectedAtDelivery', 'ResolvedCollectedLater',
        'RecoveryRequired', 'RecoveryRefundPending', 'ResolvedUncollected',
        'ResolvedPartialRefunded',
      ],
      default: 'Open',
    },
    openedAt: { type: Date, required: true, immutable: true },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

codDiscrepancySchema.index(
  { orderId: 1 },
  { unique: true, name: 'cod_discrepancy_one_per_order' },
);
codDiscrepancySchema.index({ status: 1, openedAt: 1 });

module.exports = mongoose.model('CodDiscrepancy', codDiscrepancySchema);
