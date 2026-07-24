const mongoose = require('mongoose');

const productCommandSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 128,
      immutable: true,
    },
    commandType: {
      type: String,
      enum: ['CreateProduct'],
      required: true,
      immutable: true,
    },
    requestHash: {
      type: String,
      required: true,
      match: /^[0-9a-f]{64}$/,
      immutable: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      immutable: true,
    },
    resultSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
  },
  { timestamps: true, autoIndex: false },
);

productCommandSchema.index(
  { adminId: 1, idempotencyKey: 1 },
  { unique: true, name: 'product_command_admin_key_unique' },
);

module.exports = mongoose.model('ProductCommand', productCommandSchema);
