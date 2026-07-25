const ApiError = require('../utils/apiError');
const UserAddress = require('../models/userAddress.model');
const User = require('../models/user.model');
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
    throw new ApiError(400, 'Địa chỉ chứa các trường không thể cập nhật.');
  }
  const errors = [];
  const data = {};
  for (const field of ADDRESS_FIELDS) {
    if (!partial || Object.hasOwn(input, field)) {
      const value = String(input[field] || '').trim();
      if (!value) errors.push({ field, message: `Vui lòng nhập ${field}` });
      data[field] = value;
    }
  }
  if (data.phoneNumber) {
    data.phoneNumber = normalizePhone(data.phoneNumber);
    if (!VIETNAMESE_PHONE.test(data.phoneNumber)) {
      errors.push({ field: 'phoneNumber', message: 'Vui lòng nhập số điện thoại Việt Nam hợp lệ.' });
    }
  }
  if (data.label && data.label.length > 50) errors.push({ field: 'label', message: 'Nhãn địa chỉ không được vượt quá 50 ký tự.' });
  if (data.receiverName && data.receiverName.length > 120) errors.push({ field: 'receiverName', message: 'Tên người nhận không được vượt quá 120 ký tự.' });
  for (const field of ['province', 'district', 'ward']) {
    if (data[field] && data[field].length > 100) {
      errors.push({ field, message: `Thông tin địa chỉ không được vượt quá 100 ký tự.` });
    }
  }
  if (data.addressLine && data.addressLine.length > 300) errors.push({ field: 'addressLine', message: 'Địa chỉ chi tiết không được vượt quá 300 ký tự.' });
  if (Object.hasOwn(input, 'isDefault')) data.isDefault = Boolean(input.isDefault);
  if (errors.length) throw new ApiError(400, 'Dữ liệu địa chỉ không hợp lệ.', errors, 'VALIDATION_ERROR');
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
    async lockAddressBook(userId, session) {
      if (!session) {
        throw new ApiError(
          503,
          'Không thể khóa sổ địa chỉ ngoài transaction.',
          [],
          'ADDRESS_TRANSACTION_REQUIRED',
        );
      }
      const locked = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { addressBookVersion: 1 } },
        { new: false },
      ).select('_id').session(session).lean();
      if (!locked) throw new ApiError(404, 'Không tìm thấy thông tin người dùng.');
      return locked;
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
    if (!address) throw new ApiError(404, 'Không tìm thấy địa chỉ.');
    return address;
  }

  return {
    async listAddresses(userId) {
      return (await addressRepository.listByUser(userId)).map(toPlainAddress);
    },

    async createAddress(userId, input) {
      const data = validateAddress(input || {});
      return addressRepository.withTransaction(async (session) => {
        await addressRepository.lockAddressBook(userId, session);
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
      const changes = validateAddress(input || {}, { partial: true });
      return addressRepository.withTransaction(async (session) => {
        await addressRepository.lockAddressBook(userId, session);
        const existing = await requireAddress(userId, id, session);
        if (changes.isDefault) {
          await addressRepository.unsetDefault(userId, session);
          const updated = await addressRepository.updateForUser(userId, id, changes, session);
          if (!updated) throw new ApiError(404, 'Không tìm thấy địa chỉ.');
          return toPlainAddress(updated);
        }

        if (changes.isDefault === false) {
          if (existing.isDefault) {
            throw new ApiError(409, 'Khách hàng phải giữ ít nhất một địa chỉ mặc định.', [], 'DEFAULT_ADDRESS_REQUIRED');
          }
          delete changes.isDefault;
        }
        if (!Object.keys(changes).length) return toPlainAddress(existing);

        const updated = await addressRepository.updateForUser(userId, id, changes, session);
        if (!updated) throw new ApiError(404, 'Không tìm thấy địa chỉ.');
        return toPlainAddress(updated);
      });
    },

    async setDefaultAddress(userId, id) {
      return addressRepository.withTransaction(async (session) => {
        await addressRepository.lockAddressBook(userId, session);
        await requireAddress(userId, id, session);
        await addressRepository.unsetDefault(userId, session);
        const updated = await addressRepository.updateForUser(userId, id, { isDefault: true }, session);
        return toPlainAddress(updated);
      });
    },

    async deleteAddress(userId, id) {
      return addressRepository.withTransaction(async (session) => {
        await addressRepository.lockAddressBook(userId, session);
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
