const crypto = require('node:crypto');
const ApiError = require('../utils/apiError');
const User = require('../models/user.model');
const UserSession = require('../models/userSession.model');
const { assertSingleApprovedRole } = require('../config/roleMatrix');

const IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashSessionSelector(selector) {
  return crypto.createHash('sha256').update(String(selector || '')).digest('hex');
}

function publicUser(user, roleName) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber || '',
    avatarUrl: user.avatarUrl || '',
    status: user.status,
    role: roleName,
  };
}

function createModelSessionRepository() {
  return {
    async create(data, session) {
      const [created] = await UserSession.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async findBySelectorHash(selectorHash) {
      return UserSession.findOne({ selectorHash }).select('+csrfSecret').lean();
    },
    async touch(id, lastSeenAt, idleExpiresAt) {
      return UserSession.findByIdAndUpdate(id, { $set: { lastSeenAt, idleExpiresAt } }, { new: true }).select('+csrfSecret').lean();
    },
    async revoke(id, revokedAt, reason, session) {
      const query = UserSession.findOneAndUpdate(
        { _id: id, revokedAt: null },
        { $set: { revokedAt, revokeReason: reason } },
        { new: true }
      );
      return (session ? query.session(session) : query).select('+csrfSecret').lean();
    },
    async revokeAllForUser(userId, revokedAt, reason, session) {
      const query = UserSession.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt, revokeReason: reason } }
      );
      const result = await (session ? query.session(session) : query);
      return result.modifiedCount;
    },
  };
}

function createModelUserRepository() {
  return {
    async findById(id) {
      return User.findById(id).populate('roleId').lean();
    },
  };
}

function sessionError(statusCode, message, errorCode) {
  return new ApiError(statusCode, message, [], errorCode);
}

function createSessionService({
  sessionRepository = createModelSessionRepository(),
  userRepository = createModelUserRepository(),
  now = () => new Date(),
  selectorGenerator = () => crypto.randomBytes(32).toString('base64url'),
  csrfSecretGenerator = () => crypto.randomBytes(32).toString('base64url'),
  idleTtlMs = IDLE_TTL_MS,
  absoluteTtlMs = ABSOLUTE_TTL_MS,
} = {}) {
  return {
    async createSession({ userId, roleName, ip = '', userAgent = '', mongoSession = null }) {
      let currentRole = roleName;
      if (!currentRole) {
        const user = await userRepository.findById(userId);
        currentRole = assertSingleApprovedRole(user?.roleId || user?.role);
      } else {
        currentRole = assertSingleApprovedRole(currentRole);
      }
      const createdAt = now();
      const absoluteExpiresAt = new Date(createdAt.getTime() + absoluteTtlMs);
      const idleExpiresAt = new Date(Math.min(createdAt.getTime() + idleTtlMs, absoluteExpiresAt.getTime()));
      const selector = selectorGenerator();
      const created = await sessionRepository.create({
        userId,
        selectorHash: hashSessionSelector(selector),
        csrfSecret: csrfSecretGenerator(),
        roleAtCreation: currentRole,
        lastSeenAt: createdAt,
        idleExpiresAt,
        absoluteExpiresAt,
        revokedAt: null,
        revokeReason: '',
        ip,
        userAgent,
        createdAt,
      }, mongoSession);
      return { selector, session: created };
    },

    async authenticate(selector) {
      if (!selector) throw sessionError(401, 'Phiên đăng nhập không hợp lệ.', 'SESSION_MISSING');
      const session = await sessionRepository.findBySelectorHash(hashSessionSelector(selector));
      if (!session) throw sessionError(401, 'Phiên đăng nhập không hợp lệ.', 'SESSION_INVALID');
      if (session.revokedAt) throw sessionError(401, 'Phiên đăng nhập đã bị thu hồi.', 'SESSION_REVOKED');
      const current = now();
      if (new Date(session.idleExpiresAt) <= current || new Date(session.absoluteExpiresAt) <= current) {
        throw sessionError(401, 'Phiên đăng nhập đã hết hạn.', 'SESSION_EXPIRED');
      }
      const user = await userRepository.findById(session.userId);
      if (!user || user.status !== 'Active') {
        throw sessionError(401, 'Tài khoản không còn hiệu lực.', 'SESSION_ACCOUNT_INVALID');
      }
      let roleName;
      try {
        roleName = assertSingleApprovedRole(user.roleId || user.role);
      } catch (_error) {
        throw sessionError(403, 'Dữ liệu vai trò không hợp lệ.', 'ROLE_INTEGRITY_INVALID');
      }
      if (roleName !== session.roleAtCreation) {
        throw sessionError(401, 'Quyền tài khoản đã thay đổi. Vui lòng đăng nhập lại.', 'SESSION_ROLE_STALE');
      }
      const idleExpiresAt = new Date(Math.min(
        current.getTime() + idleTtlMs,
        new Date(session.absoluteExpiresAt).getTime()
      ));
      const touched = await sessionRepository.touch(session._id, current, idleExpiresAt);
      return {
        user: publicUser(user, roleName),
        session: {
          ...touched,
          id: String(session._id),
          csrfSecret: session.csrfSecret,
        },
      };
    },

    async revokeCurrent(selector, reason = 'LOGOUT', mongoSession = null) {
      const current = now();
      const existing = await sessionRepository.findBySelectorHash(hashSessionSelector(selector));
      if (!existing || existing.revokedAt) return { alreadyProcessed: true };
      const revoked = await sessionRepository.revoke(existing._id, current, reason, mongoSession);
      return { alreadyProcessed: !revoked };
    },

    async revokeAllForUser(userId, reason, mongoSession = null) {
      const revokedCount = await sessionRepository.revokeAllForUser(userId, now(), reason, mongoSession);
      return { revokedCount };
    },
  };
}

module.exports = {
  ABSOLUTE_TTL_MS,
  IDLE_TTL_MS,
  createSessionService,
  hashSessionSelector,
  sessionService: createSessionService(),
};
