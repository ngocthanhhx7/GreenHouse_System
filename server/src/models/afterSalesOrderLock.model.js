const mongoose = require('mongoose');

const afterSalesOrderLockSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    status: {
      type: String,
      enum: ['Active', 'Released', 'ClosedPermanently'],
      default: 'Active',
      required: true,
    },
    caseType: {
      type: String,
      enum: ['RETURN_REFUND', 'EXCHANGE'],
      required: true,
    },
    caseId: { type: mongoose.Schema.Types.ObjectId, required: true },
    acquiredAt: { type: Date, default: Date.now, required: true },
    releasedAt: { type: Date, default: null },
    terminalStatus: { type: String, default: '', trim: true, maxlength: 80 },
    previousCaseType: { type: String, enum: ['', 'RETURN_REFUND', 'EXCHANGE'], default: '' },
    previousCaseId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

afterSalesOrderLockSchema.index(
  { orderId: 1 },
  { unique: true, name: 'after_sales_order_lock_unique' }
);
afterSalesOrderLockSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('AfterSalesOrderLock', afterSalesOrderLockSchema);
