const ApiError = require('../utils/apiError');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAuthToken } = require('../utils/jwt');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const AuditLog = require('../models/auditLog.model');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function toPublicUser(user, role) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    status: user.status,
    role: {
      id: String(role._id),
      roleName: role.roleName,
    },
  };
}

function validateRegistration(input) {
  const errors = [];
  if (!input.fullName || !String(input.fullName).trim()) errors.push({ field: 'fullName', message: 'Full name is required' });
  if (!EMAIL_PATTERN.test(normalizeEmail(input.email))) errors.push({ field: 'email', message: 'Valid email is required' });
  if (!input.phone || !String(input.phone).trim()) errors.push({ field: 'phone', message: 'Phone is required' });
  if (!input.address || !String(input.address).trim()) errors.push({ field: 'address', message: 'Address is required' });
  if (!input.password || String(input.password).length < 8) errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  if (errors.length) throw new ApiError(400, 'Invalid registration data', errors);
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
  jwtSecret = process.env.JWT_SECRET || 'greenhome-dev-secret',
} = {}) {
  return {
    async registerCustomer(input) {
      validateRegistration(input);

      const email = normalizeEmail(input.email);
      const existing = await userRepository.findByEmail(email);
      if (existing) {
        throw new ApiError(400, 'Email already exists');
      }

      const customerRole = await roleRepository.findByName('Customer');
      if (!customerRole) {
        throw new ApiError(500, 'Customer role is not configured');
      }

      const passwordHash = await hashPassword(input.password);
      const created = await userRepository.create({
        fullName: String(input.fullName).trim(),
        email,
        phone: String(input.phone).trim(),
        address: String(input.address).trim(),
        passwordHash,
        roleId: customerRole._id,
        role: customerRole,
        status: 'Active',
      });
      const role = resolveUserRole(created, customerRole);

      await auditLogger.log({
        userId: created._id,
        action: 'AUTH_REGISTER',
        targetEntity: 'User',
        targetId: String(created._id),
        description: `Customer account registered for ${email}`,
      });

      return {
        user: toPublicUser(created, role),
      };
    },

    async login(input) {
      const email = normalizeEmail(input.email);
      const user = await userRepository.findByEmail(email);
      if (!user) {
        throw new ApiError(401, 'Invalid email or password');
      }
      if (user.status === 'Disabled') {
        throw new ApiError(403, 'Account is disabled');
      }

      const passwordMatches = await comparePassword(input.password || '', user.passwordHash);
      if (!passwordMatches) {
        throw new ApiError(401, 'Invalid email or password');
      }

      const role = resolveUserRole(user);
      const publicUser = toPublicUser(user, role);
      const token = signAuthToken({ ...user, role }, jwtSecret);

      await auditLogger.log({
        userId: user._id,
        action: 'AUTH_LOGIN_SUCCESS',
        targetEntity: 'User',
        targetId: String(user._id),
        description: `User logged in as ${role.roleName}`,
      });

      return {
        token,
        user: publicUser,
      };
    },
  };
}

module.exports = {
  createAuthService,
  authService: createAuthService(),
};
