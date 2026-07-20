const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    cartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShoppingCart',
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be a positive integer',
      },
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

cartItemSchema.index({ cartId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('CartItem', cartItemSchema);
