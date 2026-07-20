const ApiError = require('../utils/apiError');
const User = require('../models/user.model');
const AuditLog = require('../models/auditLog.model');
const passwordUtils = require('../utils/password');

const EDITABLE_FIELDS = new Set(['fullName', 'phoneNumber', 'address']);
const VIETNAMESE_PHONE = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;

function normalizePhone(value) {
  return String(value || '').replace(/[\s.-]/g, '');
}

function resolveRole(user) {
  const role = user.role || user.roleId || {};
  return {
    id: role._id ? String(role._id) : '',
    roleName: role.roleName || '',
  };
}

function toPublicProfile(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber || user.phone || '',
    address: user.address || '',
    avatarUrl: user.avatarUrl || '',
    status: user.status,
    lastLoginAt: user.lastLoginAt || null,
    role: resolveRole(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function validateProfileChanges(input) {
  const keys = Object.keys(input || {});
  if (keys.some((key) => !EDITABLE_FIELDS.has(key))) {
    throw new ApiError(400, 'Profile contains fields that cannot be updated');
  }

  const changes = {};
  if (Object.hasOwn(input, 'fullName')) {
    const fullName = String(input.fullName || '').trim();
    if (fullName.length < 2 || fullName.length > 120) {
      throw new ApiError(400, 'Invalid profile data', [{ field: 'fullName', message: 'Full name must be between 2 and 120 characters' }]);
    }
    changes.fullName = fullName;
  }
  if (Object.hasOwn(input, 'phoneNumber')) {
    const phoneNumber = normalizePhone(input.phoneNumber);
    if (!VIETNAMESE_PHONE.test(phoneNumber)) {
      throw new ApiError(400, 'Invalid profile data', [{ field: 'phoneNumber', message: 'Valid Vietnamese phone number is required' }]);
    }
    changes.phoneNumber = phoneNumber;
    changes.phone = phoneNumber;
  }
  if (Object.hasOwn(input, 'address')) {
    const address = String(input.address || '').trim();
    if (!address || address.length > 500) {
      throw new ApiError(400, 'Invalid profile data', [{ field: 'address', message: 'Address is required and must not exceed 500 characters' }]);
    }
    changes.address = address;
  }
  return changes;
}

function validatePasswordChange(input) {
  const currentPassword = String(input.currentPassword || '');
  const newPassword = String(input.newPassword || '');
  if (!currentPassword) throw new ApiError(400, 'Current password is required');
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    throw new ApiError(400, 'New password must contain at least 8 characters, including a letter and a number');
  }
  if (newPassword !== String(input.confirmPassword || '')) {
    throw new ApiError(400, 'Password confirmation does not match');
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from current password');
  }
  return { currentPassword, newPassword };
}

function createModelUserRepository() {
  return {
    async findById(id) {
      return User.findById(id).populate('roleId').lean();
    },
    async updateProfile(id, changes) {
      return User.findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true }).populate('roleId').lean();
    },
    async updatePassword(id, passwordHash) {
      return User.findByIdAndUpdate(id, { $set: { passwordHash } }, { new: true, runValidators: true }).populate('roleId').lean();
    },
    async updateAvatar(id, avatarUrl) {
      return User.findByIdAndUpdate(id, { $set: { avatarUrl } }, { new: true, runValidators: true }).populate('roleId').lean();
    },
  };
}

function createAuditLogger() {
  return { async log(entry) { await AuditLog.create(entry); } };
}

function createProfileService({
  userRepository = createModelUserRepository(),
  comparePassword = passwordUtils.comparePassword,
  hashPassword = passwordUtils.hashPassword,
  auditLogger = createAuditLogger(),
} = {}) {
  async function requireUser(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new ApiError(404, 'Profile not found');
    return user;
  }

  return {
    async getProfile(userId) {
      return toPublicProfile(await requireUser(userId));
    },

    async updateProfile(userId, input) {
      await requireUser(userId);
      const changes = validateProfileChanges(input || {});
      const updated = await userRepository.updateProfile(userId, changes);
      await auditLogger.log({
        userId,
        action: 'PROFILE_UPDATE',
        targetEntity: 'User',
        targetId: String(userId),
        description: `Profile fields updated: ${Object.keys(changes).filter((key) => key !== 'phone').join(', ')}`,
      });
      return toPublicProfile(updated);
    },

    async changePassword(userId, input) {
      const { currentPassword, newPassword } = validatePasswordChange(input || {});
      const user = await requireUser(userId);
      if (!(await comparePassword(currentPassword, user.passwordHash))) {
        throw new ApiError(400, 'Current password is incorrect');
      }
      const passwordHash = await hashPassword(newPassword);
      await userRepository.updatePassword(userId, passwordHash);
      await auditLogger.log({
        userId,
        action: 'PROFILE_PASSWORD_CHANGE',
        targetEntity: 'User',
        targetId: String(userId),
        description: 'User changed account password',
      });
      return { changed: true };
    },

    async setAvatar(userId, avatarUrl) {
      if (!/^\/uploads\/avatars\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(String(avatarUrl || ''))) {
        throw new ApiError(400, 'Invalid avatar URL');
      }
      const user = await requireUser(userId);
      const updated = await userRepository.updateAvatar(userId, avatarUrl);
      await auditLogger.log({
        userId,
        action: 'PROFILE_AVATAR_UPDATE',
        targetEntity: 'User',
        targetId: String(userId),
        description: 'User updated account avatar',
      });
      return { profile: toPublicProfile(updated), previousAvatarUrl: user.avatarUrl || '' };
    },

    async removeAvatar(userId) {
      const user = await requireUser(userId);
      const updated = await userRepository.updateAvatar(userId, '');
      await auditLogger.log({
        userId,
        action: 'PROFILE_AVATAR_DELETE',
        targetEntity: 'User',
        targetId: String(userId),
        description: 'User removed account avatar',
      });
      return { profile: toPublicProfile(updated), previousAvatarUrl: user.avatarUrl || '' };
    },
  };
}

module.exports = {
  createProfileService,
  profileService: createProfileService(),
  toPublicProfile,
};
