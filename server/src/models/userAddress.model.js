const mongoose = require('mongoose');

const userAddressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    receiverName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    province: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    district: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    ward: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    addressLine: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    version: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

userAddressSchema.index(
  { userId: 1, createdAt: -1 },
  { name: 'sl007_address_owner_created' },
);
userAddressSchema.index(
  { userId: 1, isDefault: 1 },
  {
    name: 'one_default_address_per_user',
    unique: true,
    partialFilterExpression: { isDefault: true },
  }
);

module.exports = mongoose.model('UserAddress', userAddressSchema);
