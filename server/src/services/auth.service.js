const ApiError = require('../utils/apiError');
const { hashPassword, comparePassword } = require('../utils/password');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const AuditLog = require('../models/auditLog.model');
const { sessionService: defaultSessionService } = require('./session.service');
const { loginThrottleService: defaultLoginThrottle } = require('./loginThrottle.service');
const { assertSingleApprovedRole } = require('../config/roleMatrix');
const bcrypt = require('bcryptjs');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function toPublicUser(user, role) {
  const roleName = assertSingleApprovedRole(role);
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber || '',
    avatarUrl: user.avatarUrl || '',
    lastLoginAt: user.lastLoginAt || null,
    status: user.status,
    role: {
      id: String(role._id),
      roleName,
    },
  };
}

function createModelUserRepository() {
  return {
    async findByEmail(email) {
      return User.findOne({ email }).populate('roleId').lean();
    },
    async create(data) {
      const created = await User.create(data);
      return User.findById(created._id).populate('roleId').lean();
    },
    async updateLastLogin(id, lastLoginAt) {
      return User.findByIdAndUpdate(id, { $set: { lastLoginAt } }, { new: true }).populate('roleId').lean();
    },
  };
}

function createModelRoleRepository() {
  return {
    async findByName(roleName) {
      return Role.findOne({ roleName }).lean();
    },
  };
}

function createModelAuditLogger() {
  return {
    async log(entry) {
      await AuditLog.create(entry);
    },
  };
}

function resolveUserRole(user, fallbackRole) {
  return user.role || user.roleId || fallbackRole;
}

function createAuthService({
  userRepository = createModelUserRepository(),
  roleRepository = createModelRoleRepository(),
  auditLogger = createModelAuditLogger(),
  sessionService = defaultSessionService,
  loginThrottle = defaultLoginThrottle,
  passwordComparer = comparePassword,
  dummyPasswordHash = bcrypt.hashSync('GreenHomeDummy123', 10),
  } = {}) {
  return {
    async registerCustomer(input) {
      throw new ApiError(
        410,
        'Đăng ký tài khoản phải qua bước xác minh email.',
        [],
        'REGISTRATION_TWO_STEP_REQUIRED'
      );
    },

    async login(input, { ip = '', userAgent = '' } = {}) {
      const email = normalizeEmail(input.email);
      await loginThrottle.claimAttempt({ email, ip });
      const user = await userRepository.findByEmail(email);
      const passwordMatches = await passwordComparer(input.password || '', user?.passwordHash || dummyPasswordHash);
      if (!passwordMatches) {
        await loginThrottle.claimFailure({ email, ip });
        await auditLogger.log({
          userId: user?._id || null,
          action: 'AUTH_LOGIN_FAILURE',
          targetEntity: 'User',
          targetId: user?._id ? String(user._id) : '',
          description: 'Login credentials rejected',
          ip,
          userAgent,
        });
        throw new ApiError(401, 'Email hoặc mật khẩu không đúng.', [], 'AUTH_INVALID_CREDENTIALS');
      }
      if (user.status !== 'Active') {
        throw new ApiError(
          403,
          'Tài khoản đã bị vô hiệu hóa; vui lòng liên hệ CSKH.',
          [],
          'AUTH_ACCOUNT_DISABLED'
        );
      }

      const role = resolveUserRole(user);
      let roleName;
      try {
        roleName = assertSingleApprovedRole(role);
      } catch (_error) {
        await auditLogger.log({
          userId: user._id,
          action: 'AUTH_ROLE_INTEGRITY_FAILURE',
          targetEntity: 'User',
          targetId: String(user._id),
          description: 'Login rejected because persisted role evidence is invalid',
          ip,
          userAgent,
        });
        throw new ApiError(403, 'Dữ liệu vai trò không hợp lệ.', [], 'ROLE_INTEGRITY_INVALID');
      }
      const loggedInAt = new Date();
      if (userRepository.updateLastLogin) {
        user.lastLoginAt = loggedInAt;
        await userRepository.updateLastLogin(user._id, loggedInAt);
      }
      const publicUser = toPublicUser(user, role);
      const createdSession = await sessionService.createSession({
        userId: String(user._id),
        roleName,
        credentialVersion: Number(user.credentialVersion || 0),
        ip,
        userAgent,
      });
      await loginThrottle.clearEmail(email);

      await auditLogger.log({
        userId: user._id,
        action: 'AUTH_LOGIN_SUCCESS',
        targetEntity: 'User',
        targetId: String(user._id),
        description: `User logged in as ${role.roleName}`,
      });

      return {
        sessionSelector: createdSession.selector,
        user: publicUser,
      };
    },
  };
}

module.exports = {
  createAuthService,
  authService: createAuthService(),
};
