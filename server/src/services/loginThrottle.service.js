const ApiError = require('../utils/apiError');
const LoginAttempt = require('../models/loginAttempt.model');
const LoginThrottleBucket = require('../models/loginThrottleBucket.model');
const crypto = require('node:crypto');

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
      await LoginThrottleBucket.deleteOne({ _id: `email:${key}` });
    },
    async claim({ kind, key, since, limit, createdAt, expiresAt }) {
      const claimToken = crypto.randomUUID();
      const update = [
        {
          $set: {
            kind,
            key,
            attempts: {
              $filter: {
                input: { $ifNull: ['$attempts', []] },
                as: 'attempt',
                cond: { $gte: ['$$attempt', since] },
              },
            },
          },
        },
        {
          $set: {
            lastClaimToken: {
              $cond: [
                { $lt: [{ $size: '$attempts' }, limit] },
                claimToken,
                null,
              ],
            },
            attempts: {
              $cond: [
                { $lt: [{ $size: '$attempts' }, limit] },
                { $concatArrays: ['$attempts', [createdAt]] },
                '$attempts',
              ],
            },
            expiresAt,
          },
        },
      ];
      const execute = () => LoginThrottleBucket.findOneAndUpdate(
        { _id: `${kind}:${key}` },
        update,
        { upsert: true, new: true, setDefaultsOnInsert: false }
      ).lean();
      let bucket;
      try {
        bucket = await execute();
      } catch (error) {
        if (error?.code !== 11000) throw error;
        bucket = await execute();
      }
      return bucket?.lastClaimToken === claimToken;
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
  async function claim(kind, key, limit, errorCode) {
    const current = now();
    const allowed = await repository.claim({
      kind,
      key,
      since: new Date(current.getTime() - windowMs),
      limit,
      createdAt: current,
      expiresAt: new Date(current.getTime() + windowMs),
    });
    if (!allowed) {
      throw throttleError(errorCode, new Date(current.getTime() + windowMs));
    }
  }

  return {
    async claimAttempt({ ip }) {
      return claim('ip', String(ip || ''), ipLimit, 'LOGIN_IP_THROTTLED');
    },
    async claimFailure({ email }) {
      return claim(
        'email',
        normalizeEmail(email),
        emailLimit,
        'LOGIN_EMAIL_THROTTLED'
      );
    },
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

module.exports = {
  createLoginThrottleService,
  createModelRepository,
  loginThrottleService: createLoginThrottleService(),
  normalizeEmail,
};
