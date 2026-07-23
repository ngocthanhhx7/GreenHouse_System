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
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } finally {
        await session.endSession();
      }
    },
    async listByUser(userId, session) {
      const query = UserAddress.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
      return (session ? query.session(session) : query).lean();
    },
    async countByUser(userId, session) {
      const query = UserAddress.countDocuments({ userId });
      return session ? query.session(session) : query;
    },
    async unsetDefault(userId, session) {
      const query = UserAddress.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
      await (session ? query.session(session) : query);
    },
    async create(userId, data, session) {
      if (!session) return UserAddress.create({ userId, ...data });
      const [created] = await UserAddress.create([{ userId, ...data }], { session });
      return created;
    },
    async findByIdForUser(userId, id, session) {
      if (!mongoose.isValidObjectId(id)) return null;
      const query = UserAddress.findOne({ _id: id, userId });
      return (session ? query.session(session) : query).lean();
    },
    async updateForUser(userId, id, changes, session) {
      if (!mongoose.isValidObjectId(id)) return null;
      const query = UserAddress.findOneAndUpdate({ _id: id, userId }, { $set: changes, $inc: { version: 1 } }, { new: true, runValidators: true });
      return (session ? query.session(session) : query).lean();
    },
    async deleteForUser(userId, id, session) {
      if (!mongoose.isValidObjectId(id)) return null;
      const query = UserAddress.findOneAndDelete({ _id: id, userId });
      return (session ? query.session(session) : query).lean();
    },
  };
}

function createUserAddressService({ addressRepository = createModelAddressRepository() } = {}) {
  async function requireAddress(userId, id, session) {
    const address = await addressRepository.findByIdForUser(userId, id, session);
    if (!address) throw new ApiError(404, 'Address not found');
    return address;
  }

  return {
    async listAddresses(userId) {
      return (await addressRepository.listByUser(userId)).map(toPlainAddress);
    },

    async createAddress(userId, input) {
      const data = validateAddress(input || {});
      return addressRepository.withTransaction(async (session) => {
        const count = await addressRepository.countByUser(userId, session);
        if (count >= 10) {
          throw new ApiError(409, 'Sổ địa chỉ đã đạt giới hạn 10 địa chỉ.', [], 'ADDRESS_LIMIT_REACHED');
        }
        const makeDefault = Boolean(data.isDefault) || count === 0;
        if (makeDefault && count > 0) await addressRepository.unsetDefault(userId, session);
        const created = await addressRepository.create(userId, { ...data, isDefault: makeDefault }, session);
        return toPlainAddress(created);
      });
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
      return addressRepository.withTransaction(async (session) => {
        await requireAddress(userId, id, session);
        await addressRepository.unsetDefault(userId, session);
        const updated = await addressRepository.updateForUser(userId, id, { isDefault: true }, session);
        return toPlainAddress(updated);
      });
    },

    async deleteAddress(userId, id) {
      return addressRepository.withTransaction(async (session) => {
        const existing = await requireAddress(userId, id, session);
        const count = await addressRepository.countByUser(userId, session);
        if (existing.isDefault && count > 1) {
          throw new ApiError(
            409,
            'Hãy chọn địa chỉ mặc định khác trước khi xóa.',
            [],
            'DEFAULT_ADDRESS_REPLACEMENT_REQUIRED'
          );
        }
        const deleted = await addressRepository.deleteForUser(userId, id, session);
        return toPlainAddress(deleted);
      });
    },
  };
}

module.exports = {
  createUserAddressService,
  userAddressService: createUserAddressService(),
};
