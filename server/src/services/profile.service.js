const ApiError = require('../utils/apiError');
const User = require('../models/user.model');
const AuditLog = require('../models/auditLog.model');
const passwordUtils = require('../utils/password');
const mongoose = require('mongoose');
const { validatePasswordPolicy } = require('../utils/passwordPolicy');
const { sessionService: defaultSessionService } = require('./session.service');
const { createEmailOutboxService } = require('./email.service');

const EDITABLE_FIELDS = new Set(['fullName', 'phoneNumber']);
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
    phoneNumber: user.phoneNumber || '',
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
  }
  return changes;
}

function validatePasswordChange(input) {
  const currentPassword = String(input.currentPassword || '');
  const newPassword = String(input.newPassword || '');
  if (!currentPassword) throw new ApiError(400, 'Current password is required');
  validatePasswordPolicy({
    password: newPassword,
    confirmPassword: input.confirmPassword,
    passwordField: 'newPassword',
  });
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
    async updateProfile(id, changes, session) {
      const query = User.findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true }).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async updatePasswordIfCredentialVersion(id, expectedVersion, changes, session) {
      const credentialFilter = expectedVersion === 0
        ? { $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }] }
        : { credentialVersion: expectedVersion };
      const query = User.findOneAndUpdate(
        { _id: id, ...credentialFilter },
        { $set: changes, $inc: { credentialVersion: 1 } },
        { new: true, runValidators: true }
      ).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async updateAvatar(id, avatarUrl) {
      return User.findByIdAndUpdate(id, { $set: { avatarUrl } }, { new: true, runValidators: true }).populate('roleId').lean();
    },
  };
}

function createAuditLogger() {
  return {
    async log(entry, session) {
      if (session) await AuditLog.create([entry], { session });
      else await AuditLog.create(entry);
    },
  };
}

function createTransactionManager() {
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
  };
}

function createProfileService({
  userRepository = createModelUserRepository(),
  comparePassword = passwordUtils.comparePassword,
  hashPassword = passwordUtils.hashPassword,
  auditLogger = createAuditLogger(),
  sessionService = defaultSessionService,
  outboxService = createEmailOutboxService(),
  transactionManager = createTransactionManager(),
  now = () => new Date(),
} = {}) {
  async function requireUser(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new ApiError(404, 'Profile not found');
    if (user.status !== 'Active') throw new ApiError(403, 'Tài khoản không hoạt động.', [], 'PROFILE_ACCOUNT_DISABLED');
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
      const expectedCredentialVersion = Number(user.credentialVersion || 0);
      if (!(await comparePassword(currentPassword, user.passwordHash))) {
        throw new ApiError(400, 'Current password is incorrect');
      }
      const passwordHash = await hashPassword(newPassword);
      const changedAt = now();
      const applyChange = async (session) => {
        const updated = await userRepository.updatePasswordIfCredentialVersion(userId, expectedCredentialVersion, {
          passwordHash,
          passwordChangedAt: changedAt,
        }, session);
        if (!updated) {
          throw new ApiError(
            409,
            'Mật khẩu đã được thay đổi bởi một yêu cầu khác. Vui lòng đăng nhập lại.',
            [],
            'CREDENTIAL_CHANGED_CONCURRENTLY'
          );
        }
        const revoked = await sessionService.revokeAllForUser(userId, 'PASSWORD_CHANGED', session);
        await auditLogger.log({
          userId,
          action: 'PROFILE_PASSWORD_CHANGE',
          targetEntity: 'User',
          targetId: String(userId),
          description: 'User changed account password and revoked all sessions',
        }, session);
        await outboxService.enqueue({
          eventType: 'PROFILE_PASSWORD_CHANGED',
          idempotencyKey: `PROFILE_PASSWORD_CHANGED:${String(userId)}:${changedAt.toISOString()}`,
          recipient: user.email,
          payload: {
            userId: String(userId),
            fullName: user.fullName,
          },
        }, session);
        return { changed: true, revokedSessions: revoked.revokedCount };
      };
      return transactionManager
        ? transactionManager.withTransaction(applyChange)
        : applyChange(null);
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
