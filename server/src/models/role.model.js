const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    roleName: {
      type: String,
      required: true,
      unique: true,
      enum: ['Customer', 'Staff', 'WarehouseManager', 'Admin'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', roleSchema);
