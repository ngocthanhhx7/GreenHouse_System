const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['Active', 'CheckedOut'],
      default: 'Active',
    },
  },
  { timestamps: true }
);

cartSchema.index({ customerId: 1, status: 1 });

module.exports = mongoose.model('ShoppingCart', cartSchema);
