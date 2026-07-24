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
    version: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Cart version must be a non-negative integer',
      },
    },
  },
  { timestamps: true }
);

cartSchema.index(
  { customerId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Active' },
    name: 'one_active_cart_per_customer',
  }
);
cartSchema.index({ customerId: 1, status: 1 });

module.exports = mongoose.model('ShoppingCart', cartSchema);
