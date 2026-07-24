const mongoose = require('mongoose');

const cartCommandSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 128, immutable: true },
    commandType: {
      type: String,
      enum: ['AddItem', 'UpdateItem', 'RemoveItem'],
      required: true,
      immutable: true,
    },
    requestHash: { type: String, required: true, immutable: true },
    cartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShoppingCart',
      required: true,
      immutable: true,
    },
    resultingVersion: { type: Number, required: true, min: 1, immutable: true },
    resultSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  },
  { timestamps: true },
);

cartCommandSchema.index(
  { customerId: 1, idempotencyKey: 1 },
  { unique: true, name: 'cart_command_customer_key_unique' },
);

module.exports = mongoose.model('CartCommand', cartCommandSchema);
