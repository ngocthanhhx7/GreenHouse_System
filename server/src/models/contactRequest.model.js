const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, default: '', trim: true, maxlength: 20 },
  subject: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  status: { type: String, enum: ['New', 'Read', 'Resolved'], default: 'New', index: true },
}, { timestamps: true });

module.exports = mongoose.model('ContactRequest', schema);
