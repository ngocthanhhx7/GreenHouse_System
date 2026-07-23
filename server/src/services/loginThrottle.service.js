const ApiError = require('../utils/apiError');
const LoginAttempt = require('../models/loginAttempt.model');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function createModelRepository() {
  return {
    async count({ kind, key, since }) {
      return LoginAttempt.countDocuments({ kind, key, createdAt: { $gte: since } });
    },
    async record(entry) {
      await LoginAttempt.create(entry);
    },
    async clearEmail(key) {
      await LoginAttempt.deleteMany({ kind: 'email', key });
    },
  };
}

function throttleError(errorCode, retryAt) {
  return new ApiError(
    429,
    'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.',
    [],
    errorCode,
    { retryAt }
  );
}

function createLoginThrottleService({
  repository = createModelRepository(),
  now = () => new Date(),
  windowMs = 15 * 60 * 1000,
  emailLimit = 5,
  ipLimit = 30,
} = {}) {
  return {
    async assertAllowed({ email, ip }) {
      const current = now();
      const since = new Date(current.getTime() - windowMs);
      const [emailCount, ipCount] = await Promise.all([
        repository.count({ kind: 'email', key: normalizeEmail(email), since }),
        repository.count({ kind: 'ip', key: String(ip || ''), since }),
      ]);
      const retryAt = new Date(current.getTime() + windowMs);
      if (emailCount >= emailLimit) throw throttleError('LOGIN_EMAIL_THROTTLED', retryAt);
      if (ipCount >= ipLimit) throw throttleError('LOGIN_IP_THROTTLED', retryAt);
    },
    async recordAttempt({ ip }) {
      await repository.record({ kind: 'ip', key: String(ip || ''), createdAt: now() });
    },
    async recordFailure({ email, ip }) {
      const createdAt = now();
      await repository.record({ kind: 'email', key: normalizeEmail(email), createdAt });
    },
    async clearEmail(email) {
      await repository.clearEmail(normalizeEmail(email));
    },
  };
}

module.exports = { createLoginThrottleService, loginThrottleService: createLoginThrottleService(), normalizeEmail };
