const mongoose = require('mongoose');

const productMediaAssetSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, immutable: true },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required() {
        return this.status === 'Temporary';
      },
      default: null,
      immutable: true,
    },
    originalName: { type: String, default: '', trim: true, maxlength: 180, immutable: true },
    mimeType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/webp'],
      required: true,
      immutable: true,
    },
    size: { type: Number, required: true, min: 0, max: 5 * 1024 * 1024, immutable: true },
    status: {
      type: String,
      enum: ['Temporary', 'Attached', 'Retained'],
      default: 'Temporary',
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    expiresAt: {
      type: Date,
      required() {
        return this.status === 'Temporary';
      },
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    attachedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

productMediaAssetSchema.index({ url: 1 }, { unique: true });
productMediaAssetSchema.index({ ownerId: 1, status: 1, expiresAt: 1 });
productMediaAssetSchema.index({ productId: 1, status: 1 });

module.exports = mongoose.model('ProductMediaAsset', productMediaAssetSchema);
