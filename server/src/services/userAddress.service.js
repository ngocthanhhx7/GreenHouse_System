const ApiError = require('../utils/apiError');
const UserAddress = require('../models/userAddress.model');
const mongoose = require('mongoose');

const ADDRESS_FIELDS = ['label', 'receiverName', 'phoneNumber', 'province', 'district', 'ward', 'addressLine'];
const EDITABLE_FIELDS = new Set([...ADDRESS_FIELDS, 'isDefault']);
const VIETNAMESE_PHONE = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;

function normalizePhone(value) {
  return String(value || '').replace(/[\s.-]/g, '');
}

function toPlainAddress(address) {
  return {
    id: String(address._id),
    label: address.label,
    receiverName: address.receiverName,
    phoneNumber: address.phoneNumber,
    province: address.province,
    district: address.district,
    ward: address.ward,
    addressLine: address.addressLine,
    isDefault: Boolean(address.isDefault),
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}

function validateAddress(input, { partial = false } = {}) {
  const keys = Object.keys(input || {});
  if (keys.some((key) => !EDITABLE_FIELDS.has(key))) {
    throw new ApiError(400, 'Address contains fields that cannot be updated');
  }
  const errors = [];
  const data = {};
  for (const field of ADDRESS_FIELDS) {
    if (!partial || Object.hasOwn(input, field)) {
      const value = String(input[field] || '').trim();
      if (!value) errors.push({ field, message: `${field} is required` });
      data[field] = value;
    }
  }
  if (data.phoneNumber) {
    data.phoneNumber = normalizePhone(data.phoneNumber);
    if (!VIETNAMESE_PHONE.test(data.phoneNumber)) {
      errors.push({ field: 'phoneNumber', message: 'Valid Vietnamese phone number is required' });
    }
  }
  if (data.label && data.label.length > 50) errors.push({ field: 'label', message: 'Label must not exceed 50 characters' });
  if (data.receiverName && data.receiverName.length > 120) errors.push({ field: 'receiverName', message: 'Receiver name must not exceed 120 characters' });
  for (const field of ['province', 'district', 'ward']) {
    if (data[field] && data[field].length > 100) {
      errors.push({ field, message: `${field} must not exceed 100 characters` });
    }
  }
  if (data.addressLine && data.addressLine.length > 300) errors.push({ field: 'addressLine', message: 'Address line must not exceed 300 characters' });
  if (Object.hasOwn(input, 'isDefault')) data.isDefault = Boolean(input.isDefault);
  if (errors.length) throw new ApiError(400, 'Invalid address data', errors, 'VALIDATION_ERROR');
  return data;
}

function createModelAddressRepository() {
  return {
    async listByUser(userId) {
      return UserAddress.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
    },
    async countByUser(userId) {
      return UserAddress.countDocuments({ userId });
    },
    async unsetDefault(userId) {
      await UserAddress.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
    },
    async create(userId, data) {
      return UserAddress.create({ userId, ...data });
    },
    async findByIdForUser(userId, id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return UserAddress.findOne({ _id: id, userId }).lean();
    },
    async updateForUser(userId, id, changes) {
      if (!mongoose.isValidObjectId(id)) return null;
      return UserAddress.findOneAndUpdate({ _id: id, userId }, { $set: changes }, { new: true, runValidators: true }).lean();
    },
    async deleteForUser(userId, id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return UserAddress.findOneAndDelete({ _id: id, userId }).lean();
    },
  };
}

function createUserAddressService({ addressRepository = createModelAddressRepository() } = {}) {
  async function requireAddress(userId, id) {
    const address = await addressRepository.findByIdForUser(userId, id);
    if (!address) throw new ApiError(404, 'Address not found');
    return address;
  }

  async function promoteFirstAddress(userId) {
    const remaining = await addressRepository.listByUser(userId);
    if (remaining.length && !remaining.some((item) => item.isDefault)) {
      return addressRepository.updateForUser(userId, remaining[0]._id, { isDefault: true });
    }
    return null;
  }

  return {
    async listAddresses(userId) {
      return (await addressRepository.listByUser(userId)).map(toPlainAddress);
    },

    async createAddress(userId, input) {
      const data = validateAddress(input || {});
      const makeDefault = Boolean(data.isDefault) || (await addressRepository.countByUser(userId)) === 0;
      if (makeDefault) await addressRepository.unsetDefault(userId);
      const created = await addressRepository.create(userId, { ...data, isDefault: makeDefault });
      return toPlainAddress(created);
    },

    async updateAddress(userId, id, input) {
      await requireAddress(userId, id);
      const changes = validateAddress(input || {}, { partial: true });
      if (changes.isDefault) await addressRepository.unsetDefault(userId);
      const updated = await addressRepository.updateForUser(userId, id, changes);
      if (!updated) throw new ApiError(404, 'Address not found');
      return toPlainAddress(updated);
    },

    async setDefaultAddress(userId, id) {
      await requireAddress(userId, id);
      await addressRepository.unsetDefault(userId);
      const updated = await addressRepository.updateForUser(userId, id, { isDefault: true });
      return toPlainAddress(updated);
    },

    async deleteAddress(userId, id) {
      const existing = await requireAddress(userId, id);
      const deleted = await addressRepository.deleteForUser(userId, id);
      if (existing.isDefault) await promoteFirstAddress(userId);
      return toPlainAddress(deleted);
    },
  };
}

module.exports = {
  createUserAddressService,
  userAddressService: createUserAddressService(),
};
