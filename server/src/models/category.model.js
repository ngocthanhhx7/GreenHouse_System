const mongoose = require('mongoose');
const {
  collapseWhitespace,
  normalizeCategoryIdentity,
} = require('../utils/catalogNormalization');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      set: collapseWhitespace,
    },
    normalizedName: { type: String, required: true },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      required: true,
    },
    // Every lifecycle transition claims a new version so Product activation and
    // Category deactivation cannot both commit from the same observation.
    catalogVersion: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

categorySchema.index({ normalizedName: 1 }, { unique: true, name: 'category_normalized_name_unique' });
categorySchema.index({ status: 1, name: 1, _id: 1 });

categorySchema.pre('validate', function normalizeCategory(next) {
  this.name = collapseWhitespace(this.name);
  this.normalizedName = normalizeCategoryIdentity(this.name);
  next();
});

module.exports = mongoose.model('Category', categorySchema);
